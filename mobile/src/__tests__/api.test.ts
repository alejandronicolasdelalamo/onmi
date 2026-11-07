const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

import { api, ApiError, setSignedOutHandler } from "../api";
import { clearTokens, getTokens, loadTokens, saveTokens } from "../tokens";

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, statusText: String(status), json: async () => body }) as Response;

const fetchMock = jest.fn();
beforeEach(async () => {
  mockStore.clear();
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
  setSignedOutHandler(null);
  await clearTokens();
});

describe("tokens", () => {
  it("se guardan en el almacén seguro y se recuperan al arrancar", async () => {
    await saveTokens("acc", "ref");
    expect(mockStore.get("onmi.access")).toBe("acc");
    // Simula reiniciar la app: la memoria se pierde, el almacén no.
    await saveTokens("acc", "ref");
    const loaded = await loadTokens();
    expect(loaded).toEqual({ access: "acc", refresh: "ref" });
  });

  it("al renovar solo el access token se conserva el refresh", async () => {
    await saveTokens("a1", "r1");
    await saveTokens("a2");
    expect(getTokens()).toEqual({ access: "a2", refresh: "r1" });
  });

  it("clearTokens borra memoria y almacén", async () => {
    await saveTokens("a", "r");
    await clearTokens();
    expect(getTokens()).toEqual({ access: null, refresh: null });
    expect(mockStore.size).toBe(0);
  });
});

describe("api client", () => {
  it("se identifica como móvil y envía el Bearer solo si hay sesión", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await api.get("/api/ping");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ "X-Client": "mobile" });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();

    await saveTokens("tok", "ref");
    await api.post("/api/notes", { title: "x" });
    const [, init] = fetchMock.mock.calls[1];
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ title: "x" }));
  });

  it("nunca envía cookies ni cabeceras CSRF (la sesión móvil va por Bearer)", async () => {
    await saveTokens("tok", "ref");
    fetchMock.mockResolvedValue(json(200, {}));
    await api.post("/api/habits/1/toggle", {});
    const headers = Object.keys(fetchMock.mock.calls[0][1].headers).map((h) => h.toLowerCase());
    expect(headers).not.toContain("cookie");
    expect(headers).not.toContain("x-csrf-token");
  });

  it("convierte los errores de la API en ApiError con su código", async () => {
    fetchMock.mockResolvedValue(json(422, { error: { code: "validation_error", message: "bad", details: [{ field: "email", message: "x" }] } }));
    const err = await api.post("/api/auth/register", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "validation_error", details: [{ field: "email", message: "x" }] });
  });

  it("errores de red -> network_error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expect(api.get("/api/x")).rejects.toMatchObject({ status: 0, code: "network_error" });
  });

  it("renueva el access token con el refresh y reintenta una vez", async () => {
    await saveTokens("old", "ref");
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "token_expired", message: "expired" } }))
      .mockResolvedValueOnce(json(200, { access_token: "new" }))
      .mockResolvedValueOnce(json(200, { items: [1] }));
    await expect(api.get("/api/notes")).resolves.toEqual({ items: [1] });

    expect(fetchMock.mock.calls[1][0]).toContain("/api/auth/refresh");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer ref"); // se renueva con el refresh token
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer new"); // y se reintenta con el nuevo
    expect(getTokens()).toEqual({ access: "new", refresh: "ref" });
  });

  it("varias peticiones caducadas a la vez comparten una sola renovación", async () => {
    await saveTokens("old", "ref");
    fetchMock.mockImplementation(async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
      if (url.endsWith("/api/auth/refresh")) return json(200, { access_token: "new" });
      return init.headers.Authorization === "Bearer new" ? json(200, { ok: true }) : json(401, { error: { code: "token_expired", message: "x" } });
    });
    await Promise.all([api.get("/api/a"), api.get("/api/b"), api.get("/api/c")]);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/api/auth/refresh"))).toHaveLength(1);
  });

  it("si el refresh también falla, cierra la sesión: borra tokens y avisa", async () => {
    await saveTokens("old", "ref");
    const signedOut = jest.fn();
    setSignedOutHandler(signedOut);
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "token_expired", message: "x" } }))
      .mockResolvedValueOnce(json(401, { error: { code: "token_expired", message: "x" } }));
    await expect(api.get("/api/notes")).rejects.toMatchObject({ status: 401 });
    expect(signedOut).toHaveBeenCalledTimes(1);
    expect(getTokens()).toEqual({ access: null, refresh: null });
    expect(fetchMock).toHaveBeenCalledTimes(2); // sin bucle de reintentos
  });

  it("un 401 de login (credenciales incorrectas) no cierra ninguna sesión ni intenta renovar", async () => {
    await saveTokens("tok", "ref");
    const signedOut = jest.fn();
    setSignedOutHandler(signedOut);
    fetchMock.mockResolvedValue(json(401, { error: { code: "invalid_credentials", message: "no" } }));
    await expect(api.post("/api/auth/login", {})).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(signedOut).not.toHaveBeenCalled();
    expect(getTokens().access).toBe("tok");
  });

  it("sin refresh token un 401 no intenta renovar", async () => {
    fetchMock.mockResolvedValue(json(401, { error: { code: "unauthorized", message: "x" } }));
    await expect(api.get("/api/notes")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
