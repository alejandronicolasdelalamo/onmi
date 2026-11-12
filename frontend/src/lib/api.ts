/**
 * Cliente HTTP. La sesión vive en cookies httpOnly (el JS nunca ve el JWT);
 * para peticiones que modifican datos se envía el token CSRF (doble envío de cookie).
 * Si el access token caduca, renueva una sola vez con el refresh token y reintenta.
 */
import { unlockHeaderFor } from "./notes-lock";

const BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: { field: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ApiError["details"],
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function cookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.split("=")[1];
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const NO_REFRESH = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/demo",
  "/api/auth/google",
  "/api/auth/passkeys/login",
];

/** Estado HTTP del refresh (0 = sin red). Un 5xx o la falta de red NO significan "sesión caducada". */
let refreshing: Promise<number> | null = null;

async function refreshSession(): Promise<number> {
  refreshing ??= fetch(`${BASE}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-TOKEN": cookie("csrf_refresh_token") ?? "" },
  })
    .then((r) => r.status)
    .catch(() => 0)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** ¿Fallo del servidor o de la red (p. ej. el servicio gratuito aún está despertando)? */
export function isServerUnavailable(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || err.status >= 500);
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET")
    headers["X-CSRF-TOKEN"] = cookie("csrf_access_token") ?? "";
  // Desbloqueo temporal de las notas ocultas (vive solo en memoria).
  const unlock = unlockHeaderFor(path);
  if (unlock) headers["X-Notes-Unlock"] = unlock;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network_error", "Network error");
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  if (res.ok) return data as T;

  const err = data?.error;
  if (
    res.status === 401 &&
    !retried &&
    cookie("csrf_refresh_token") && // sin cookie de refresh no hay nada que renovar
    err?.code !== "invalid_credentials" && // una contraseña incorrecta no es una sesión caducada (y no se repite)
    !NO_REFRESH.some((p) => path.startsWith(p))
  ) {
    const status = await refreshSession();
    if (status >= 200 && status < 300)
      return request<T>(method, path, body, true);
    // Servidor dormido o sin red: no es una sesión caducada, así que no se cierra la sesión.
    if (status === 0 || status >= 500)
      throw new ApiError(status, "network_error", "Server unavailable");
  }
  throw new ApiError(
    res.status,
    err?.code ?? "error",
    err?.message ?? res.statusText,
    err?.details,
  );
}

/** Descarga un binario (una imagen de nota) con la sesión y, si hace falta, el desbloqueo de notas. */
export async function fetchBlob(path: string, retried = false): Promise<Blob> {
  const headers: Record<string, string> = {};
  const unlock = unlockHeaderFor(path);
  if (unlock) headers["X-Notes-Unlock"] = unlock;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { credentials: "include", headers });
  } catch {
    throw new ApiError(0, "network_error", "Network error");
  }
  if (res.ok) return res.blob();
  if (res.status === 401 && !retried && cookie("csrf_refresh_token")) {
    const status = await refreshSession();
    if (status >= 200 && status < 300) return fetchBlob(path, true);
  }
  const data = await res.json().catch(() => null);
  throw new ApiError(
    res.status,
    data?.error?.code ?? "error",
    data?.error?.message ?? res.statusText,
  );
}

/** Sube un binario tal cual (cuerpo = bytes) y devuelve el JSON de la respuesta. */
export async function postBinary<T>(
  path: string,
  blob: Blob,
  retried = false,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "X-CSRF-TOKEN": cookie("csrf_access_token") ?? "",
      },
      body: blob,
    });
  } catch {
    throw new ApiError(0, "network_error", "Network error");
  }
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;
  if (res.status === 401 && !retried && cookie("csrf_refresh_token")) {
    const status = await refreshSession();
    if (status >= 200 && status < 300) return postBinary<T>(path, blob, true);
  }
  throw new ApiError(
    res.status,
    data?.error?.code ?? "error",
    data?.error?.message ?? res.statusText,
  );
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) =>
    request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) =>
    request<T>("PATCH", path, body ?? {}),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

export function qs(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
