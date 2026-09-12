import { create } from "zustand";

import { ApiError, request } from "@/shared/lib/api";
import type { ShopItem } from "@/shared/lib/types";

type Equipped = { avatar: string; frame: string; effect: string };

interface ShopState {
  items: ShopItem[];
  coins: number;
  equipped: Equipped;
  loading: boolean;
  busy: string | null;
  load: () => Promise<void>;
  buy: (key: string) => Promise<"ok" | "poor" | "error">;
  equip: (key: string) => Promise<boolean>;
}

const DEFAULTS: Equipped = { avatar: "geometric", frame: "none", effect: "none" };

export const useShop = create<ShopState>((set, get) => ({
  items: [],
  coins: 0,
  equipped: DEFAULTS,
  loading: false,
  busy: null,

  load: async () => {
    set({ loading: true });
    try {
      const payload = await request<{ coins: number; equipped: Equipped; items: ShopItem[] }>(
        "/shop/catalog",
      );
      set({ items: payload.items, coins: payload.coins, equipped: payload.equipped });
    } catch {
      /* keep the previous catalogue */
    } finally {
      set({ loading: false });
    }
  },

  buy: async (key) => {
    set({ busy: key });
    try {
      await request(`/shop/buy/${key}`, { method: "POST" });
      await get().load();
      return "ok";
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) return "poor";
      return "error";
    } finally {
      set({ busy: null });
    }
  },

  equip: async (key) => {
    set({ busy: key });
    try {
      const payload = await request<{ equipped: Equipped }>(`/shop/equip/${key}`, {
        method: "POST",
      });
      set({ equipped: payload.equipped });
      return true;
    } catch {
      return false;
    } finally {
      set({ busy: null });
    }
  },
}));
