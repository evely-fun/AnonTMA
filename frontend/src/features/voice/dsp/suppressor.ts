import { DSP_KERNEL } from "./kernel";

/**
 * Spectral noise suppression, in the shape DeepFilterNet and RNNoise use: the
 * spectrum is grouped into perceptual bands, a noise level is tracked inside
 * every band, and every band gets its own gain.
 *
 * The gate this replaces could only duck the whole signal between words, so a
 * fan or a street stayed in the recording for as long as somebody was talking
 * over it. Tracking noise per band, and keeping that tracking alive while
 * speech is present, is the difference: the fan is attenuated in the bands the
 * fan occupies while the voice keeps the bands the voice occupies.
 *
 * No weights and no model. A network would be better still and cannot run in a
 * Telegram webview on a mid range phone, which is the machine this has to hold
 * up on.
 */
export const suppressorWorklet = `
${DSP_KERNEL}

const FRAME = 512;
const HOP = 128;
const BANDS = 24;
const FLOOR_FLOAT = 1e-10;

// How fast a band's noise estimate is allowed to move. Rising slowly keeps a
// held vowel from being learnt as noise; falling quickly lets the estimate
// follow a door closing rather than gating for the next two seconds.
const NOISE_FALL = 0.06;
const NOISE_RISE = 0.02;
// Minimum statistics over four windows of a quarter second each. One window on
// its own can sit entirely inside a held vowel; a second of history cannot,
// because nobody speaks for a second without a gap in the band.
const MINIMUM_WINDOW = 96;
const MINIMUM_SLOTS = 4;
// A minimum is a biased estimate of a mean: noise wanders below its average as
// often as above it, and the lowest sample of a window sits well under the
// level the band actually sits at. This puts that bias back.
const MINIMUM_BIAS = 2.4;
// Band power out of a single frame is a very noisy number: a narrow band holds
// only a couple of bins, and the minimum of a couple of hundred samples of
// something that jumpy sits far below the level the band really sits at.
// Smoothing first is what makes the minimum mean anything.
const POWER_SMOOTH = 0.9;

class SpectralSuppressor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // The deepest a band may be pushed. This is what decides whether the
      // result sounds clean or sounds like a swimming pool.
      { name: "floorGain", defaultValue: 0.12, minValue: 0.01, maxValue: 1 },
      // Gain curve sharpness. Above one the suppressor is more aggressive than
      // a plain Wiener filter about bands it believes are noise.
      { name: "sharpness", defaultValue: 1.6, minValue: 1, maxValue: 4 },
      { name: "bypass", defaultValue: 0, minValue: 0, maxValue: 1 },
    ];
  }

  constructor() {
    super();
    this.overlap = new Overlap(FRAME, HOP);
    this.bins = (FRAME >> 1) + 1;
    this.edges = erbEdges(BANDS, this.bins, sampleRate);

    this.bandPower = new Float32Array(BANDS);
    this.smoothPower = new Float32Array(BANDS);
    this.noise = new Float32Array(BANDS);
    this.priorSnr = new Float32Array(BANDS);
    this.gain = new Float32Array(BANDS);
    this.smoothed = new Float32Array(BANDS);
    this.minimum = new Float32Array(BANDS);
    this.history = new Float32Array(BANDS * MINIMUM_SLOTS);
    this.slot = 0;
    this.binGain = new Float32Array(this.bins);
    this.frames = 0;
    this.holdFrames = 0;
    this.reportedLevel = -1;
    this.speaking = false;
    this.envelope = 0;

    this.noise.fill(1e-6);
    this.minimum.fill(1e-6);
    this.history.fill(Infinity);
    this.priorSnr.fill(1);
    this.gain.fill(1);
    this.smoothed.fill(1);

    // Speech lives roughly between three hundred and three and a half
    // thousand hertz. The voice detector only looks there, so a lorry outside
    // does not read as somebody talking.
    this.speechFrom = 0;
    this.speechTo = BANDS - 1;
    for (let band = 0; band < BANDS; band += 1) {
      const hz = (this.edges[band] / (this.bins - 1)) * (sampleRate / 2);
      if (hz <= 300) this.speechFrom = band;
      if (hz <= 3600) this.speechTo = band;
    }

    this.transform = (magnitude, phase, bins) => this.shape(magnitude, bins);
  }

  shape(magnitude, bins) {
    const bands = BANDS;
    const edges = this.edges;

    for (let band = 0; band < bands; band += 1) {
      const from = edges[band];
      const to = Math.max(from + 1, edges[band + 1]);
      let sum = 0;
      for (let bin = from; bin < to; bin += 1) {
        sum += magnitude[bin] * magnitude[bin];
      }
      const power = sum / (to - from) + FLOOR_FLOAT;
      this.bandPower[band] = power;
      this.smoothPower[band] =
        this.frames === 0 ? power : this.smoothPower[band] * POWER_SMOOTH + power * (1 - POWER_SMOOTH);
    }

    // Minimum statistics. The quietest this band has been over the last second
    // cannot be speech, whatever a voice detector believes, so that is what the
    // noise estimate is allowed to climb towards. Speech raises the power of a
    // band; it cannot raise the band's minimum, which is what makes this immune
    // to the feedback loop that ends with a held vowel being learnt as the room
    // and the speaker filtered out of their own call.
    const rotate = this.frames % MINIMUM_WINDOW === 0;
    if (rotate) {
      this.slot = (this.slot + 1) % MINIMUM_SLOTS;
      for (let band = 0; band < bands; band += 1) {
        this.history[band * MINIMUM_SLOTS + this.slot] = this.smoothPower[band];
      }
    }

    for (let band = 0; band < bands; band += 1) {
      const power = this.bandPower[band];
      const tracked = this.smoothPower[band];
      const base = band * MINIMUM_SLOTS;
      if (tracked < this.history[base + this.slot]) {
        this.history[base + this.slot] = tracked;
      }

      let lowest = Infinity;
      for (let index = 0; index < MINIMUM_SLOTS; index += 1) {
        const value = this.history[base + index];
        if (value < lowest) lowest = value;
      }
      this.minimum[band] = lowest === Infinity ? power : lowest;

      const noise = this.noise[band];
      const floor = this.minimum[band] * MINIMUM_BIAS;
      // Fall to anything quieter than the estimate straight away; rise only
      // towards the floor the minimum implies, never towards whatever happens
      // to be loud in this frame.
      const wanted = power < noise ? power : floor > noise ? floor : noise;
      const rate = power < noise ? NOISE_FALL : NOISE_RISE;
      this.noise[band] = noise + (wanted - noise) * rate;
      if (this.noise[band] < FLOOR_FLOAT) {
        this.noise[band] = FLOOR_FLOAT;
      }
    }

    const floorGain = this.floorGain;
    const sharpness = this.sharpness;
    let speechSnr = 0;
    let speechBands = 0;

    for (let band = 0; band < bands; band += 1) {
      const power = this.bandPower[band];
      const noise = this.noise[band];
      const posterior = power / noise;

      // Decision directed a priori signal to noise, the Ephraim and Malah
      // estimator: mostly what the last frame turned out to be, corrected by
      // what this frame looks like. It is what stops the gains from chattering
      // frame to frame, which is what musical noise actually is.
      const previous = this.gain[band] * this.gain[band] * this.priorSnr[band];
      const instant = posterior - 1;
      const prior = 0.94 * previous + 0.06 * (instant > 0 ? instant : 0);
      this.priorSnr[band] = prior < 1e-6 ? 1e-6 : prior;

      let wiener = prior / (1 + prior);
      if (sharpness !== 1) {
        wiener = Math.pow(wiener, sharpness);
      }
      this.gain[band] = wiener < floorGain ? floorGain : wiener > 1 ? 1 : wiener;

      if (band >= this.speechFrom && band <= this.speechTo) {
        speechSnr += posterior;
        speechBands += 1;
      }
    }

    // One pass of smoothing across neighbours. A gain that differs sharply
    // from both its neighbours is a decision about one band that the ear will
    // hear as a whistle.
    for (let band = 0; band < bands; band += 1) {
      const left = this.gain[band > 0 ? band - 1 : 0];
      const right = this.gain[band < bands - 1 ? band + 1 : bands - 1];
      const blended = 0.25 * left + 0.5 * this.gain[band] + 0.25 * right;
      this.smoothed[band] += (blended - this.smoothed[band]) * 0.5;
    }

    // Spread the band gains back over the bins, interpolating so no bin sits
    // on a step between two bands.
    for (let band = 0; band < bands; band += 1) {
      const from = edges[band];
      const to = Math.max(from + 1, edges[band + 1]);
      const here = this.smoothed[band];
      const next = this.smoothed[band < bands - 1 ? band + 1 : band];
      const span = to - from;
      for (let bin = from; bin < to; bin += 1) {
        const ratio = (bin - from) / span;
        this.binGain[bin] = here + (next - here) * ratio;
      }
    }
    this.binGain[bins - 1] = this.smoothed[bands - 1];

    for (let bin = 0; bin < bins; bin += 1) {
      magnitude[bin] *= this.binGain[bin];
    }

    const mean = speechBands > 0 ? speechSnr / speechBands : 0;
    this.speaking = mean > 2.6;
    this.frames += 1;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0] && outputs[0][0];
    if (!output) {
      return true;
    }
    const input = inputs[0] && inputs[0][0];
    if (!input) {
      output.fill(0);
      return true;
    }

    if (parameters.bypass[0] > 0.5) {
      output.set(input);
      this.meter(input);
      return true;
    }

    this.floorGain = parameters.floorGain[0];
    this.sharpness = parameters.sharpness[0];
    this.overlap.run(input, output, this.transform);
    this.meter(input);
    return true;
  }

  /** The level the interface draws is the microphone, not the output. */
  meter(input) {
    let sum = 0;
    for (let index = 0; index < input.length; index += 1) {
      sum += input[index] * input[index];
    }
    const rms = Math.sqrt(sum / input.length) || 0;
    this.envelope += (rms - this.envelope) * (rms > this.envelope ? 0.4 : 0.08);

    if (this.speaking) {
      this.holdFrames = 24;
    } else if (this.holdFrames > 0) {
      this.holdFrames -= 1;
    }

    const level = Math.min(1, this.envelope * 14);
    if (Math.abs(level - this.reportedLevel) > 0.015) {
      this.reportedLevel = level;
      this.port.postMessage({ level, speaking: this.speaking || this.holdFrames > 0 });
    }
  }
}

registerProcessor("spectral-suppressor", SpectralSuppressor);
`;
