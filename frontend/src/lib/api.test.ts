import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, qs } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("api client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    document.cookie = "csrf_access_token=abc123";
    document.cookie = "csrf_refresh_token=refresh456";
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("envía cookies y token CSRF solo en peticiones que modifican datos", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await api.get("/api/notes");
    await api.post("/api/notes", { title: "x" });
    const [getCall, postCall] = fetchMock.mock.calls;
    expect(getCall[1].credentials).toBe("include");
    expect(getCall[1].headers["X-CSRF-TOKEN"]).toBeUndefined();
    expect(postCall[1].headers["X-CSRF-TOKEN"]).toBe("abc123");
    expect(postCall[1].body).toBe(JSON.stringify({ title: "x" }));
  });

  it("convierte errores de la API en ApiError con su código", async () => {
    fetchMock.mockResolvedValue(
      json(422, {
        error: {
          code: "validation_error",
          message: "bad",
          details: [{ field: "email", message: "invalid" }],
        },
      }),
    );
    const err = await api
      .post("/api/auth/register", {})
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 422,
      code: "validation_error",
      details: [{ field: "email", message: "invalid" }],
    });
  });

  it("renueva la sesión una vez y reintenta cuando el access token caduca", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(401, { error: { code: "token_expired", message: "expired" } }),
      )
      .mockResolvedValueOnce(json(200, { user: {} })) // refresh
      .mockResolvedValueOnce(json(200, { items: [1] })); // reintento
    await expect(api.get("/api/notes")).resolves.toEqual({ items: [1] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain("/api/auth/refresh");
    expect(fetchMock.mock.calls[1][1].headers["X-CSRF-TOKEN"]).toBe(
      "refresh456",
    );
  });

  it("no entra en bucle si el refresh falla", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(401, { error: { code: "token_expired", message: "expired" } }),
      )
      .mockResolvedValueOnce(
        json(401, { error: { code: "token_expired", message: "expired" } }),
      );
    await expect(api.get("/api/notes")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("no intenta refrescar en el login", async () => {
    fetchMock.mockResolvedValue(
      json(401, { error: { code: "invalid_credentials", message: "no" } }),
    );
    await expect(api.post("/api/auth/login", {})).rejects.toMatchObject({
      code: "invalid_credentials",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("errores de red -> network_error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(api.get("/api/x")).rejects.toMatchObject({
      status: 0,
      code: "network_error",
    });
  });

  it("qs omite valores vacíos", () => {
    expect(qs({ q: "a b", tag: "", n: 0, x: undefined, p: true })).toBe(
      "?q=a+b&n=0&p=true",
    );
    expect(qs({})).toBe("");
  });
});
