export const suppressorWorklet = `
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
    this.noiseFloor = 0.004;
    this.envelope = 0;
    this.gain = 1;
    this.speechHold = 0;
    this.frame = 0;
    this.reportedLevel = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const bypass = parameters.bypass[0] > 0.5;
    const threshold = parameters.threshold[0];
    const ratio = parameters.ratio[0];
    const attack = parameters.attack[0];
    const release = parameters.release[0];
    const floorGain = parameters.floorGain[0];

    const blockSize = input[0].length;
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
      this.speechHold = 8;
    } else if (this.speechHold > 0) {
      this.speechHold -= 1;
    }

    if (!isSpeech && this.speechHold === 0) {
      this.noiseFloor = this.noiseFloor * 0.995 + this.envelope * 0.005;
    } else {
      this.noiseFloor = Math.min(this.noiseFloor * 1.0002, 0.08);
    }

    let targetGain = 1;
    if (!bypass && this.speechHold === 0) {
      const excess = Math.max(speechRatio / threshold, 1e-6);
      targetGain = Math.pow(excess, ratio - 1);
      targetGain = Math.min(1, Math.max(floorGain, targetGain));
    }

    const smoothing = targetGain < this.gain ? 0.35 : 0.12;
    this.gain += (targetGain - this.gain) * smoothing;

    for (let channel = 0; channel < input.length; channel += 1) {
      const samples = input[channel];
      const target = output[channel];
      for (let index = 0; index < blockSize; index += 1) {
        target[index] = bypass ? samples[index] : samples[index] * this.gain;
      }
    }

    this.frame += 1;
    if (this.frame % 6 === 0) {
      const level = Math.min(1, this.envelope * 14);
      if (Math.abs(level - this.reportedLevel) > 0.015 || level === 0) {
        this.reportedLevel = level;
        this.port.postMessage({ level, speaking: isSpeech || this.speechHold > 0 });
      }
    }

    return true;
  }
}

registerProcessor("adaptive-suppressor", AdaptiveSuppressor);
`;
