import { formantWorklet } from "./dsp/formant";

export type VoicePreset =
  | "natural"
  | "chipmunk"
  | "bass"
  | "robot"
  | "demon"
  | "radio"
  | "cave"
  | "underwater"
  | "alien";

interface PresetProfile {
  pitch: number;
  /** The size of the vocal tract, moved on its own. Below one is a larger
   *  head and a deeper resonance; above one is a smaller one. */
  formant?: number;
  /** Phase reset every frame, which is what a robot actually is. */
  robot?: boolean;
  ring?: number;
  drive?: number;
  bandpass?: { frequency: number; q: number };
  lowpass?: number;
  wobble?: { rate: number; depth: number };
  echo?: { time: number; feedback: number; wet: number };
  tilt?: { frequency: number; gain: number };
  gain?: number;
}

export const VOICE_PRESETS: VoicePreset[] = [
  "natural",
  "chipmunk",
  "bass",
  "robot",
  "demon",
  "radio",
  "cave",
  "underwater",
  "alien",
];

export const FREE_PRESETS: VoicePreset[] = ["natural"];

const PROFILES: Record<VoicePreset, PresetProfile> = {
  natural: { pitch: 1 },
  // Pitch and tract move together but not by the same amount: a smaller person
  // is not simply a faster tape, and the gap between the two factors is what
  // stops every mask from sounding like one.
  chipmunk: { pitch: 1.42, formant: 1.22 },
  bass: { pitch: 0.7, formant: 0.82, tilt: { frequency: 240, gain: 3 } },
  robot: { pitch: 1, formant: 1.04, robot: true, lowpass: 7500 },
  demon: { pitch: 0.62, formant: 0.72, tilt: { frequency: 200, gain: 4 }, lowpass: 6000 },
  radio: { pitch: 1.02, formant: 1.06, bandpass: { frequency: 1500, q: 1.4 }, drive: 26, gain: 1.2 },
  cave: { pitch: 0.95, formant: 0.9, echo: { time: 0.16, feedback: 0.44, wet: 0.5 }, lowpass: 5600 },
  underwater: { pitch: 0.88, formant: 0.94, lowpass: 780, wobble: { rate: 1.6, depth: 260 } },
  alien: { pitch: 1.24, formant: 1.35, wobble: { rate: 5.5, depth: 900 }, lowpass: 8200 },
};

const curve = (amount: number): Float32Array<ArrayBuffer> => {
  const samples = 1024;
  const shaped = new Float32Array(new ArrayBuffer(samples * 4));
  const factor = (Math.PI + amount) / Math.PI;
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / samples - 1;
    shaped[index] = ((1 + amount / 10) * x) / (1 + (amount / 10) * Math.abs(x));
    shaped[index] = Math.tanh(shaped[index] * factor);
  }
  return shaped;
};

export class VoiceChanger {
  private context: AudioContext | null = null;
  private input: GainNode | null = null;
  private output: GainNode | null = null;
  private pitch: AudioWorkletNode | null = null;
  private chain: AudioNode[] = [];
  private sources: (OscillatorNode | AudioScheduledSourceNode)[] = [];
  private moduleUrl: string | null = null;

  preset: VoicePreset = "natural";
  ready = false;

