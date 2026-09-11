import { initData, startParam } from "./telegram";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";
const API_PREFIX = "/api/v1";
const ACCESS_KEY = "anon.access";
const REFRESH_KEY = "anon.refresh";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const storage = {
  read(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  },
  clear(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
};

let accessToken: string | null = storage.read(ACCESS_KEY);
let refreshToken: string | null = storage.read(REFRESH_KEY);
let refreshPromise: Promise<boolean> | null = null;

export const tokens = {
  get access(): string | null {
    return accessToken;
  },
  set(access: string, refresh: string): void {
    accessToken = access;
    refreshToken = refresh;
    storage.write(ACCESS_KEY, access);
    storage.write(REFRESH_KEY, refresh);
  },
  clear(): void {
    accessToken = null;
    refreshToken = null;
    storage.clear(ACCESS_KEY);
    storage.clear(REFRESH_KEY);
  },
};

const url = (path: string): string => `${API_URL}${API_PREFIX}${path}`;

const DEFAULT_TIMEOUT = 20000;
const COLD_START_TIMEOUT = 70000;

const fetchWithTimeout = async (
  target: string,
  init: RequestInit,
  timeout: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(target, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const parse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const errorMessage = (body: unknown, fallback: string): string => {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
  }
  return fallback;
};

async function refreshSession(): Promise<boolean> {
  if (!refreshToken) {
    return false;
  }
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetchWithTimeout(
          url("/auth/refresh"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          },
          DEFAULT_TIMEOUT,
        );
        if (!response.ok) {
          tokens.clear();
          return false;
        }
        const body = (await response.json()) as { accessToken: string; refreshToken: string };
        tokens.set(body.accessToken, body.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  retry?: boolean;
  timeout?: number;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, retry = true, timeout = DEFAULT_TIMEOUT } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetchWithTimeout(
    url(path),
    {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    timeout,
  );

  if (response.status === 401 && retry && (await refreshSession())) {
    return request<T>(path, { ...options, retry: false });
  }

  const payload = await parse(response);
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(payload, response.statusText));
  }
  return payload as T;
}

export type AuthOutcome =
  | { status: "ok" }
  | { status: "no-telegram" }
  | { status: "rejected"; message: string }
  | { status: "unreachable"; message: string };

const AUTH_ATTEMPTS = 3;
const AUTH_BACKOFF = [0, 2500, 6000];

export async function authenticate(): Promise<AuthOutcome> {
  const raw = initData();
  if (!raw) {
    return accessToken ? { status: "ok" } : { status: "no-telegram" };
  }

  let lastMessage = "The server did not answer";

  for (let attempt = 0; attempt < AUTH_ATTEMPTS; attempt += 1) {
    if (AUTH_BACKOFF[attempt] > 0) {
      await wait(AUTH_BACKOFF[attempt]);
    }
    try {
      const body = await request<{ accessToken: string; refreshToken: string }>("/auth/telegram", {
        method: "POST",
        body: { initData: raw, startParam: startParam() },
        retry: false,
        timeout: COLD_START_TIMEOUT,
      });
      tokens.set(body.accessToken, body.refreshToken);
      return { status: "ok" };
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401 || error.status === 403) {
          return { status: "rejected", message: error.message };
        }
        lastMessage = error.status === 429 ? "Too many attempts, wait a moment" : error.message;
      } else if (error instanceof Error) {
        lastMessage = error.name === "AbortError" ? "The server is waking up" : error.message;
      }
    }
  }

  return accessToken ? { status: "ok" } : { status: "unreachable", message: lastMessage };
}

export const apiBaseUrl = API_URL;
