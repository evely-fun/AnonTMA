type StateListener = (running: boolean) => void;

const listeners = new Set<StateListener>();

let context: AudioContext | null = null;
let keepAlive: AudioBufferSourceNode | null = null;
let silentElement: HTMLAudioElement | null = null;
let gestureBound = false;

const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAgD4AAAB9AAACABAAAABkYXRhAgAAAAEA";

const announce = (): void => {
  const running = isRunning();
  listeners.forEach((listener) => listener(running));
};

export const isRunning = (): boolean => context?.state === "running";

export const audioState = (): AudioContextState | "none" => context?.state ?? "none";

export const onAudioState = (listener: StateListener): (() => void) => {
  listeners.add(listener);
  listener(isRunning());
  return () => {
    listeners.delete(listener);
  };
};

export const getAudioContext = (): AudioContext => {
  if (context && context.state !== "closed") {
    return context;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  context = new Ctor({ latencyHint: "interactive" });
  context.onstatechange = announce;
  bindGestures();
  return context;
};

/**
 * A silent looping source keeps the graph pulling on iOS, where an otherwise
 * idle context is suspended by the system and every downstream destination,
 * including the one feeding the peer connection, goes quiet.
 */
const startKeepAlive = (ctx: AudioContext): void => {
  if (keepAlive) {
    return;
  }
  try {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    keepAlive = source;
  } catch {
    keepAlive = null;
  }
};

const primeSilentElement = async (): Promise<void> => {
  if (!silentElement) {
    const element = document.createElement("audio");
    element.setAttribute("playsinline", "");
    element.muted = true;
    element.loop = true;
    element.preload = "auto";
    element.style.display = "none";
    element.src = SILENT_WAV;
    document.body.appendChild(element);
    silentElement = element;
  }
  await silentElement.play().catch(() => undefined);
};

export const resumeAudio = async (): Promise<boolean> => {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => undefined);
  }
  if (ctx.state === "running") {
    startKeepAlive(ctx);
  }
  await primeSilentElement();
  announce();
  return ctx.state === "running";
};

/**
 * Telegram webviews and iOS Safari only let audio start from a real gesture.
 * Every pointer and key event is treated as that gesture until the context
 * actually reports running, so the user never has to find a special button.
 */
const bindGestures = (): void => {
  if (gestureBound || typeof document === "undefined") {
    return;
  }
  gestureBound = true;

  const wake = (): void => {
    void resumeAudio();
  };

  const events: (keyof DocumentEventMap)[] = ["pointerdown", "touchstart", "touchend", "keydown", "click"];
  events.forEach((name) => {
    document.addEventListener(name, wake, { capture: true, passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      wake();
    }
  });
};

if (typeof document !== "undefined") {
  bindGestures();
}
