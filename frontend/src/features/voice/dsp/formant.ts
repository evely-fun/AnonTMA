import { DSP_KERNEL } from "./kernel";

/**
 * A phase vocoder that separates what is said from who is saying it.
 *
 * The granular shifter this replaces moved the whole spectrum at once, so a
 * lowered voice was a slowed tape and a raised one was a chipmunk: the vocal
 * tract appeared to change size along with the pitch, which no real body does.
 *
 * Here the spectral envelope is lifted out with a cepstrum, the excitation
 * underneath it is shifted on its own, the envelope is warped on its own, and
 * the two are multiplied back together. A pitch below one with an envelope
 * above one is a larger person; the reverse is a smaller one. That pair is
 * what a mask needs, and it is the same separation Pedalboard and the WORLD
 * vocoder make.
 */
export const formantWorklet = `
${DSP_KERNEL}

const FRAME = 1024;
const HOP = 256;
const QUEFRENCY = 44;

class FormantVoice extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "pitch", defaultValue: 1, minValue: 0.4, maxValue: 2.5, automationRate: "k-rate" },
      { name: "formant", defaultValue: 1, minValue: 0.5, maxValue: 2, automationRate: "k-rate" },
      // Zeroing the phase every frame is what a robot is. It is the honest
      // version of the effect: no ring modulator, no carrier tone.
      { name: "robot", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "mix", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.overlap = new Overlap(FRAME, HOP);
    this.bins = (FRAME >> 1) + 1;
    this.cepstrum = new Spectrum(FRAME);

    this.envelope = new Float32Array(this.bins);
    this.warped = new Float32Array(this.bins);
    this.excitation = new Float32Array(this.bins);
    this.shifted = new Float32Array(this.bins);
    this.lastPhase = new Float32Array(this.bins);
    this.sumPhase = new Float32Array(this.bins);
    this.frequency = new Float32Array(this.bins);
    this.magnitudeOut = new Float32Array(this.bins);
    this.phaseOut = new Float32Array(this.bins);

    this.expected = (2 * Math.PI * HOP) / FRAME;
    this.ratio = FRAME / HOP;
    this.pitch = 1;
    this.formant = 1;
    this.robot = 0;

    this.transform = (magnitude, phase, bins) => this.shape(magnitude, phase, bins);
  }

  /**
   * The spectral envelope, by way of the real cepstrum: take the log of the
   * magnitudes, transform, keep only the slow part, transform back. What
   * survives is the shape of the vocal tract with the pitch lines removed.
   */
  describeEnvelope(magnitude, bins) {
    const size = FRAME;
    const spectrum = this.cepstrum;

    for (let bin = 0; bin < bins; bin += 1) {
      const value = Math.log(magnitude[bin] + 1e-8);
      spectrum.real[bin] = value;
      spectrum.imag[bin] = 0;
      if (bin > 0 && bin < size - bin) {
        spectrum.real[size - bin] = value;
        spectrum.imag[size - bin] = 0;
      }
    }
    spectrum.forward();

    for (let index = QUEFRENCY; index < size - QUEFRENCY; index += 1) {
      spectrum.real[index] = 0;
      spectrum.imag[index] = 0;
    }
    spectrum.inverse();

    for (let bin = 0; bin < bins; bin += 1) {
      const value = Math.exp(spectrum.real[bin]);
      this.envelope[bin] = value > 1e-8 ? value : 1e-8;
    }
  }

  shape(magnitude, phase, bins) {
    const pitch = this.pitch;
    const formant = this.formant;

    this.describeEnvelope(magnitude, bins);

    // Flatten: what is left once the vocal tract is divided out is the buzz of
    // the cords, which is the part that carries pitch.
    for (let bin = 0; bin < bins; bin += 1) {
      this.excitation[bin] = magnitude[bin] / this.envelope[bin];
      this.shifted[bin] = 0;
      this.frequency[bin] = 0;
    }

    // True frequency of each bin from how far its phase moved since the last
    // hop. Shifting on this rather than on the bin index is what keeps a
    // shifted voice from sounding like it is underwater.
    for (let bin = 0; bin < bins; bin += 1) {
      const delta = phase[bin] - this.lastPhase[bin];
      this.lastPhase[bin] = phase[bin];

      let wrapped = delta - bin * this.expected;
      let turns = Math.round(wrapped / Math.PI);
      wrapped -= Math.PI * turns;
      const deviation = (this.ratio * wrapped) / (2 * Math.PI);
      this.frequency[bin] = bin + deviation;
    }

    // Move the excitation and its frequencies onto their new bins, keeping the
    // loudest contribution where two land on the same one.
    for (let bin = 0; bin < bins; bin += 1) {
      const target = Math.round(bin * pitch);
      if (target < 0 || target >= bins) {
        continue;
      }
      const level = this.excitation[bin];
      if (level > this.shifted[target]) {
        this.shifted[target] = level;
        this.frequency[target] = this.frequency[bin] * pitch;
      }
    }

    // Warp the vocal tract on its own. Reading the envelope from a lower bin
    // stretches it upward, which is a smaller head, and the reverse is a
    // larger one.
    for (let bin = 0; bin < bins; bin += 1) {
      const source = bin / formant;
      const lower = Math.floor(source);
      if (lower >= bins - 1) {
        this.warped[bin] = this.envelope[bins - 1];
        continue;
      }
      const fraction = source - lower;
      this.warped[bin] = this.envelope[lower] * (1 - fraction) + this.envelope[lower + 1] * fraction;
    }

    for (let bin = 0; bin < bins; bin += 1) {
      const level = this.shifted[bin] * this.warped[bin];
      this.magnitudeOut[bin] = level === level ? level : 0;

      if (this.robot > 0.5) {
        this.sumPhase[bin] = 0;
      } else {
        const deviation = this.frequency[bin] - bin;
        const advance = bin * this.expected + (2 * Math.PI * deviation) / this.ratio;
        this.sumPhase[bin] += advance;
        if (this.sumPhase[bin] > Math.PI * 1e5 || this.sumPhase[bin] < -Math.PI * 1e5) {
          // Wrapping keeps the accumulator from drifting into the range where
          // a float can no longer tell one radian from the next.
          this.sumPhase[bin] = this.sumPhase[bin] % (2 * Math.PI);
        }
      }
      this.phaseOut[bin] = this.sumPhase[bin];
    }

    for (let bin = 0; bin < bins; bin += 1) {
      magnitude[bin] = this.magnitudeOut[bin];
      phase[bin] = this.phaseOut[bin];
    }
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

    const pitch = parameters.pitch[0];
    const formant = parameters.formant[0];
    const robot = parameters.robot[0];
    const mix = parameters.mix[0];

    const idle = Math.abs(pitch - 1) < 0.005 && Math.abs(formant - 1) < 0.005 && robot < 0.5;
    if (idle || mix <= 0.005) {
      output.set(input);
      return true;
    }

    this.pitch = pitch;
    this.formant = formant;
    this.robot = robot;
    this.overlap.run(input, output, this.transform);

    if (mix < 0.995) {
      for (let index = 0; index < output.length; index += 1) {
        output[index] = output[index] * mix + input[index] * (1 - mix);
      }
    }
    return true;
  }
}

registerProcessor("formant-voice", FormantVoice);
`;
