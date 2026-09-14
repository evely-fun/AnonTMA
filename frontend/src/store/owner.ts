import { create } from "zustand";

import { request } from "@/shared/lib/api";

export interface OwnerItem {
  key: string;
  category: string;
  value: string;
  rarity: string;
  exclusive: boolean;
}

export interface PersonCard {
  userId: number;
  anonName: string;
  avatarSeed: string;
  role: string;
  coins: number;
  level: number;
  isBanned: boolean;
  mutedUntil: string | null;
  warnings: number;
  createdAt: string | null;
}

export interface PromoCode {
  id: number;
  code: string;
  items: string[];
  coins: number;
  premiumDays: number;
  used: number;
  maxUses: number;
  active: boolean;
  note: string | null;
  expiresAt: string | null;
}

export interface LedgerEntry {
  id: number;
  actor: string;
  target: string;
  targetId: number;
  kind: string;
  payload: { items?: string[]; coins?: number; energy?: number; premiumDays?: number };
  note: string | null;
  at: string | null;
}

export interface GrantDraft {
  userId: number;
  items: string[];
  coins: number;
  energy: number;
  premiumDays: number;
  note?: string;
}

export interface CodeDraft {
  items: string[];
  coins: number;
  premiumDays: number;
  maxUses: number;
  daysValid: number;
  note?: string;
}

interface OwnerState {
  catalogue: OwnerItem[];
  codes: PromoCode[];
  ledger: LedgerEntry[];
  people: PersonCard[];
  loading: boolean;
  busy: boolean;
  load: () => Promise<void>;
  search: (query: string) => Promise<void>;
  grant: (draft: GrantDraft) => Promise<boolean>;
  createCode: (draft: CodeDraft) => Promise<string | null>;
  revokeCode: (codeId: number) => Promise<void>;
}

/**
 * The owner's side of the app. Nothing here knows a Telegram id: people are
 * found by the anonymous name everyone else sees, and a grant is written to a
 * ledger rather than happening quietly.
 */
export const useOwner = create<OwnerState>((set, get) => ({
  catalogue: [],
  codes: [],
  ledger: [],
  people: [],
  loading: false,
  busy: false,

  load: async () => {
    set({ loading: true });
    try {
      const payload = await request<{
        catalogue: OwnerItem[];
        codes: PromoCode[];
        ledger: LedgerEntry[];
      }>("/owner/overview");
      set({ catalogue: payload.catalogue, codes: payload.codes, ledger: payload.ledger });
    } catch {
      set({ catalogue: [], codes: [], ledger: [] });
    } finally {
      set({ loading: false });
    }
  },

  search: async (query) => {
    try {
      const payload = await request<{ people: PersonCard[] }>(
        `/owner/people?query=${encodeURIComponent(query)}`,
      );
      set({ people: payload.people });
    } catch {
      set({ people: [] });
    }
  },

  grant: async (draft) => {
    set({ busy: true });
    try {
      await request("/owner/grant", { method: "POST", body: draft });
      await get().load();
      return true;
    } catch {
      return false;
    } finally {
      set({ busy: false });
    }
  },

  createCode: async (draft) => {
    set({ busy: true });
    try {
      const payload = await request<{ code: string }>("/owner/codes", {
        method: "POST",
        body: draft,
      });
      await get().load();
      return payload.code;
    } catch {
      return null;
    } finally {
      set({ busy: false });
    }
  },

  revokeCode: async (codeId) => {
    set({ busy: true });
    try {
      await request(`/owner/codes/${codeId}/revoke`, { method: "POST" });
      await get().load();
    } finally {
      set({ busy: false });
    }
  },
}));
