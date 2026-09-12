import { create } from "zustand";

import { request } from "@/shared/lib/api";
import { realtime } from "@/shared/lib/socket";
import type { Room, RoomMember } from "@/shared/lib/types";

interface RoomChatMessage {
  id: number;
  from: number;
  anonName: string;
  text: string;
  createdAt: string;
}

interface RoomsState {
  list: Room[];
  loading: boolean;
  current: Room | null;
  members: RoomMember[];
  messages: RoomChatMessage[];
  joining: boolean;
  kicked: boolean;

  loadList: (filters?: { kind?: string; language?: string }) => Promise<void>;
  create: (payload: Partial<Room> & { title: string }) => Promise<Room | null>;
  open: (roomId: number) => Promise<void>;
  join: (roomId: number) => void;
  leave: () => void;
  setMembers: (members: RoomMember[]) => void;
  upsertMember: (member: RoomMember) => void;
  removeMember: (userId: number) => void;
  appendMessage: (message: RoomChatMessage) => void;
  sendMessage: (text: string) => void;
  setMuted: (muted: boolean) => void;
  raiseHand: (hand: boolean) => void;
  moderate: (userId: number, action: string) => void;
  reportMember: (userId: number, reason: string) => void;
  reset: () => void;
  setKicked: (kicked: boolean) => void;
}

export type RoomAction =
  | "mute"
  | "unmute"
  | "kick"
  | "promote"
  | "demote"
  | "transfer";

export const useRooms = create<RoomsState>((set, get) => ({
  list: [],
  loading: false,
  current: null,
  members: [],
  messages: [],
  joining: false,
  kicked: false,

  loadList: async (filters) => {
    set({ loading: true });
    const query = new URLSearchParams();
    if (filters?.kind) {
      query.set("kind", filters.kind);
    }
    if (filters?.language && filters.language !== "any") {
      query.set("language", filters.language);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    try {
      const list = await request<Room[]>(`/rooms${suffix}`);
      set({ list, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  create: async (payload) => {
    try {
      const room = await request<Room>("/rooms", { method: "POST", body: payload });
      set((state) => ({ list: [room, ...state.list] }));
      return room;
    } catch {
      return null;
    }
  },

  open: async (roomId) => {
    try {
      const room = await request<Room>(`/rooms/${roomId}`);
      set({ current: room, members: room.members ?? [] });
    } catch {
      set({ current: null });
    }
  },

  join: (roomId) => {
    set({ joining: true, messages: [] });
    realtime.send("room.join", { roomId });
  },

  leave: () => {
    const room = get().current;
    if (room) {
      realtime.send("room.leave", { roomId: room.id });
    }
    set({ current: null, members: [], messages: [], joining: false });
  },

  setMembers: (members) => set({ members, joining: false }),

  upsertMember: (member) =>
    set((state) => {
      const others = state.members.filter((item) => item.userId !== member.userId);
      return { members: [...others, member] };
    }),

  removeMember: (userId) =>
    set((state) => ({ members: state.members.filter((item) => item.userId !== userId) })),

  appendMessage: (message) =>
    set((state) => ({ messages: [...state.messages.slice(-120), message] })),

  sendMessage: (text) => {
    const room = get().current;
    if (!room || !text.trim()) {
      return;
    }
    realtime.send("room.message", { roomId: room.id, text: text.trim() });
  },

  setMuted: (muted) => {
    const room = get().current;
    if (room) {
      realtime.send("room.state", { roomId: room.id, muted });
    }
  },

  raiseHand: (hand) => {
    const room = get().current;
    if (room) {
      realtime.send("room.state", { roomId: room.id, hand });
    }
  },

  moderate: (userId, action) => {
    const room = get().current;
    if (room) {
      realtime.send("room.moderate", { roomId: room.id, userId, action });
    }
  },

  reportMember: (userId, reason) => {
    const room = get().current;
    if (room) {
      realtime.send("room.report", { roomId: room.id, userId, reason });
    }
  },

  setKicked: (kicked) => set({ kicked }),

  reset: () =>
    set({ current: null, members: [], messages: [], joining: false, kicked: false }),
}));
