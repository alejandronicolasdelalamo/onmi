import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/lib/i18n";
import type { CoachStatus, User } from "@/lib/types";

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
const auth = vi.hoisted(() => ({ user: null as unknown, setUser: vi.fn() }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual<object>("@/lib/api")),
  api,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: auth.user, setUser: auth.setUser }),
}));

import { AiCoachCard } from "./ai-coach-card";

const user = (over: Partial<User> = {}) =>
  ({
    id: 1,
    name: "Ana",
    email: "a@a.io",
    ai_coach_enabled: false,
    is_demo: false,
    ...over,
  }) as User;
const status = (over: Partial<CoachStatus> = {}): CoachStatus => ({
  ai_available: true,
  ai_enabled: false,
  can_enable: true,
  model: "claude-opus-5-5",
  review: null,
  ...over,
});
const renderCard = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AiCoachCard />
    </QueryClientProvider>,
  );

describe("AiCoachCard", () => {
  beforeEach(async () => {
    api.get.mockReset();
    api.patch.mockReset();
    auth.setUser.mockReset();
    auth.user = user();
    await i18n.changeLanguage("en");
  });

  it("no aparece si el servidor no tiene clave de Claude", async () => {
    api.get.mockResolvedValue(status({ ai_available: false }));
    const { container } = renderCard();
    await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("explica con exactitud qué se envía y qué nunca", async () => {
    api.get.mockResolvedValue(status());
    renderCard();
    expect(await screen.findByText("What is sent")).toBeInTheDocument();
    expect(
      screen.getByText(/Only totals and averages from your last 7 days/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your notes, your email, your name/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Requests go to Anthropic's API (claude-opus-5-5)."),
    ).toBeInTheDocument();
  });

  it("empieza desactivado y activarlo guarda la preferencia", async () => {
    api.get.mockResolvedValue(status());
    api.patch.mockResolvedValue({ user: user({ ai_coach_enabled: true }) });
    renderCard();
    const toggle = await screen.findByRole("switch", {
      name: "Use Claude to write my weekly review",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(api.patch).toHaveBeenCalledWith("/api/auth/me", {
      ai_coach_enabled: true,
    });
    await vi.waitFor(() =>
      expect(auth.setUser).toHaveBeenCalledWith(
        expect.objectContaining({ ai_coach_enabled: true }),
      ),
    );
  });

  it("la cuenta demo no puede activarlo", async () => {
    auth.user = user({ is_demo: true });
    api.get.mockResolvedValue(status({ can_enable: false }));
    renderCard();
    expect(await screen.findByRole("switch")).toBeDisabled();
    expect(
      screen.getByText("The shared demo account never uses AI."),
    ).toBeInTheDocument();
  });
});
