import { create } from "zustand";

import { request } from "@/shared/lib/api";
import { realtime } from "@/shared/lib/socket";
import type { Friend, FriendRequest } from "@/shared/lib/types";

export interface IncomingCall {
  callId: string;
  mode: "voice" | "text";
  from: { userId: number; anonName: string; avatarSeed: string };
}

interface SocialState {
  friends: Friend[];
  requests: FriendRequest[];
  loading: boolean;
  incomingCall: IncomingCall | null;
  activeCall: { callId: string; userId: number; polite: boolean; status: "ringing" | "active" } | null;

  load: () => Promise<void>;
  sendRequest: (userId: number, message?: string) => Promise<void>;
  accept: (requestId: number) => Promise<void>;
  decline: (requestId: number) => Promise<void>;
  remove: (friendId: number) => Promise<void>;
  toggleFavourite: (friendId: number) => Promise<void>;
  inviteLink: () => Promise<{ url: string; shareUrl: string; code: string } | null>;

  setFriendPresence: (userId: number, isOnline: boolean, activity?: string | null) => void;
  setIncomingCall: (call: IncomingCall | null) => void;
  setActiveCall: (call: SocialState["activeCall"]) => void;
  callFriend: (userId: number) => void;
  answerCall: (accept: boolean) => void;
  endCall: () => void;
}

export const useSocial = create<SocialState>((set, get) => ({
  friends: [],
  requests: [],
  loading: false,
  incomingCall: null,
  activeCall: null,

  load: async () => {
    set({ loading: true });
    try {
      const [friends, requests] = await Promise.all([
        request<Friend[]>("/friends"),
        request<FriendRequest[]>("/friends/requests"),
      ]);
      set({ friends, requests, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  sendRequest: async (userId, message) => {
    await request("/friends/requests", { method: "POST", body: { userId, message } });
    await get().load();
  },

  accept: async (requestId) => {
    await request(`/friends/requests/${requestId}/accept`, { method: "POST" });
    await get().load();
  },

  decline: async (requestId) => {
    await request(`/friends/requests/${requestId}/decline`, { method: "POST" });
    set((state) => ({ requests: state.requests.filter((item) => item.id !== requestId) }));
  },

  remove: async (friendId) => {
    await request(`/friends/${friendId}`, { method: "DELETE" });
    set((state) => ({ friends: state.friends.filter((item) => item.id !== friendId) }));
  },

  toggleFavourite: async (friendId) => {
    const response = await request<{ favourite: boolean }>(`/friends/${friendId}/favourite`, {
      method: "POST",
    });
    set((state) => ({
      friends: state.friends.map((item) =>
        item.id === friendId ? { ...item, favourite: response.favourite } : item,
      ),
    }));
  },

  inviteLink: async () => {
    try {
      return await request<{ url: string; shareUrl: string; code: string }>("/friends/invite");
    } catch {
      return null;
    }
  },

  setFriendPresence: (userId, isOnline, activity) =>
    set((state) => ({
      friends: state.friends.map((item) =>
        item.id === userId ? { ...item, isOnline, activity: activity ?? item.activity } : item,
      ),
    })),

  setIncomingCall: (incomingCall) => set({ incomingCall }),
  setActiveCall: (activeCall) => set({ activeCall }),

  callFriend: (userId) => {
    realtime.send("call.invite", { userId, mode: "voice" });
  },

  answerCall: (accept) => {
    const call = get().incomingCall;
    if (!call) {
      return;
    }
    realtime.send("call.answer", { callId: call.callId, accept });
    set({ incomingCall: null });
  },

  endCall: () => {
    const call = get().activeCall;
    if (call) {
      realtime.send("call.end", { callId: call.callId });
    }
    set({ activeCall: null });
  },
}));
