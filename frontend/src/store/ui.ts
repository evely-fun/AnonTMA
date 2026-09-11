import { create } from "zustand";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  tone: "neutral" | "success" | "danger";
  duration: number;
}

interface UiState {
  toasts: Toast[];
  sheet: string | null;
  theme: "dark" | "light";
  push: (toast: Omit<Toast, "id" | "tone" | "duration"> & { tone?: Toast["tone"]; duration?: number }) => void;
  dismiss: (id: string) => void;
  openSheet: (key: string) => void;
  closeSheet: () => void;
  setTheme: (theme: "dark" | "light") => void;
}

export const useUi = create<UiState>((set) => ({
  toasts: [],
  sheet: null,
  theme: "dark",
  push: (toast) => {
    const entry: Toast = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      tone: toast.tone ?? "neutral",
      duration: toast.duration ?? 3200,
      title: toast.title,
      description: toast.description,
      icon: toast.icon,
    };
    set((state) => ({ toasts: [...state.toasts.slice(-3), entry] }));
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== entry.id) }));
    }, entry.duration);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
  openSheet: (key) => set({ sheet: key }),
  closeSheet: () => set({ sheet: null }),
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
}));

export const toast = (
  title: string,
  options: { description?: string; icon?: string; tone?: Toast["tone"] } = {},
): void => {
  useUi.getState().push({ title, ...options });
};
