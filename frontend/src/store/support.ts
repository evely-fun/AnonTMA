import { create } from "zustand";

import { request } from "@/shared/lib/api";

export type TicketTopic = "technical" | "shop" | "app" | "game" | "report";
export type TicketState = "open" | "answered" | "closed";

export interface TicketCard {
  id: number;
  topic: TicketTopic;
  subject: string;
  state: TicketState;
  authorId: number;
  assigneeId: number | null;
  unread: boolean;
  lastMessageAt: string | null;
}

export interface TicketMessage {
  id: number;
  authorId: number;
  fromStaff: boolean;
  mine: boolean;
  body: string;
  createdAt: string | null;
}

export interface TicketThread {
  id: number;
  topic: TicketTopic;
  subject: string;
  state: TicketState;
  authorId: number;
  mine: boolean;
  messages: TicketMessage[];
}

interface SupportState {
  mine: TicketCard[];
  queue: TicketCard[];
  thread: TicketThread | null;
  /** Topics this account is allowed to answer; empty for an ordinary user. */
  canHandle: TicketTopic[];
  role: string;
  loading: boolean;
  busy: boolean;
  load: () => Promise<void>;
  loadQueue: () => Promise<void>;
  open: (ticketId: number) => Promise<void>;
  close: () => void;
  create: (topic: TicketTopic, subject: string, body: string) => Promise<boolean>;
  reply: (ticketId: number, body: string) => Promise<boolean>;
  resolve: (ticketId: number) => Promise<void>;
}

export const useSupport = create<SupportState>((set, get) => ({
  mine: [],
  queue: [],
  thread: null,
  canHandle: [],
  role: "none",
  loading: false,
  busy: false,

  load: async () => {
    set({ loading: true });
    try {
      const payload = await request<{
        tickets: TicketCard[];
        role: string;
        canHandle: TicketTopic[];
      }>("/support/me");
      set({ mine: payload.tickets, role: payload.role, canHandle: payload.canHandle });
    } catch {
      set({ mine: [] });
    } finally {
      set({ loading: false });
    }
  },

  loadQueue: async () => {
    if (get().canHandle.length === 0) return;
    try {
      const payload = await request<{ tickets: TicketCard[] }>("/support/queue");
      set({ queue: payload.tickets });
    } catch {
      set({ queue: [] });
    }
  },

  open: async (ticketId) => {
    set({ loading: true });
    try {
      set({ thread: await request<TicketThread>(`/support/tickets/${ticketId}`) });
    } finally {
      set({ loading: false });
    }
  },

  close: () => set({ thread: null }),

  create: async (topic, subject, body) => {
    set({ busy: true });
    try {
      await request("/support/tickets", { method: "POST", body: { topic, subject, body } });
      await get().load();
      return true;
    } catch {
      return false;
    } finally {
      set({ busy: false });
    }
  },

  reply: async (ticketId, body) => {
    set({ busy: true });
    try {
      await request(`/support/tickets/${ticketId}/reply`, { method: "POST", body: { body } });
      await get().open(ticketId);
      // Both lists carry the state, so whichever one you came from is stale now.
      await get().load();
      await get().loadQueue();
      return true;
    } catch {
      return false;
    } finally {
      set({ busy: false });
    }
  },

  resolve: async (ticketId) => {
    await request(`/support/tickets/${ticketId}/close`, { method: "POST" });
    await get().open(ticketId);
    await get().load();
    await get().loadQueue();
  },
}));
