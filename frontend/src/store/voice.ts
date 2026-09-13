import { create } from "zustand";

import { resumeAudio } from "@/features/voice/audioContext";
import { VOICE_PRESETS, type VoicePreset } from "@/features/voice/changer";
import { NOISE_LEVELS, voicePipeline, type CaptureRoute, type NoiseLevel } from "@/features/voice/noise";
import { peerManager } from "@/features/voice/webrtc";
import { realtime } from "@/shared/lib/socket";

interface VoiceState {
  active: boolean;
  muted: boolean;
  level: NoiseLevel;
  preset: VoicePreset;
  route: CaptureRoute;
  maskUnavailable: boolean;
  micLevel: number;
  speaking: boolean;
  permission: "unknown" | "granted" | "denied";
  playbackBlocked: boolean;
  peerLevels: Record<number, number>;
  error: string | null;

  applyPreferences: (preferences: { noiseSuppression?: string; voicePreset?: string } | undefined) => void;
  enable: (level?: NoiseLevel) => Promise<boolean>;
  disable: () => Promise<void>;
  toggleMute: () => void;
  mute: () => Promise<void>;
  setLevel: (level: NoiseLevel) => void;
  setPreset: (preset: VoicePreset) => void;
  setPlaybackBlocked: (blocked: boolean) => void;
  unlockPlayback: () => Promise<void>;
  setPeerLevels: (levels: Map<number, number>) => void;
}

let releaseMeter: (() => void) | null = null;
let releaseTrack: (() => void) | null = null;
let releaseLevels: (() => void) | null = null;
let releaseMask: (() => void) | null = null;

export const useVoice = create<VoiceState>((set, get) => ({
  active: false,
  muted: false,
  level: "medium",
  preset: "natural",
  route: "raw",
  maskUnavailable: false,
  micLevel: 0,
  speaking: false,
  permission: "unknown",
  playbackBlocked: false,
  peerLevels: {},
  error: null,

  /**
   * The saved level and voice mask were written to the profile but never read
   * back, so every session silently restarted on the defaults and a paid
   * voice mask simply did not apply.
   */
  applyPreferences: (preferences) => {
    if (!preferences) {
      return;
    }
    const level = preferences.noiseSuppression as NoiseLevel | undefined;
    const preset = preferences.voicePreset as VoicePreset | undefined;
    if (level && NOISE_LEVELS.includes(level)) {
      set({ level });
      if (get().active) {
        voicePipeline.setLevel(level);
      }
    }
    if (preset && VOICE_PRESETS.includes(preset)) {
      set({ preset });
      if (get().active) {
        voicePipeline.setPreset(preset);
      }
    }
  },

  enable: async (level) => {
    if (get().active) {
      return true;
    }
    // Best effort: the context usually resumes here because enable runs close
    // to a tap, and the global gesture listener catches the cases where it
    // does not.
    void resumeAudio();

    try {
      const track = await voicePipeline.start(level ?? get().level, get().preset);
      peerManager.setLocalTrack(track);

      releaseTrack?.();
      releaseTrack = voicePipeline.onTrack((next, route) => {
        peerManager.setLocalTrack(next);
        set({ route });
      });

      releaseMeter?.();
      releaseMeter = voicePipeline.onMeter((meter) => {
        const previous = get();
        if (Math.abs(previous.micLevel - meter.level) > 0.02 || previous.speaking !== meter.speaking) {
          set({ micLevel: meter.level, speaking: meter.speaking });
          if (previous.speaking !== meter.speaking) {
            realtime.send("dialog.signal", { event: meter.speaking ? "speaking" : "silent" });
          }
        }
      });

      releaseLevels?.();
      releaseLevels = peerManager.onLevels((levels) => get().setPeerLevels(levels));

      releaseMask?.();
      releaseMask = voicePipeline.onMask((maskUnavailable) => set({ maskUnavailable }));

      set({
        active: true,
        permission: "granted",
        error: null,
        muted: false,
        route: voicePipeline.route,
        level: level ?? get().level,
      });
      return true;
    } catch (error) {
      set({
        permission: "denied",
        error: error instanceof Error ? error.message : "Microphone unavailable",
      });
      return false;
    }
  },

  disable: async () => {
    releaseMeter?.();
    releaseTrack?.();
    releaseLevels?.();
    releaseMask?.();
    releaseMeter = null;
    releaseTrack = null;
    releaseLevels = null;
    releaseMask = null;
    await voicePipeline.stop();
    peerManager.setLocalTrack(null);
    set({
      active: false,
      muted: false,
      micLevel: 0,
      speaking: false,
      peerLevels: {},
      route: "raw",
      maskUnavailable: false,
    });
  },

  toggleMute: () => {
    const muted = !get().muted;
    voicePipeline.setMuted(muted);
    realtime.send("dialog.signal", { event: muted ? "mic_off" : "mic_on" });
    set({ muted, micLevel: muted ? 0 : get().micLevel });
  },

  mute: async () => {
    if (get().muted) return;
    voicePipeline.setMuted(true);
    realtime.send("dialog.signal", { event: "mic_off" });
    set({ muted: true, micLevel: 0 });
  },

  setLevel: (level) => {
    voicePipeline.setLevel(level);
    set({ level });
  },

  setPreset: (preset) => {
    voicePipeline.setPreset(preset);
    set({ preset, maskUnavailable: voicePipeline.maskUnavailable });
  },

  setPlaybackBlocked: (playbackBlocked) => set({ playbackBlocked }),

  unlockPlayback: async () => {
    await peerManager.unlock();
    set({ playbackBlocked: false });
  },

  setPeerLevels: (levels) => {
    const next: Record<number, number> = {};
    levels.forEach((value, key) => {
      next[key] = value;
    });
    set({ peerLevels: next });
  },
}));

if (import.meta.env.DEV) {
  (window as unknown as { __voiceStore?: typeof useVoice }).__voiceStore = useVoice;
}
