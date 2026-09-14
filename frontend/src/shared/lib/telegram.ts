type HapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type NotificationStyle = "error" | "success" | "warning";

interface ThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

interface SafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: Record<string, unknown> & { start_param?: string };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: ThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  ready: () => void;
  expand: () => void;
  close: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  openTelegramLink: (url: string) => void;
  openInvoice?: (url: string, callback?: (status: string) => void) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  shareToStory?: (media: string, params?: Record<string, unknown>) => void;
  switchInlineQuery?: (query: string, targets?: string[]) => void;
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (handler: () => void) => void;
    offClick: (handler: () => void) => void;
  };
  MainButton: {
    text: string;
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    setParams: (params: Record<string, unknown>) => void;
    onClick: (handler: () => void) => void;
    offClick: (handler: () => void) => void;
  };
  HapticFeedback: {
    impactOccurred: (style: HapticStyle) => void;
    notificationOccurred: (style: NotificationStyle) => void;
    selectionChanged: () => void;
  };
  CloudStorage?: {
    setItem: (key: string, value: string, callback?: (error: unknown, stored: boolean) => void) => void;
    getItem: (key: string, callback: (error: unknown, value: string) => void) => void;
  };
  onEvent: (event: string, handler: () => void) => void;
  offEvent: (event: string, handler: () => void) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const webApp = (): TelegramWebApp | undefined => window.Telegram?.WebApp;

export const isTelegram = (): boolean => Boolean(webApp()?.initData);

export const initData = (): string => webApp()?.initData ?? "";

export const startParam = (): string | undefined => {
  const fromApp = webApp()?.initDataUnsafe?.start_param;
  if (fromApp) {
    return String(fromApp);
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("tgWebAppStartParam") ?? params.get("startapp") ?? undefined;
};

/**
 * Opens a stars invoice inside Telegram. Falls back to the plain link opener
 * for clients too old to know the call, which still lands on the invoice.
 */
export const openInvoice = (url: string, onDone?: (status: string) => void): void => {
  const app = webApp();
  if (app?.openInvoice) {
    app.openInvoice(url, onDone);
    return;
  }
  app?.openTelegramLink(url);
};

export const colorScheme = (): "light" | "dark" => webApp()?.colorScheme ?? "dark";

const applySafeArea = (): void => {
  const app = webApp();
  const root = document.documentElement;
  const content = app?.contentSafeAreaInset;
  const device = app?.safeAreaInset;
  const top = Math.max(content?.top ?? 0, device?.top ?? 0);
  const bottom = Math.max(content?.bottom ?? 0, device?.bottom ?? 0);
  root.style.setProperty("--tg-safe-top", `${top || 0}px`);
  root.style.setProperty("--tg-safe-bottom", `${bottom || 0}px`);
};

const applyViewport = (): void => {
  const app = webApp();
  const height = app?.viewportStableHeight ?? window.innerHeight;
  document.documentElement.style.setProperty("--viewport-height", `${height}px`);
};

export const initTelegram = (): void => {
  const app = webApp();
  if (!app) {
    document.documentElement.style.setProperty("--viewport-height", `${window.innerHeight}px`);
    window.addEventListener("resize", () => {
      document.documentElement.style.setProperty("--viewport-height", `${window.innerHeight}px`);
    });
    return;
  }

  app.ready();
  app.expand();
  app.disableVerticalSwipes?.();
  applySafeArea();
  applyViewport();

  app.onEvent("viewportChanged", applyViewport);
  app.onEvent("safeAreaChanged", applySafeArea);
  app.onEvent("contentSafeAreaChanged", applySafeArea);
};

let hapticsEnabled = true;

export const setHapticsEnabled = (enabled: boolean): void => {
  hapticsEnabled = enabled;
};

export const haptic = {
  impact(style: HapticStyle = "light"): void {
    if (hapticsEnabled) webApp()?.HapticFeedback?.impactOccurred(style);
  },
  notify(style: NotificationStyle): void {
    if (hapticsEnabled) webApp()?.HapticFeedback?.notificationOccurred(style);
  },
  select(): void {
    if (hapticsEnabled) webApp()?.HapticFeedback?.selectionChanged();
  },
};

export const haptics = haptic;

export const backButton = {
  show(handler: () => void): () => void {
    const app = webApp();
    if (!app) {
      return () => undefined;
    }
    app.BackButton.onClick(handler);
    app.BackButton.show();
    return () => {
      app.BackButton.offClick(handler);
      app.BackButton.hide();
    };
  },
  hide(): void {
    webApp()?.BackButton.hide();
  },
};

export const openLink = (url: string): void => {
  const app = webApp();
  if (!app) {
    window.open(url, "_blank", "noopener");
    return;
  }
  if (url.startsWith("https://t.me")) {
    app.openTelegramLink(url);
    return;
  }
  app.openLink(url);
};

export const closeApp = (): void => webApp()?.close();
