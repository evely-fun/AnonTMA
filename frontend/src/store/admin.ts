import { create } from "zustand";

import { request } from "@/shared/lib/api";
import type { ModerationCase, ModerationCaseDetail } from "@/shared/lib/types";

interface Overview {
  openCases: number;
  reportsToday: number;
  bannedUsers: number;
  resolvedToday: number;
}

interface AdminState {
  allowed: boolean | null;
  overview: Overview | null;
  cases: ModerationCase[];
  detail: ModerationCaseDetail | null;
  loading: boolean;
  busy: boolean;
  check: () => Promise<boolean>;
  load: (state: "open" | "resolved") => Promise<void>;
  open: (caseId: number) => Promise<void>;
  close: () => void;
  resolve: (caseId: number, action: string, note?: string) => Promise<boolean>;
}

export const useAdmin = create<AdminState>((set, get) => ({
  allowed: null,
  overview: null,
  cases: [],
  detail: null,
  loading: false,
  busy: false,

  check: async () => {
    try {
      const payload = await request<{ admin: boolean }>("/admin/status");
      set({ allowed: payload.admin });
      return payload.admin;
    } catch {
      set({ allowed: false });
      return false;
    }
  },

  load: async (state) => {
    set({ loading: true });
    try {
      const [overview, cases] = await Promise.all([
        request<Overview>("/admin/overview"),
        request<{ cases: ModerationCase[] }>(`/admin/cases?state=${state}`),
      ]);
      set({ overview, cases: cases.cases });
    } catch {
      set({ cases: [] });
    } finally {
      set({ loading: false });
    }
  },

  open: async (caseId) => {
    try {
      set({ detail: await request<ModerationCaseDetail>(`/admin/cases/${caseId}`) });
    } catch {
      set({ detail: null });
    }
  },

  close: () => set({ detail: null }),

  resolve: async (caseId, action, note) => {
    set({ busy: true });
    try {
      await request(`/admin/cases/${caseId}/resolve`, { method: "POST", body: { action, note } });
      set({ detail: null });
      await get().load("open");
      return true;
    } catch {
      return false;
    } finally {
      set({ busy: false });
    }
  },
}));
