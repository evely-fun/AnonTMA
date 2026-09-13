import { create } from "zustand";

import { peerManager } from "@/features/voice/webrtc";
import { request } from "@/shared/lib/api";
import type { GameMeta, PresenceSnapshot, Profile } from "@/shared/lib/types";
import type { SocketStatus } from "@/shared/lib/socket";

interface IcePayload {
  iceServers: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  iceCandidatePoolSize?: number;
}

interface SessionState {
  profile: Profile | null;
  presence: PresenceSnapshot;
  games: GameMeta[];
  iceServers: RTCIceServer[];
  botUsername: string;
  connection: SocketStatus;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  patchProfile: (patch: Partial<Profile>) => void;
  setPresence: (presence: PresenceSnapshot) => void;
  setConnection: (status: SocketStatus) => void;
}

export const useSession = create<SessionState>((set, get) => ({
  profile: null,
  presence: { online: 0, inVoice: 0, searching: 0 },
  games: [],
  iceServers: [],
  botUsername: "",
  connection: "idle",
  loading: true,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [profile, bootstrap, ice] = await Promise.all([
        request<Profile>("/users/me"),
        request<{ games: GameMeta[]; presence: PresenceSnapshot; botUsername: string }>(
          "/config/bootstrap",
        ),
        request<IcePayload>("/config/ice"),
      ]);
      peerManager.configure({
        iceServers: ice.iceServers ?? [],
        iceTransportPolicy: ice.iceTransportPolicy ?? "all",
        iceCandidatePoolSize: ice.iceCandidatePoolSize ?? 0,
      });
      set({
        profile,
        games: bootstrap.games,
        presence: bootstrap.presence,
        botUsername: bootstrap.botUsername,
        iceServers: ice.iceServers,
        loading: false,
      });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : "Failed to load" });
    }
  },

  refreshProfile: async () => {
    try {
      const profile = await request<Profile>("/users/me");
      set({ profile });
    } catch {
      /* keep previous profile */
    }
  },

  patchProfile: (patch) => {
    const current = get().profile;
    if (current) {
      set({ profile: { ...current, ...patch } });
    }
  },

  setPresence: (presence) => set({ presence }),
  setConnection: (connection) => set({ connection }),
}));
