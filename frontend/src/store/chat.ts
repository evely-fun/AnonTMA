import { create } from "zustand";

import { realtime } from "@/shared/lib/socket";
import type { ChatMessage, Mask, Reward } from "@/shared/lib/types";

export type ChatPhase = "idle" | "searching" | "connected" | "ended";

interface Summary {
  durationSeconds: number;
  reward: Reward;
  mutualLike: boolean;
  reason: string;
}

interface ChatState {
  phase: ChatPhase;
  mode: "text" | "voice";
  dialogId: number | null;
  partnerId: number | null;
  partner: Mask | null;
  you: Mask | null;
  polite: boolean;
  messages: ChatMessage[];
  partnerTyping: boolean;
  liked: boolean;
  partnerLiked: boolean;
  revealed: { userId: number; anonName: string; username: string | null } | null;
  revealPending: boolean;
  queue: number;
  searchSeconds: number;
  summary: Summary | null;

  startSearch: (mode: "text" | "voice") => void;
  cancelSearch: () => void;
  matched: (payload: Record<string, unknown>) => void;
  appendMessage: (message: ChatMessage) => void;
  sendMessage: (text: string) => void;
  setTyping: (typing: boolean) => void;
  setPartnerTyping: (typing: boolean) => void;
  like: () => void;
  setPartnerLiked: () => void;
  requestReveal: () => void;
  setRevealed: (payload: { userId: number; anonName: string; username: string | null }) => void;
  setRevealPending: (pending: boolean) => void;
  next: () => void;
  end: () => void;
  report: (reason: string) => void;
  finish: (summary: Summary) => void;
  reset: () => void;
  tickSearch: () => void;
  setQueue: (queue: number) => void;
}

const systemMessage = (text: string): ChatMessage => ({
  id: `system-${Date.now()}`,
  text,
  from: 0,
  own: false,
  createdAt: new Date().toISOString(),
  system: true,
});

export const useChat = create<ChatState>((set, get) => ({
  phase: "idle",
  mode: "text",
  dialogId: null,
  partnerId: null,
  partner: null,
  you: null,
  polite: true,
  messages: [],
  partnerTyping: false,
  liked: false,
  partnerLiked: false,
  revealed: null,
  revealPending: false,
  queue: 0,
  searchSeconds: 0,
  summary: null,

  startSearch: (mode) => {
    set({ phase: "searching", mode, searchSeconds: 0, summary: null, messages: [] });
    realtime.send("match.start", { mode });
  },

  cancelSearch: () => {
    realtime.send("match.cancel");
    set({ phase: "idle", searchSeconds: 0 });
  },

  matched: (payload) => {
    set({
      phase: "connected",
      dialogId: Number(payload.dialogId),
      mode: (payload.mode as "text" | "voice") ?? "text",
      partnerId: Number(payload.partnerId),
      partner: payload.partner as Mask,
      you: payload.you as Mask,
      polite: Boolean(payload.polite),
      messages: [systemMessage("You are connected. Say hello.")],
      liked: false,
      partnerLiked: false,
      revealed: null,
      revealPending: false,
      summary: null,
    });
  },

  appendMessage: (message) =>
    set((state) => ({ messages: [...state.messages.slice(-200), message], partnerTyping: false })),

  sendMessage: (text) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    realtime.send("dialog.message", { text: trimmed });
    get().appendMessage({
      id: `local-${Date.now()}`,
      text: trimmed,
      from: -1,
      own: true,
      createdAt: new Date().toISOString(),
      pending: true,
    });
  },

  setTyping: (typing) => realtime.send("dialog.typing", { typing }),
  setPartnerTyping: (partnerTyping) => set({ partnerTyping }),

  like: () => {
    if (get().liked) {
      return;
    }
    realtime.send("dialog.like");
    set({ liked: true });
  },

  setPartnerLiked: () => set({ partnerLiked: true }),

  requestReveal: () => {
    realtime.send("dialog.reveal");
    set({ revealPending: true });
  },

  setRevealed: (revealed) => set({ revealed, revealPending: false }),
  setRevealPending: (revealPending) => set({ revealPending }),

  next: () => {
    const mode = get().mode;
    set({ phase: "searching", searchSeconds: 0, messages: [], summary: null });
    realtime.send("dialog.next", { mode });
  },

  end: () => {
    realtime.send("dialog.end");
    set({ phase: "ended" });
  },

  report: (reason) => {
    realtime.send("dialog.report", { reason });
    set({ phase: "ended" });
  },

  finish: (summary) => set({ phase: "ended", summary, partnerTyping: false }),

  reset: () =>
    set({
      phase: "idle",
      dialogId: null,
      partnerId: null,
      partner: null,
      you: null,
      messages: [],
      liked: false,
      partnerLiked: false,
      revealed: null,
      revealPending: false,
      summary: null,
      searchSeconds: 0,
    }),

  tickSearch: () => set((state) => ({ searchSeconds: state.searchSeconds + 1 })),
  setQueue: (queue) => set({ queue }),
}));
