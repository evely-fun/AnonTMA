import { create } from "zustand";

import { request } from "@/shared/lib/api";
import type { EconomyState, Product, SpinResult, StreakReward } from "@/shared/lib/types";

interface EconomyStore {
  state: EconomyState | null;
  products: Product[];
  mode: "test" | "live";
  loading: boolean;
  spinning: boolean;
  lastSpin: SpinResult | null;
  load: () => Promise<void>;
  loadProducts: () => Promise<void>;
  spin: () => Promise<SpinResult | null>;
  claimStreak: () => Promise<StreakReward | null>;
  purchase: (key: string) => Promise<{ mode: string; url?: string } | null>;
  clearSpin: () => void;
  patch: (state: EconomyState) => void;
}

export const useEconomy = create<EconomyStore>((set) => ({
  state: null,
  products: [],
  mode: "test",
  loading: false,
  spinning: false,
  lastSpin: null,

  load: async () => {
    set({ loading: true });
    try {
      const state = await request<EconomyState>("/economy/state");
      set({ state, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  loadProducts: async () => {
    try {
      const payload = await request<{ mode: "test" | "live"; products: Product[] }>(
        "/economy/products",
      );
      set({ products: payload.products, mode: payload.mode });
    } catch {
      /* keep the previous catalog */
    }
  },

  spin: async () => {
    set({ spinning: true });
    try {
      const payload = await request<{ result: SpinResult; state: EconomyState }>(
        "/economy/wheel/spin",
        { method: "POST" },
      );
      set({ state: payload.state, lastSpin: payload.result });
      return payload.result;
    } catch {
      return null;
    } finally {
      set({ spinning: false });
    }
  },

  claimStreak: async () => {
    try {
      const payload = await request<{ reward: StreakReward; state: EconomyState }>(
        "/economy/streak/claim",
        { method: "POST" },
      );
      set({ state: payload.state });
      return payload.reward;
    } catch {
      return null;
    }
  },

  purchase: async (key) => {
    try {
      const payload = await request<{ mode: string; url?: string; state: EconomyState }>(
        `/economy/purchase/${key}`,
        { method: "POST" },
      );
      set({ state: payload.state });
      return payload;
    } catch {
      return null;
    }
  },

  clearSpin: () => set({ lastSpin: null }),
  patch: (state) => set({ state }),
}));
