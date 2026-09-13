export const suppressorWorklet = `
const FLOOR_MIN = 0.0008;
const FLOOR_MAX = 0.02;

class AdaptiveSuppressor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "threshold", defaultValue: 2.2, minValue: 1, maxValue: 12 },
      { name: "ratio", defaultValue: 4, minValue: 1, maxValue: 24 },
      { name: "attack", defaultValue: 0.006, minValue: 0.001, maxValue: 0.2 },
      { name: "release", defaultValue: 0.14, minValue: 0.02, maxValue: 1.2 },
      { name: "floorGain", defaultValue: 0.04, minValue: 0, maxValue: 1 },
      { name: "bypass", defaultValue: 0, minValue: 0, maxValue: 1 },
    ];
  }

  constructor() {
    super();
    this.noiseFloor = 0.002;
    this.envelope = 0;
    this.gain = 1;
    this.holdBlocks = 0;
    this.frame = 0;
    this.reportedLevel = -1;
    this.gatedBlocks = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }
    if (!input || input.length === 0 || !input[0]) {
      for (let channel = 0; channel < output.length; channel += 1) {
        output[channel].fill(0);
      }
      return true;
    }

    const bypass = parameters.bypass[0] > 0.5;
    const threshold = parameters.threshold[0];
    const ratio = parameters.ratio[0];
    const attack = parameters.attack[0];
    const release = parameters.release[0];
    const floorGain = parameters.floorGain[0];

    const blockSize = input[0].length;
    const holdBlocksTotal = Math.max(4, Math.round((release * sampleRate) / blockSize));
    const attackCoefficient = Math.exp(-1 / (sampleRate * attack));
    const releaseCoefficient = Math.exp(-1 / (sampleRate * release));

    let sumSquares = 0;
    for (let channel = 0; channel < input.length; channel += 1) {
      const samples = input[channel];
      for (let index = 0; index < blockSize; index += 1) {
        sumSquares += samples[index] * samples[index];
      }
    }
    const rms = Math.sqrt(sumSquares / (blockSize * input.length)) || 0;

    this.envelope =
      rms > this.envelope
        ? attackCoefficient * this.envelope + (1 - attackCoefficient) * rms
        : releaseCoefficient * this.envelope + (1 - releaseCoefficient) * rms;

    const speechRatio = this.envelope / Math.max(this.noiseFloor, 1e-6);
    const isSpeech = speechRatio > threshold;

    if (isSpeech) {
      this.holdBlocks = holdBlocksTotal;
    } else if (this.holdBlocks > 0) {
      this.holdBlocks -= 1;
    }

    // The floor only ever learns from quiet blocks. Letting it climb while
    // someone is talking made it converge on their own voice, after which
    // nothing ever cleared the threshold again and the channel went mute for
    // the rest of the call.
    if (!isSpeech && this.holdBlocks === 0) {
      const rising = this.envelope > this.noiseFloor;
      const coefficient = rising ? 0.0006 : 0.02;
      this.noiseFloor = this.noiseFloor * (1 - coefficient) + this.envelope * coefficient;
      this.noiseFloor = Math.min(FLOOR_MAX, Math.max(FLOOR_MIN, this.noiseFloor));
    }

    let targetGain = 1;
    if (!bypass && this.holdBlocks === 0) {
      const excess = Math.max(speechRatio / threshold, 1e-6);
      targetGain = Math.min(1, Math.max(floorGain, Math.pow(excess, ratio - 1)));
    }

    // A gate that has been shut for six seconds straight is misjudging the
    // room rather than hearing silence, so it reopens and relearns instead of
    // leaving the speaker inaudible.
    if (targetGain < 0.2) {
      this.gatedBlocks += 1;
      if (this.gatedBlocks > (6 * sampleRate) / blockSize) {
        this.noiseFloor = FLOOR_MIN;
        this.gatedBlocks = 0;
        targetGain = 1;
      }
    } else {
      this.gatedBlocks = 0;
    }

    const smoothing = targetGain < this.gain ? 0.2 : 0.4;
    this.gain += (targetGain - this.gain) * smoothing;

    for (let channel = 0; channel < output.length; channel += 1) {
      const samples = input[Math.min(channel, input.length - 1)];
      const target = output[channel];
      if (bypass) {
        target.set(samples);
        continue;
      }
      for (let index = 0; index < blockSize; index += 1) {
        target[index] = samples[index] * this.gain;
      }
    }

    this.frame += 1;
    if (this.frame % 6 === 0) {
      const level = Math.min(1, this.envelope * 14);
      if (Math.abs(level - this.reportedLevel) > 0.015) {
        this.reportedLevel = level;
        this.port.postMessage({ level, speaking: isSpeech || this.holdBlocks > 0 });
      }
    }

    return true;
  }
}

registerProcessor("adaptive-suppressor", AdaptiveSuppressor);
`;
