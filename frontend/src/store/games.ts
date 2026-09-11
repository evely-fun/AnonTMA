import { create } from "zustand";

import { realtime } from "@/shared/lib/socket";
import type { Reward } from "@/shared/lib/types";

export interface GameEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  at: number;
}

interface GamesState {
  gameId: number | null;
  gameKey: string | null;
  players: number[];
  host: number | null;
  view: Record<string, unknown> | null;
  events: GameEvent[];
  privateState: Record<string, unknown>;
  reward: Reward | null;

  created: (payload: Record<string, unknown>) => void;
  setView: (payload: Record<string, unknown>) => void;
  pushEvent: (type: string, payload: Record<string, unknown>) => void;
  mergePrivate: (patch: Record<string, unknown>) => void;
  setReward: (reward: Reward | null) => void;
  create: (gameKey: string, options?: Record<string, unknown>, roomId?: number) => void;
  start: () => void;
  act: (action: string, payload?: Record<string, unknown>) => void;
  join: (gameId: number) => void;
  leave: () => void;
  reset: () => void;
}

export const useGames = create<GamesState>((set, get) => ({
  gameId: null,
  gameKey: null,
  players: [],
  host: null,
  view: null,
  events: [],
  privateState: {},
  reward: null,

  created: (payload) =>
    set({
      gameId: Number(payload.gameId),
      gameKey: String(payload.gameKey),
      players: (payload.players as number[]) ?? [],
      host: Number(payload.host ?? 0) || null,
      view: null,
      events: [],
      privateState: {},
      reward: null,
    }),

  setView: (payload) =>
    set({
      gameId: Number(payload.gameId),
      gameKey: String(payload.gameKey),
      view: payload.view as Record<string, unknown>,
    }),

  pushEvent: (type, payload) =>
    set((state) => ({
      events: [
        ...state.events.slice(-30),
        { id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, type, payload, at: Date.now() },
      ],
    })),

  mergePrivate: (patch) => set((state) => ({ privateState: { ...state.privateState, ...patch } })),

  setReward: (reward) => set({ reward }),

  create: (gameKey, options, roomId) => {
    realtime.send("game.create", { gameKey, options: options ?? {}, roomId: roomId ?? 0 });
  },

  start: () => {
    const gameId = get().gameId;
    if (gameId) {
      realtime.send("game.start", { gameId });
    }
  },

  act: (action, payload) => {
    const gameId = get().gameId;
    if (gameId) {
      realtime.send("game.action", { gameId, action, payload: payload ?? {} });
    }
  },

  join: (gameId) => {
    realtime.send("game.join", { gameId });
    set({ gameId });
  },

  leave: () => {
    const gameId = get().gameId;
    if (gameId) {
      realtime.send("game.leave", { gameId });
    }
    set({ gameId: null, gameKey: null, view: null, events: [], privateState: {}, players: [] });
  },

  reset: () =>
    set({ gameId: null, gameKey: null, view: null, events: [], privateState: {}, players: [], reward: null }),
}));
