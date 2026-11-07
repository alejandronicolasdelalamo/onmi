/**
 * Cliente HTTP. La sesión vive en cookies httpOnly (el JS nunca ve el JWT);
 * para peticiones que modifican datos se envía el token CSRF (doble envío de cookie).
 * Si el access token caduca, renueva una sola vez con el refresh token y reintenta.
 */
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
];

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-TOKEN": cookie("csrf_refresh_token") ?? "" },
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
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
    !NO_REFRESH.some((p) => path.startsWith(p))
  ) {
    if (await refreshSession()) return request<T>(method, path, body, true);
  }
  throw new ApiError(
    res.status,
    err?.code ?? "error",
    err?.message ?? res.statusText,
    err?.details,
  );
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) =>
    request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) =>
    request<T>("PATCH", path, body ?? {}),
  delete: <T>(path: string) => request<T>("DELETE", path),
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
