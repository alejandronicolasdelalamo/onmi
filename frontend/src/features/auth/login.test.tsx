import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/lib/auth";
import i18n from "@/lib/i18n";
import { LoginPage, RegisterPage } from "./pages";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/" element={<p>HOME</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("login", () => {
  const fetchMock = vi.fn();
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.stubGlobal("fetch", fetchMock);
    // /me -> no autenticado, /config -> sin Google ni demo
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/auth/me")) return json(401, { error: { code: "unauthorized", message: "x" } });
      if (url.endsWith("/api/auth/config")) return json(200, { google_client_id: null, demo_enabled: false });
      return json(404, {});
    });
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("valida los campos antes de llamar a la API", async () => {
    renderAt("/login");
    await userEvent.click(await screen.findByRole("button", { name: /sign in/i }));
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/api/auth/login"))).toBe(false);
  });

  it("muestra el error traducido cuando las credenciales son incorrectas", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/auth/login")) return json(401, { error: { code: "invalid_credentials", message: "x" } });
      if (url.endsWith("/api/auth/me")) return json(401, { error: { code: "unauthorized", message: "x" } });
      return json(200, { google_client_id: null, demo_enabled: false });
    });
    renderAt("/login");
    await userEvent.type(await screen.findByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-pass1");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
  });

  it("al iniciar sesión correctamente navega a la home", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/api/auth/login"))
        return json(200, { user: { id: 1, name: "Ana", email: "ana@example.com", role: "user", locale: "en", email_verified: true } });
      if (url.endsWith("/api/auth/me")) return json(401, { error: { code: "unauthorized", message: "x" } });
      return json(200, { google_client_id: null, demo_enabled: false });
    });
    renderAt("/login");
    await userEvent.type(await screen.findByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Sup3rsecret!");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText("HOME")).toBeInTheDocument());
  });

  it("el registro exige una contraseña que mezcle letras y números", async () => {
    renderAt("/register");
    await userEvent.type(await screen.findByLabelText("Name"), "Ana");
    await userEvent.type(screen.getByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "onlyletters");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText(/mixing letters and numbers/i, { selector: "[role=alert]" })).toBeInTheDocument();
  });

  it("cambia de idioma", async () => {
    await i18n.changeLanguage("es");
    renderAt("/login");
    expect(await screen.findByRole("button", { name: /iniciar sesión/i })).toBeInTheDocument();
    await i18n.changeLanguage("en");
  });
});
