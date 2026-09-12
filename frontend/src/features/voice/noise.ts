import { voiceChanger, type VoicePreset } from "./changer";
import { suppressorWorklet } from "./worklet";

export type NoiseLevel = "off" | "light" | "medium" | "high";

interface LevelProfile {
  highPass: number;
  lowPass: number;
  threshold: number;
  ratio: number;
  floorGain: number;
  release: number;
  constraints: { noiseSuppression: boolean; echoCancellation: boolean; autoGainControl: boolean };
}

export const NOISE_PROFILES: Record<NoiseLevel, LevelProfile> = {
  off: {
    highPass: 40,
    lowPass: 18000,
    threshold: 1,
    ratio: 1,
    floorGain: 1,
    release: 0.3,
    constraints: { noiseSuppression: false, echoCancellation: true, autoGainControl: false },
  },
  light: {
    highPass: 90,
    lowPass: 12000,
    threshold: 1.9,
    ratio: 2.2,
    floorGain: 0.32,
    release: 0.26,
    constraints: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  },
  medium: {
    highPass: 130,
    lowPass: 9000,
    threshold: 2.6,
    ratio: 5,
    floorGain: 0.1,
    release: 0.18,
    constraints: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  },
  high: {
    highPass: 170,
    lowPass: 7200,
    threshold: 3.6,
    ratio: 10,
    floorGain: 0.015,
    release: 0.12,
    constraints: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  },
};

export const NOISE_LEVELS: NoiseLevel[] = ["off", "light", "medium", "high"];

export interface VoiceMeter {
  level: number;
  speaking: boolean;
}

type MeterListener = (meter: VoiceMeter) => void;

export class VoicePipeline {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private highPass: BiquadFilterNode | null = null;
  private lowPass: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private suppressor: AudioWorkletNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private gainNode: GainNode | null = null;
  private rawStream: MediaStream | null = null;
  private workletUrl: string | null = null;
  private listeners = new Set<MeterListener>();

  level: NoiseLevel = "medium";
  preset: VoicePreset = "natural";
  muted = false;
  ready = false;

  async start(level: NoiseLevel = "medium", preset: VoicePreset = "natural"): Promise<MediaStream> {
    this.level = level;
    this.preset = preset;
    const profile = NOISE_PROFILES[level];

    this.rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...profile.constraints,
        channelCount: 1,
        sampleRate: 48000,
      },
      video: false,
    });

    const context = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
    this.context = context;
    await context.resume();

    this.source = context.createMediaStreamSource(this.rawStream);
    this.highPass = context.createBiquadFilter();
    this.highPass.type = "highpass";
    this.highPass.frequency.value = profile.highPass;
    this.highPass.Q.value = 0.72;

    this.lowPass = context.createBiquadFilter();
    this.lowPass.type = "lowpass";
    this.lowPass.frequency.value = profile.lowPass;

    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -26;
    this.compressor.knee.value = 22;
    this.compressor.ratio.value = 3.4;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.2;

    this.gainNode = context.createGain();
    this.gainNode.gain.value = 1;

    this.destination = context.createMediaStreamDestination();

    await this.attachSuppressor(context, profile);

    this.ready = true;
    return this.destination.stream;
  }

  private async attachSuppressor(context: AudioContext, profile: LevelProfile): Promise<void> {
    if (!this.source || !this.highPass || !this.lowPass || !this.compressor || !this.gainNode || !this.destination) {
      return;
    }

    let node: AudioWorkletNode | null = null;
    try {
      const blob = new Blob([suppressorWorklet], { type: "application/javascript" });
      this.workletUrl = URL.createObjectURL(blob);
      await context.audioWorklet.addModule(this.workletUrl);
      node = new AudioWorkletNode(context, "adaptive-suppressor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.port.onmessage = (message) => {
        const data = message.data as VoiceMeter;
        this.listeners.forEach((listener) => listener(data));
      };
      this.suppressor = node;
    } catch {
      this.suppressor = null;
    }

    this.source.connect(this.highPass);
    this.highPass.connect(this.lowPass);
    if (node) {
      this.lowPass.connect(node);
      node.connect(this.compressor);
    } else {
      this.lowPass.connect(this.compressor);
      this.attachFallbackMeter(context);
    }
    voiceChanger.preset = this.preset;
    const changer = await voiceChanger.attach(context);
    this.compressor.connect(changer.input);
    changer.output.connect(this.gainNode);
    this.gainNode.connect(this.destination);

    this.applyProfile(profile);
  }

  private attachFallbackMeter(context: AudioContext): void {
    if (!this.compressor) {
      return;
    }
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.75;
    this.compressor.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);

    const tick = (): void => {
      if (!this.context) {
        return;
      }
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let index = 0; index < buffer.length; index += 1) {
        sum += buffer[index] * buffer[index];
      }
      const rms = Math.sqrt(sum / buffer.length);
      const level = Math.min(1, rms * 14);
      this.listeners.forEach((listener) => listener({ level, speaking: level > 0.12 }));
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  }

  private applyProfile(profile: LevelProfile): void {
    if (this.highPass) {
      this.highPass.frequency.value = profile.highPass;
    }
    if (this.lowPass) {
      this.lowPass.frequency.value = profile.lowPass;
    }
    const parameters = this.suppressor?.parameters;
    if (!parameters) {
      return;
    }
    parameters.get("threshold")?.setValueAtTime(profile.threshold, this.context?.currentTime ?? 0);
    parameters.get("ratio")?.setValueAtTime(profile.ratio, this.context?.currentTime ?? 0);
    parameters.get("floorGain")?.setValueAtTime(profile.floorGain, this.context?.currentTime ?? 0);
    parameters.get("release")?.setValueAtTime(profile.release, this.context?.currentTime ?? 0);
    parameters.get("bypass")?.setValueAtTime(profile.ratio <= 1 ? 1 : 0, this.context?.currentTime ?? 0);
  }

  setLevel(level: NoiseLevel): void {
    this.level = level;
    this.applyProfile(NOISE_PROFILES[level]);
  }

  setPreset(preset: VoicePreset): void {
    this.preset = preset;
    voiceChanger.setPreset(preset);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gainNode && this.context) {
      this.gainNode.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.015);
    }
    this.rawStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  onMeter(listener: MeterListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async stop(): Promise<void> {
    this.ready = false;
    this.listeners.clear();
    this.rawStream?.getTracks().forEach((track) => track.stop());
    this.suppressor?.port.close();
    this.suppressor?.disconnect();
    this.source?.disconnect();
    this.highPass?.disconnect();
    this.lowPass?.disconnect();
    this.compressor?.disconnect();
    this.gainNode?.disconnect();
    voiceChanger.dispose();
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = null;
    }
    await this.context?.close();
    this.context = null;
    this.rawStream = null;
    this.destination = null;
  }
}

export const voicePipeline = new VoicePipeline();
