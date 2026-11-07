import { Platform } from "react-native";
import { clearTokens, getTokens, saveTokens } from "./tokens";

/**
 * URL de la API. Define `EXPO_PUBLIC_API_URL` (p. ej. https://onmi.example.com).
 * Por defecto apunta al backend local: el emulador de Android ve el equipo anfitrión en 10.0.2.2.
 */
const DEFAULT_URL = Platform.OS === "android" ? "http://10.0.2.2:5000" : "http://localhost:5000";
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_URL).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code: string;
  details?: { field: string; message: string }[];

  constructor(status: number, code: string, message: string, details?: ApiError["details"]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
// En estas rutas un 401 significa "credenciales incorrectas", no "sesión caducada".
const NO_REFRESH = ["/api/auth/login", "/api/auth/register", "/api/auth/refresh", "/api/auth/demo", "/api/auth/google"];

let onSignedOut: (() => void) | null = null;
export function setSignedOutHandler(handler: (() => void) | null) {
  onSignedOut = handler;
}

let refreshing: Promise<boolean> | null = null;

/** Renueva el access token con el refresh token (una sola petición aunque varias fallen a la vez). */
async function refreshSession(): Promise<boolean> {
  const { refresh } = getTokens();
  if (!refresh) return false;
  refreshing ??= fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${refresh}`, "X-Client": "mobile", Accept: "application/json" },
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = (await res.json()) as { access_token?: string };
      if (!data.access_token) return false;
      await saveTokens(data.access_token);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(method: Method, path: string, body?: unknown, retried = false): Promise<T> {
  const headers: Record<string, string> = { "X-Client": "mobile", Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const { access } = getTokens();
  if (access) headers.Authorization = `Bearer ${access}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "network_error", "Network error");
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.ok) return data as T;

  if (res.status === 401 && !NO_REFRESH.some((p) => path.startsWith(p)) && getTokens().refresh) {
    if (!retried && (await refreshSession())) return request<T>(method, path, body, true);
    // El refresh token también ha caducado o fue rechazado: la sesión terminó.
    await clearTokens();
    onSignedOut?.();
  }
  const err = data?.error;
  throw new ApiError(res.status, err?.code ?? "error", err?.message ?? res.statusText, err?.details);
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
