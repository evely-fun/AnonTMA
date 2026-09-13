export const pitchWorklet = `
class GranularPitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "pitch", defaultValue: 1, minValue: 0.35, maxValue: 2.6, automationRate: "k-rate" },
      { name: "mix", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.size = 16384;
    this.mask = this.size - 1;
    this.buffer = new Float32Array(this.size);
    this.write = 0;
    this.phase = 0;
    this.grain = 2048;
  }

  sample(position) {
    const index = Math.floor(position);
    const fraction = position - index;
    const a = this.buffer[index & this.mask];
    const b = this.buffer[(index + 1) & this.mask];
    return a + (b - a) * fraction;
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
    const mix = parameters.mix[0];

    if (Math.abs(pitch - 1) < 0.001 || mix <= 0.001) {
      output.set(input);
      for (let index = 0; index < input.length; index += 1) {
        this.buffer[this.write & this.mask] = input[index];
        this.write += 1;
      }
      return true;
    }

    const grain = this.grain;
    const step = pitch - 1;

    for (let index = 0; index < input.length; index += 1) {
      this.buffer[this.write & this.mask] = input[index];
      this.write += 1;

      this.phase -= step;
      if (this.phase >= grain) {
        this.phase -= grain;
      } else if (this.phase < 0) {
        this.phase += grain;
      }

      const first = this.phase;
      const second = (this.phase + grain * 0.5) % grain;
      const angle = (Math.PI * first) / grain;
      const gainA = Math.sin(angle);
      const gainB = Math.abs(Math.cos(angle));

      const shifted =
        this.sample(this.write - 1 - first) * gainA + this.sample(this.write - 1 - second) * gainB;

      const value = shifted * mix + input[index] * (1 - mix);
      output[index] = value === value ? value : 0;
    }

    return true;
  }
}

registerProcessor("granular-pitch", GranularPitchProcessor);
`;
