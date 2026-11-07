import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/lib/i18n";
import type { CoachStatus } from "@/lib/types";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api };
});

import { ApiError } from "@/lib/api";
import { CoachCard } from "./coach-card";

const review = {
  text: "### This week\nYou completed 80% of your habits.",
  source: "local" as const,
  model: null,
  locale: "en",
  week_start: "2025-03-03",
  created_at: "2025-03-05T10:00:00",
};
const status = (over: Partial<CoachStatus> = {}): CoachStatus => ({
  ai_available: false,
  ai_enabled: false,
  can_enable: false,
  model: null,
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
      <MemoryRouter>
        <CoachCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("CoachCard", () => {
  beforeEach(async () => {
    api.get.mockReset();
    api.post.mockReset();
    await i18n.changeLanguage("en");
  });

  it("sin revisión invita a generarla y la muestra al terminar", async () => {
    api.get.mockResolvedValue(status());
    api.post.mockResolvedValue(review);
    renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Generate my weekly review" }),
    );
    expect(
      await screen.findByText(/You completed 80% of your habits/),
    ).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/api/coach/review", {
      refresh: false,
    });
    expect(screen.getByText("Generated without AI")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh review" }),
    ).toBeInTheDocument();
  });

  it("indica quién escribió la revisión cuando fue Claude", async () => {
    api.get.mockResolvedValue(
      status({
        review: { ...review, source: "claude", model: "claude-opus-5-5" },
        ai_enabled: true,
      }),
    );
    renderCard();
    expect(await screen.findByText("Written by Claude")).toBeInTheDocument();
  });

  it("el botón de actualizar pide refresh y avisa del enfriamiento", async () => {
    api.get.mockResolvedValue(status({ review }));
    api.post.mockRejectedValue(
      new ApiError(429, "coach_cooldown", "wait", [
        { field: "retry_after", message: "1500" },
      ]),
    );
    renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Refresh review" }),
    );
    expect(api.post).toHaveBeenCalledWith("/api/coach/review", {
      refresh: true,
    });
    expect(
      await screen.findByText("You can refresh again in 25 min."),
    ).toBeInTheDocument();
  });

  it("avisa cuando Claude falló y se generó sin IA", async () => {
    api.get.mockResolvedValue(
      status({ ai_available: true, can_enable: true, ai_enabled: true }),
    );
    api.post.mockResolvedValue({ ...review, ai_error: true });
    renderCard();
    await userEvent.click(
      await screen.findByRole("button", { name: "Generate my weekly review" }),
    );
    expect(
      await screen.findByText(/Claude was not available just now/),
    ).toBeInTheDocument();
  });

  it("sugiere activar la IA solo si se puede y aún no está activada", async () => {
    api.get.mockResolvedValue(
      status({ ai_available: true, can_enable: true, ai_enabled: false }),
    );
    renderCard();
    expect(
      await screen.findByText(/Want Claude to write it/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings#ai-coach",
    );
  });

  it("no sugiere nada si el servidor no tiene IA o si ya está activada", async () => {
    api.get.mockResolvedValue(status({ ai_available: false }));
    const { unmount } = renderCard();
    await screen.findByRole("button", { name: "Generate my weekly review" });
    expect(
      screen.queryByText(/Want Claude to write it/),
    ).not.toBeInTheDocument();
    unmount();

    api.get.mockResolvedValue(
      status({ ai_available: true, can_enable: true, ai_enabled: true }),
    );
    renderCard();
    await screen.findByRole("button", { name: "Generate my weekly review" });
    expect(
      screen.queryByText(/Want Claude to write it/),
    ).not.toBeInTheDocument();
  });
});
