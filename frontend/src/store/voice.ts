import { create } from "zustand";

import { voicePipeline, type NoiseLevel } from "@/features/voice/noise";
import { peerManager } from "@/features/voice/webrtc";
import { realtime } from "@/shared/lib/socket";

interface VoiceState {
  active: boolean;
  muted: boolean;
  level: NoiseLevel;
  micLevel: number;
  speaking: boolean;
  permission: "unknown" | "granted" | "denied";
  peerLevels: Record<number, number>;
  error: string | null;

  enable: (level?: NoiseLevel) => Promise<boolean>;
  disable: () => Promise<void>;
  toggleMute: () => void;
  setLevel: (level: NoiseLevel) => void;
  setPeerLevels: (levels: Map<number, number>) => void;
}

export const useVoice = create<VoiceState>((set, get) => ({
  active: false,
  muted: false,
  level: "medium",
  micLevel: 0,
  speaking: false,
  permission: "unknown",
  peerLevels: {},
  error: null,

  enable: async (level) => {
    if (get().active) {
      return true;
    }
    try {
      const stream = await voicePipeline.start(level ?? get().level);
      peerManager.setLocalStream(stream);
      voicePipeline.onMeter((meter) => {
        const previous = get();
        if (Math.abs(previous.micLevel - meter.level) > 0.02 || previous.speaking !== meter.speaking) {
          set({ micLevel: meter.level, speaking: meter.speaking });
          if (previous.speaking !== meter.speaking) {
            realtime.send("dialog.signal", { event: meter.speaking ? "speaking" : "silent" });
          }
        }
      });
      peerManager.onLevels((levels) => get().setPeerLevels(levels));
      set({ active: true, permission: "granted", error: null, level: level ?? get().level });
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
    await voicePipeline.stop();
    peerManager.setLocalStream(null);
    set({ active: false, micLevel: 0, speaking: false, peerLevels: {} });
  },

  toggleMute: () => {
    const muted = !get().muted;
    voicePipeline.setMuted(muted);
    realtime.send("dialog.signal", { event: muted ? "mic_off" : "mic_on" });
    set({ muted });
  },

  setLevel: (level) => {
    voicePipeline.setLevel(level);
    set({ level });
  },

  setPeerLevels: (levels) => {
    const next: Record<number, number> = {};
    levels.forEach((value, key) => {
      next[key] = value;
    });
    set({ peerLevels: next });
  },
}));
