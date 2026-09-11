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
        const response = await fetch(url("/auth/refresh"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
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
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, retry = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(url(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && retry && (await refreshSession())) {
    return request<T>(path, { ...options, retry: false });
  }

  const payload = await parse(response);
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(payload, response.statusText));
  }
  return payload as T;
}

export async function authenticate(): Promise<boolean> {
  const raw = initData();
  if (!raw) {
    return Boolean(accessToken);
  }
  try {
    const body = (await request<{ accessToken: string; refreshToken: string }>("/auth/telegram", {
      method: "POST",
      body: { initData: raw, startParam: startParam() },
      retry: false,
    })) as { accessToken: string; refreshToken: string };
    tokens.set(body.accessToken, body.refreshToken);
    return true;
  } catch {
    return Boolean(accessToken);
  }
}

export const apiBaseUrl = API_URL;
