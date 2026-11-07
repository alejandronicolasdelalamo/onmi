import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/lib/i18n";

const push = vi.hoisted(() => ({
  supported: true,
  subscribed: false,
}));
const apiGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/push", () => ({
  pushSupported: () => push.supported,
  currentSubscription: async () =>
    push.subscribed ? ({} as PushSubscription) : null,
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  browserTimeZone: () => "UTC",
  PushError: class extends Error {},
}));
vi.mock("@/lib/api", () => ({ api: { get: apiGet, post: vi.fn() } }));

import { RemindersCard } from "./reminders-card";

const renderCard = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RemindersCard />
    </QueryClientProvider>,
  );

describe("RemindersCard", () => {
  beforeEach(async () => {
    push.supported = true;
    push.subscribed = false;
    apiGet.mockResolvedValue({
      public_key: "BEl62iUYgUivxIkv69yViEuiBIa",
      subscriptions: 0,
      timezone: "UTC",
    });
    await i18n.changeLanguage("en");
  });

  it("ofrece activar los recordatorios cuando el servidor y el navegador lo permiten", async () => {
    renderCard();
    expect(
      await screen.findByRole("button", { name: "Enable reminders" }),
    ).toBeEnabled();
  });

  it("explica que no hay configuración en el servidor (sin claves VAPID) y no ofrece el botón", async () => {
    apiGet.mockResolvedValue({
      public_key: null,
      subscriptions: 0,
      timezone: "UTC",
    });
    renderCard();
    expect(
      await screen.findByText("Reminders are not set up on this server yet."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enable reminders" }),
    ).not.toBeInTheDocument();
  });

  it("avisa si el navegador no soporta push", async () => {
    push.supported = false;
    renderCard();
    expect(
      await screen.findByText(
        "This browser does not support push notifications.",
      ),
    ).toBeInTheDocument();
  });

  it("si ya está activado permite probar y desactivar", async () => {
    push.subscribed = true;
    renderCard();
    expect(
      await screen.findByText("Reminders are on for this device."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send a test" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Turn off" }),
    ).toBeInTheDocument();
  });
});
