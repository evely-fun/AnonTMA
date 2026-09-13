import { getAudioContext, isRunning, onAudioState, resumeAudio } from "./audioContext";
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
    constraints: { noiseSuppression: false, echoCancellation: true, autoGainControl: true },
  },
  light: {
    highPass: 80,
    lowPass: 14000,
    threshold: 2,
    ratio: 1.6,
    floorGain: 0.5,
    release: 0.3,
    constraints: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  },
  medium: {
    highPass: 110,
    lowPass: 11000,
    threshold: 2.6,
    ratio: 2.2,
    floorGain: 0.28,
    release: 0.26,
    constraints: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  },
  high: {
    highPass: 140,
    lowPass: 9000,
    threshold: 3.2,
    ratio: 3.2,
    floorGain: 0.12,
    release: 0.22,
    constraints: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
  },
};

export const NOISE_LEVELS: NoiseLevel[] = ["off", "light", "medium", "high"];

export type CaptureRoute = "raw" | "processed";

export interface VoiceMeter {
  level: number;
  speaking: boolean;
}

type MeterListener = (meter: VoiceMeter) => void;
type TrackListener = (track: MediaStreamTrack | null, route: CaptureRoute) => void;

const PROMOTE_DELAY_MS = 700;
const SAMPLE_INTERVAL_MS = 120;
const WATCHDOG_INTERVAL_MS = 2500;
const STARVED_WINDOWS = 2;
const AUDIBLE_LEVEL = 0.006;
const DEAD_GRAPH_RATIO = 0.02;

const peakOf = (buffer: Float32Array): number => {
  let peak = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    peak = Math.max(peak, Math.abs(buffer[index]));
  }
  return peak;
};

export class VoicePipeline {
  private source: MediaStreamAudioSourceNode | null = null;
  private meterSink: GainNode | null = null;
  private highPass: BiquadFilterNode | null = null;
  private lowPass: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private suppressor: AudioWorkletNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private gainNode: GainNode | null = null;
  private monitor: AnalyserNode | null = null;
  private meterAnalyser: AnalyserNode | null = null;
  private rawStream: MediaStream | null = null;
  private processedStream: MediaStream | null = null;
  private workletUrl: string | null = null;
  private meterListeners = new Set<MeterListener>();
  private trackListeners = new Set<TrackListener>();
  private meterTimer: number | null = null;
  private watchdogTimer: number | null = null;
  private samples = 0;
  private rawEnergy = 0;
  private processedEnergy = 0;
  private starvedWindows = 0;
  private releaseAudioState: (() => void) | null = null;
  private maskListeners = new Set<(unavailable: boolean) => void>();
  private building = false;

  level: NoiseLevel = "medium";
  preset: VoicePreset = "natural";
  muted = false;
  ready = false;
  route: CaptureRoute = "raw";
  published: MediaStreamTrack | null = null;
  maskUnavailable = false;

