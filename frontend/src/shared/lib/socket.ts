import { apiBaseUrl, tokens } from "./api";

export interface Frame<T = Record<string, unknown>> {
  type: string;
  payload: T;
  ack?: string;
}

type Listener = (payload: Record<string, unknown>, frame: Frame) => void;
type StatusListener = (status: SocketStatus) => void;

export type SocketStatus = "idle" | "connecting" | "online" | "reconnecting" | "offline";

const RECONNECT_STEPS = [400, 900, 1800, 3200, 5000, 8000];
const HEARTBEAT_INTERVAL = 25000;

const socketUrl = (token: string): string => {
  const base = apiBaseUrl.replace(/^http/, "ws").replace(/\/$/, "");
  return `${base}/ws?token=${encodeURIComponent(token)}`;
};

class RealtimeClient {
  private socket: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private statusListeners = new Set<StatusListener>();
  private queue: string[] = [];
  private attempt = 0;
  private heartbeat: number | null = null;
  private reconnectTimer: number | null = null;
  private manualClose = false;

  status: SocketStatus = "idle";

  connect(): void {
    const token = tokens.access;
    if (!token || this.socket) {
      return;
    }
    this.manualClose = false;
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");

    const socket = new WebSocket(socketUrl(token));
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setStatus("online");
      this.flush();
      this.startHeartbeat();
    };

    socket.onmessage = (message) => {
      let frame: Frame;
      try {
        frame = JSON.parse(message.data as string) as Frame;
      } catch {
        return;
      }
      this.dispatch(frame);
    };

    socket.onclose = () => {
      this.teardown();
      if (!this.manualClose) {
        this.scheduleReconnect();
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  disconnect(): void {
    this.manualClose = true;
    this.socket?.close();
    this.teardown();
    this.setStatus("idle");
  }

  send(type: string, payload: Record<string, unknown> = {}): void {
    const frame = JSON.stringify({ type, payload });
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(frame);
      return;
    }
    if (this.queue.length < 40) {
      this.queue.push(frame);
    }
    this.connect();
  }

  on(type: string, listener: Listener): () => void {
    const bucket = this.listeners.get(type) ?? new Set<Listener>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
    return () => {
      bucket.delete(listener);
    };
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private dispatch(frame: Frame): void {
    const exact = this.listeners.get(frame.type);
    exact?.forEach((listener) => listener(frame.payload ?? {}, frame));
    const wildcard = this.listeners.get("*");
    wildcard?.forEach((listener) => listener(frame.payload ?? {}, frame));
  }

  private flush(): void {
    while (this.queue.length && this.socket?.readyState === WebSocket.OPEN) {
      const frame = this.queue.shift();
      if (frame) {
        this.socket.send(frame);
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = window.setInterval(() => {
      this.send("ping");
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      window.clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private teardown(): void {
    this.stopHeartbeat();
    this.socket = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }
    this.setStatus("reconnecting");
    const delay = RECONNECT_STEPS[Math.min(this.attempt, RECONNECT_STEPS.length - 1)];
    this.attempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private setStatus(status: SocketStatus): void {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }
}

export const realtime = new RealtimeClient();

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && realtime.status !== "online") {
      realtime.connect();
    }
  });
}
