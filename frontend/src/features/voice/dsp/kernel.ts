/**
 * The shared signal kernel both voice worklets are built on.
 *
 * It is a string rather than a module because a worklet is loaded from a Blob
 * URL: a Telegram webview will not fetch a separate script off our origin
 * reliably, and inlining keeps the processor immune to the page's CSP.
 *
 * Everything here allocates once. A processor that allocates inside process()
 * hands the collector work to do on the audio thread, and a collection that
 * lands mid block is a click in somebody's ear.
 */
export const DSP_KERNEL = `
// Iterative radix-2 FFT over a preallocated pair of planes. Table driven, so
// the twiddles are computed once at construction rather than per block.
class Spectrum {
  constructor(size) {
    this.size = size;
    this.half = size >> 1;
    this.real = new Float32Array(size);
    this.imag = new Float32Array(size);
    this.cos = new Float32Array(this.half);
    this.sin = new Float32Array(this.half);
    this.reverse = new Uint16Array(size);

    for (let index = 0; index < this.half; index += 1) {
      const angle = (-2 * Math.PI * index) / size;
      this.cos[index] = Math.cos(angle);
      this.sin[index] = Math.sin(angle);
    }

    const bits = Math.round(Math.log2(size));
    for (let index = 0; index < size; index += 1) {
      let mirrored = 0;
      for (let bit = 0; bit < bits; bit += 1) {
        mirrored = (mirrored << 1) | ((index >> bit) & 1);
      }
      this.reverse[index] = mirrored;
    }
  }

  /** In place forward transform of whatever is currently in the planes. */
  forward() {
    this.run(1);
  }

  /** In place inverse, scaled so a forward followed by an inverse is identity. */
  inverse() {
    this.run(-1);
    const scale = 1 / this.size;
    for (let index = 0; index < this.size; index += 1) {
      this.real[index] *= scale;
      this.imag[index] *= scale;
    }
  }

  run(sign) {
    const size = this.size;
    const real = this.real;
    const imag = this.imag;

    for (let index = 0; index < size; index += 1) {
      const mirrored = this.reverse[index];
      if (mirrored > index) {
        let swap = real[index];
        real[index] = real[mirrored];
        real[mirrored] = swap;
        swap = imag[index];
        imag[index] = imag[mirrored];
        imag[mirrored] = swap;
      }
    }

    for (let span = 2; span <= size; span <<= 1) {
      const halfSpan = span >> 1;
      const step = size / span;
      for (let start = 0; start < size; start += span) {
        for (let offset = 0; offset < halfSpan; offset += 1) {
          const twiddle = offset * step;
          const wr = this.cos[twiddle];
          const wi = sign * this.sin[twiddle];
          const a = start + offset;
          const b = a + halfSpan;
          const tr = real[b] * wr - imag[b] * wi;
          const ti = real[b] * wi + imag[b] * wr;
          real[b] = real[a] - tr;
          imag[b] = imag[a] - ti;
          real[a] += tr;
          imag[a] += ti;
        }
      }
    }
  }
}

/**
 * A windowed overlap-add frame machine.
 *
 * The worklet hands us 128 samples at a time; speech processing wants a few
 * hundred. This keeps one input ring and one output ring, runs the transform
 * once per hop, and hands back exactly 128 processed samples every call, so
 * the caller never sees the blocking.
 */
class Overlap {
  constructor(size, hop) {
    this.size = size;
    this.hop = hop;
    this.spectrum = new Spectrum(size);
    this.window = new Float32Array(size);
    this.input = new Float32Array(size);
    this.output = new Float32Array(size + hop);
    this.pending = new Float32Array(hop);
    this.filled = 0;
    this.readable = 0;
    this.magnitude = new Float32Array((size >> 1) + 1);
    this.phase = new Float32Array((size >> 1) + 1);

    // Periodic Hann on both ends. At three quarter overlap the squared window
    // sums to a constant 1.5, which is divided out on the way out.
    for (let index = 0; index < size; index += 1) {
      this.window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / size);
    }
    this.normal = 1 / (1.5 * (size / hop / 4));
  }

  /**
   * Pushes one block in and pulls the same number of samples out. transform is
   * called once per hop with the magnitude and phase planes filled in.
   */
  run(block, out, transform) {
    const size = this.size;
    const hop = this.hop;
    const count = block.length;

    for (let index = 0; index < count; index += 1) {
      this.pending[this.filled] = block[index];
      this.filled += 1;

      if (this.filled === hop) {
        this.filled = 0;
        this.step(transform);
      }

      out[index] = this.output[this.readable] * this.normal;
      this.output[this.readable] = 0;
      this.readable = (this.readable + 1) % (size + hop);
    }
  }

  step(transform) {
    const size = this.size;
    const hop = this.hop;

    // Slide the analysis window along and drop the new hop at the end.
    this.input.copyWithin(0, hop);
    this.input.set(this.pending, size - hop);

    const spectrum = this.spectrum;
    for (let index = 0; index < size; index += 1) {
      spectrum.real[index] = this.input[index] * this.window[index];
      spectrum.imag[index] = 0;
    }
    spectrum.forward();

    const bins = (size >> 1) + 1;
    for (let bin = 0; bin < bins; bin += 1) {
      const re = spectrum.real[bin];
      const im = spectrum.imag[bin];
      this.magnitude[bin] = Math.sqrt(re * re + im * im);
      this.phase[bin] = Math.atan2(im, re);
    }

    transform(this.magnitude, this.phase, bins);

    for (let bin = 0; bin < bins; bin += 1) {
      const level = this.magnitude[bin];
      const angle = this.phase[bin];
      const re = level * Math.cos(angle);
      const im = level * Math.sin(angle);
      spectrum.real[bin] = re;
      spectrum.imag[bin] = im;
      if (bin > 0 && bin < size - bin) {
        spectrum.real[size - bin] = re;
        spectrum.imag[size - bin] = -im;
      }
    }
    spectrum.inverse();

    // Overlap-add the windowed frame into the output ring.
    let cursor = this.readable;
    for (let index = 0; index < size; index += 1) {
      const value = spectrum.real[index] * this.window[index];
      this.output[cursor] += value === value ? value : 0;
      cursor = (cursor + 1) % (size + this.hop);
    }
  }
}

/**
 * Equivalent rectangular bandwidth band edges, which is how both RNNoise and
 * DeepFilterNet group bins: narrow where the ear is sharp, wide up top. Gains
 * are decided per band rather than per bin, so a decision is made on twenty
 * four numbers instead of two hundred and fifty seven, and neighbouring bins
 * cannot disagree and ring.
 */
const erbEdges = (bands, bins, sampleRate) => {
  const edges = new Uint16Array(bands + 1);
  const nyquist = sampleRate / 2;
  const toErb = (hz) => 21.4 * Math.log10(1 + 0.00437 * hz);
  const fromErb = (erb) => (Math.pow(10, erb / 21.4) - 1) / 0.00437;
  const top = toErb(nyquist);
  for (let band = 0; band <= bands; band += 1) {
    const hz = fromErb((top * band) / bands);
    const bin = Math.round((hz / nyquist) * (bins - 1));
    // Two bins minimum. A band holding a single bin is one number pretending
    // to be an average, and every estimate built on it inherits its variance.
    const lowest = band === 0 ? 0 : edges[band - 1] + 2;
    edges[band] = Math.min(bins - 1, Math.max(lowest, bin));
  }
  edges[bands] = bins - 1;
  return edges;
};
`;