  async start(level: NoiseLevel = "medium", preset: VoicePreset = "natural"): Promise<MediaStreamTrack> {
    if (this.ready && this.published) {
      return this.published;
    }
    this.level = level;
    this.preset = preset;
    const profile = NOISE_PROFILES[level];

    this.rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...profile.constraints,
        channelCount: 1,
      },
      video: false,
    });

    const raw = this.rawStream.getAudioTracks()[0] ?? null;
    if (!raw) {
      throw new Error("No microphone track");
    }

    // The unprocessed track goes on the wire first. Every effect below lives
    // in a Web Audio graph that a suspended context, a blocked worklet or a
    // hostile webview can silence, and the caller must never be left sending
    // digital silence while all of that is being sorted out. The one exception
    // is a voice mask, handled in selectRoute.
    this.ready = true;
    this.selectRoute();
    this.startSampling();

    void this.buildGraph(profile);
    this.releaseAudioState = onAudioState((running) => {
      if (running) {
        void this.buildGraph(NOISE_PROFILES[this.level]);
      } else {
        this.demote();
      }
    });
    this.startWatchdog();

    return raw;
  }

  private publish(track: MediaStreamTrack | null, route: CaptureRoute): void {
    if (this.published === track && this.route === route) {
      return;
    }
    this.published = track;
    this.route = route;
    this.applyMuteState();
    this.trackListeners.forEach((listener) => listener(track, route));
  }

  /**
   * The raw track has to stay enabled while the processed branch is on the
   * wire, otherwise the graph is fed silence and the watchdog keeps tearing
   * the processing back down.
   */
  private applyMuteState(): void {
    if (this.published) {
      this.published.enabled = !this.muted;
    }
    this.rawStream?.getAudioTracks().forEach((track) => {
      track.enabled = this.route === "processed" ? true : !this.muted;
    });
  }

  /**
   * Chrome returns silence from a second MediaStreamAudioSourceNode built on
   * a stream that already has one, so every branch shares this single node.
   */
  private ensureSource(): MediaStreamAudioSourceNode | null {
    if (this.source) {
      return this.source;
    }
    if (!this.rawStream || !isRunning()) {
      return null;
    }
    try {
      this.source = getAudioContext().createMediaStreamSource(this.rawStream);
    } catch {
      this.source = null;
    }
    return this.source;
  }

  private get maskRequired(): boolean {
    return this.preset !== "natural";
  }

  /**
   * Decides what actually goes on the wire. Falling back to the raw
   * microphone is the right answer for everyone except someone using a voice
   * mask: for them the raw track is their real voice, which is the single
   * thing the mask exists to prevent, so they get silence and a warning
   * instead of being quietly unmasked.
   */
  private selectRoute(): void {
    const processed = this.processedStream?.getAudioTracks()[0] ?? null;
    if (processed && processed.readyState === "live" && isRunning()) {
      this.announceMask(false);
      this.publish(processed, "processed");
      return;
    }

    if (this.maskRequired) {
      this.publish(null, "raw");
      this.announceMask(true);
      return;
    }

    const raw = this.rawStream?.getAudioTracks()[0] ?? null;
    this.announceMask(false);
    if (raw) {
      this.publish(raw, "raw");
    }
  }

  private demote(): void {
    if (this.route !== "processed" && !this.maskRequired) {
      return;
    }
    this.processedStream = null;
    this.selectRoute();
  }

  private announceMask(unavailable: boolean): void {
    if (this.maskUnavailable === unavailable) {
      return;
    }
    this.maskUnavailable = unavailable;
    this.maskListeners.forEach((listener) => listener(unavailable));
  }

  onMask(listener: (unavailable: boolean) => void): () => void {
    this.maskListeners.add(listener);
    listener(this.maskUnavailable);
    return () => {
      this.maskListeners.delete(listener);
    };
  }

  private async buildGraph(profile: LevelProfile): Promise<void> {
    // start and the audio state listener can both reach here, and the awaits
    // below leave a window where a second call would build a duplicate graph.
    if (this.building || !this.ready || !this.rawStream || this.destination) {
      return;
    }
    this.building = true;
    try {
      await this.assembleGraph(profile);
    } finally {
      this.building = false;
    }
  }

  private async assembleGraph(profile: LevelProfile): Promise<void> {
    const running = await resumeAudio();
    if (!running) {
      return;
    }

    const context = getAudioContext();
    try {
      const source = this.ensureSource();
      if (!source) {
        return;
      }

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

      this.monitor = context.createAnalyser();
      this.monitor.fftSize = 1024;
      this.monitor.smoothingTimeConstant = 0.6;

      this.destination = context.createMediaStreamDestination();

      await this.attachSuppressor(context);

      source.connect(this.highPass);
      this.highPass.connect(this.lowPass);
      if (this.suppressor) {
        this.lowPass.connect(this.suppressor);
        this.suppressor.connect(this.compressor);
      } else {
        this.lowPass.connect(this.compressor);
      }

      voiceChanger.preset = this.preset;
      const changer = await voiceChanger.attach(context);
      this.compressor.connect(changer.input);
      changer.output.connect(this.gainNode);
      // The monitor sits in the chain rather than hanging off it. An analyser
      // with nothing downstream is not pulled by the render graph, so it read
      // pure silence and the watchdog tore down a perfectly healthy pipeline.
      this.gainNode.connect(this.monitor);
      this.monitor.connect(this.destination);

      this.applyProfile(profile);
      this.processedStream = this.destination.stream;
      this.startSampling();
      this.schedulePromotion();
    } catch {
      this.teardownGraph();
    }
  }

  /**
   * The processed track only replaces the raw one once the graph has had a
   * moment to actually produce samples. Promoting a dead graph is exactly the
   * failure that leaves the other side hearing nothing.
   */
  private schedulePromotion(): void {
    window.setTimeout(() => {
      const track = this.processedStream?.getAudioTracks()[0] ?? null;
      if (!track || track.readyState !== "live" || !isRunning()) {
        return;
      }
      this.starvedWindows = 0;
      this.selectRoute();
    }, PROMOTE_DELAY_MS);
  }

  private async attachSuppressor(context: AudioContext): Promise<void> {
    if (this.suppressor) {
      return;
    }
    try {
      const blob = new Blob([suppressorWorklet], { type: "application/javascript" });
      this.workletUrl = URL.createObjectURL(blob);
      await context.audioWorklet.addModule(this.workletUrl);
      const node = new AudioWorkletNode(context, "adaptive-suppressor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.port.onmessage = (message) => {
        const data = message.data as VoiceMeter;
        this.meterListeners.forEach((listener) => listener(data));
      };
      node.onprocessorerror = () => {
        this.suppressor = null;
        this.demote();
      };
      this.suppressor = node;
    } catch {
      this.suppressor = null;
    }
  }

  /**
   * One sampling loop drives both the level meter and the health check. It
   * compares the raw microphone against the processed output, because
   * silence on its own means nothing: people stop talking. Only signal going
   * in with nothing coming out is a broken pipeline.
   */
  private startSampling(): void {
    if (this.meterTimer !== null) {
      return;
    }
    const rawBuffer = new Float32Array(1024);
    const outBuffer = new Float32Array(1024);

    this.meterTimer = window.setInterval(() => {
      const analyser = this.ensureMeterAnalyser();
      if (!analyser) {
        return;
      }
      analyser.getFloatTimeDomainData(rawBuffer);
      const rawPeak = peakOf(rawBuffer);
      this.rawEnergy += rawPeak;

      if (this.monitor) {
        this.monitor.getFloatTimeDomainData(outBuffer);
        this.processedEnergy += peakOf(outBuffer);
      }
      this.samples += 1;

      // The worklet reports its own level whenever it is carrying the audio,
      // this only fills in while the raw track is on the wire.
      if (this.route === "raw" || !this.suppressor) {
        const level = this.muted ? 0 : Math.min(1, rawPeak * 5);
        this.meterListeners.forEach((listener) => listener({ level, speaking: level > 0.1 }));
      }
    }, SAMPLE_INTERVAL_MS);
  }

  private ensureMeterAnalyser(): AnalyserNode | null {
    if (this.meterAnalyser) {
      return this.meterAnalyser;
    }
    const source = this.ensureSource();
    if (!source) {
      return null;
    }
    try {
      const context = getAudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      // A silent sink keeps this branch inside the render graph, otherwise
      // the analyser is never fed and the level meter reads a flat zero.
      const sink = context.createGain();
      sink.gain.value = 0;
      source.connect(analyser);
      analyser.connect(sink);
      sink.connect(context.destination);
      this.meterAnalyser = analyser;
      this.meterSink = sink;
    } catch {
      return null;
    }
    return this.meterAnalyser;
  }

  private startWatchdog(): void {
    if (this.watchdogTimer !== null) {
      return;
    }
    this.watchdogTimer = window.setInterval(() => {
      const raw = this.rawStream?.getAudioTracks()[0] ?? null;
      if (raw && raw.readyState !== "live") {
        this.publish(null, "raw");
        return;
      }

      const samples = this.samples;
      const rawLevel = samples > 0 ? this.rawEnergy / samples : 0;
      const processedLevel = samples > 0 ? this.processedEnergy / samples : 0;
      this.samples = 0;
      this.rawEnergy = 0;
      this.processedEnergy = 0;

      if (this.muted || this.route !== "processed") {
        this.starvedWindows = 0;
        return;
      }
      const track = this.published;
      if (!track || track.readyState !== "live" || !isRunning()) {
        this.demote();
        return;
      }
      // Nobody is talking, nothing to judge.
      if (rawLevel < AUDIBLE_LEVEL) {
        this.starvedWindows = 0;
        return;
      }
      const starved = processedLevel < rawLevel * DEAD_GRAPH_RATIO;
      this.starvedWindows = starved ? this.starvedWindows + 1 : 0;
      if (this.starvedWindows >= STARVED_WINDOWS) {
        this.starvedWindows = 0;
        this.demote();
      }
    }, WATCHDOG_INTERVAL_MS);
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
    const now = getAudioContext().currentTime;
    parameters.get("threshold")?.setValueAtTime(profile.threshold, now);
    parameters.get("ratio")?.setValueAtTime(profile.ratio, now);
    parameters.get("floorGain")?.setValueAtTime(profile.floorGain, now);
    parameters.get("release")?.setValueAtTime(profile.release, now);
    parameters.get("bypass")?.setValueAtTime(profile.ratio <= 1 ? 1 : 0, now);
  }

  setLevel(level: NoiseLevel): void {
    this.level = level;
    this.applyProfile(NOISE_PROFILES[level]);
  }

  setPreset(preset: VoicePreset): void {
    const had = this.maskRequired;
    this.preset = preset;
    voiceChanger.setPreset(preset);
    if (this.ready && had !== this.maskRequired) {
      this.selectRoute();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(muted ? 0 : 1, getAudioContext().currentTime, 0.015);
    }
    // Disabling the published track is what actually stops the packets, the
    // gain node only covers the processed branch.
    this.applyMuteState();
  }

  onMeter(listener: MeterListener): () => void {
    this.meterListeners.add(listener);
    return () => {
      this.meterListeners.delete(listener);
    };
  }

  onTrack(listener: TrackListener): () => void {
    this.trackListeners.add(listener);
    if (this.published) {
      listener(this.published, this.route);
    }
    return () => {
      this.trackListeners.delete(listener);
    };
  }

  private teardownGraph(): void {
    this.suppressor?.disconnect();
    // Only the edge into the processing chain goes, the shared source still
    // feeds the level meter.
    if (this.source && this.highPass) {
      try {
        this.source.disconnect(this.highPass);
      } catch {
        /* already detached */
      }
    }
    this.highPass?.disconnect();
    this.lowPass?.disconnect();
    this.compressor?.disconnect();
    this.gainNode?.disconnect();
    this.monitor?.disconnect();
    voiceChanger.dispose();
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = null;
    }
    this.suppressor = null;
    this.highPass = null;
    this.lowPass = null;
    this.compressor = null;
    this.gainNode = null;
    this.monitor = null;
    this.destination = null;
    this.processedStream = null;
  }

  async stop(): Promise<void> {
    this.ready = false;
    this.releaseAudioState?.();
    this.releaseAudioState = null;
    if (this.meterTimer !== null) {
      window.clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
    if (this.watchdogTimer !== null) {
      window.clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.teardownGraph();
    this.meterAnalyser?.disconnect();
    this.meterSink?.disconnect();
    this.source?.disconnect();
    this.meterAnalyser = null;
    this.meterSink = null;
    this.source = null;
    this.rawStream?.getTracks().forEach((track) => track.stop());
    this.rawStream = null;
    this.publish(null, "raw");
    this.announceMask(false);
    this.meterListeners.clear();
    this.muted = false;
  }
}

export const voicePipeline = new VoicePipeline();

if (import.meta.env.DEV) {
  (window as unknown as { __voicePipeline?: VoicePipeline }).__voicePipeline = voicePipeline;
}