  async attach(context: AudioContext): Promise<{ input: AudioNode; output: AudioNode }> {
    this.context = context;
    this.input = context.createGain();
    this.output = context.createGain();

    try {
      const blob = new Blob([formantWorklet], { type: "application/javascript" });
      this.moduleUrl = URL.createObjectURL(blob);
      await context.audioWorklet.addModule(this.moduleUrl);
      this.pitch = new AudioWorkletNode(context, "formant-voice", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
    } catch {
      this.pitch = null;
    }

    this.ready = true;
    this.rebuild(this.preset);
    return { input: this.input, output: this.output };
  }

  setPreset(preset: VoicePreset): void {
    this.preset = preset;
    if (this.ready) {
      this.rebuild(preset);
    }
  }

  private teardown(): void {
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
    });
    this.sources = [];
    this.chain.forEach((node) => node.disconnect());
    this.chain = [];
    this.input?.disconnect();
    this.pitch?.disconnect();
  }

  private rebuild(preset: VoicePreset): void {
    const context = this.context;
    const input = this.input;
    const output = this.output;
    if (!context || !input || !output) {
      return;
    }

    this.teardown();
    const profile = PROFILES[preset];
    const now = context.currentTime;

    // Natural is the default and every extra node is another place the chain
    // can fail, so the plain preset is a direct wire from input to output.
    if (preset === "natural") {
      input.connect(output);
      return;
    }

    const formant = profile.formant ?? 1;
    this.pitch?.parameters.get("pitch")?.setValueAtTime(profile.pitch, now);
    this.pitch?.parameters.get("formant")?.setValueAtTime(formant, now);
    this.pitch?.parameters.get("robot")?.setValueAtTime(profile.robot ? 1 : 0, now);

    const shifts =
      Math.abs(profile.pitch - 1) > 0.005 || Math.abs(formant - 1) > 0.005 || Boolean(profile.robot);

    let node: AudioNode = input;
    if (this.pitch && shifts) {
      input.connect(this.pitch);
      node = this.pitch;
    }

    if (profile.bandpass) {
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = profile.bandpass.frequency;
      filter.Q.value = profile.bandpass.q;
      node.connect(filter);
      this.chain.push(filter);
      node = filter;
    }

    if (profile.tilt) {
      const filter = context.createBiquadFilter();
      filter.type = profile.tilt.frequency > 1200 ? "highshelf" : "lowshelf";
      filter.frequency.value = profile.tilt.frequency;
      filter.gain.value = profile.tilt.gain;
      node.connect(filter);
      this.chain.push(filter);
      node = filter;
    }

    if (profile.ring) {
      const modulated = context.createGain();
      modulated.gain.value = 0.35;
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = profile.ring;
      const depth = context.createGain();
      depth.gain.value = 0.65;
      oscillator.connect(depth);
      depth.connect(modulated.gain);
      oscillator.start();
      node.connect(modulated);
      this.sources.push(oscillator);
      this.chain.push(modulated, depth);
      node = modulated;
    }

    if (profile.drive) {
      const shaper = context.createWaveShaper();
      shaper.curve = curve(profile.drive);
      shaper.oversample = "2x";
      node.connect(shaper);
      this.chain.push(shaper);
      node = shaper;
    }

    if (profile.lowpass) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = profile.lowpass;
      filter.Q.value = 0.8;
      node.connect(filter);
      this.chain.push(filter);
      node = filter;

      if (profile.wobble) {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = profile.wobble.rate;
        const depth = context.createGain();
        depth.gain.value = profile.wobble.depth;
        oscillator.connect(depth);
        depth.connect(filter.frequency);
        oscillator.start();
        this.sources.push(oscillator);
        this.chain.push(depth);
      }
    }

    const trim = context.createGain();
    trim.gain.value = profile.gain ?? 1;
    node.connect(trim);
    this.chain.push(trim);
    trim.connect(output);

    if (profile.echo) {
      const delay = context.createDelay(1);
      delay.delayTime.value = profile.echo.time;
      const feedback = context.createGain();
      feedback.gain.value = profile.echo.feedback;
      const wet = context.createGain();
      wet.gain.value = profile.echo.wet;
      trim.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(output);
      this.chain.push(delay, feedback, wet);
    }
  }

  dispose(): void {
    this.teardown();
    if (this.pitch) {
      this.pitch.onprocessorerror = null;
      this.pitch.port.onmessage = null;
      this.pitch.port.close();
    }
    this.output?.disconnect();
    if (this.moduleUrl) {
      URL.revokeObjectURL(this.moduleUrl);
      this.moduleUrl = null;
    }
    this.context = null;
    this.input = null;
    this.output = null;
    this.pitch = null;
    this.ready = false;
  }
}

export const voiceChanger = new VoiceChanger();
