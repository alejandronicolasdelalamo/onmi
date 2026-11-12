import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/lib/i18n";
import {
  BootLoader,
  expectedWakeMs,
  wakePhase,
  wakeProgress,
} from "./boot-loader";

describe("wakeProgress / wakePhase", () => {
  it("sube rápido, se frena y nunca llega al 100 %", () => {
    const exp = 50_000;
    const a = wakeProgress(5_000, exp);
    const b = wakeProgress(25_000, exp);
    const c = wakeProgress(50_000, exp);
    const d = wakeProgress(500_000, exp);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeLessThan(1);
    expect(wakeProgress(0, exp)).toBe(0);
  });

  it("avanza por fases y avisa cuando se pasa del tiempo esperado", () => {
    const exp = 50_000;
    expect(wakePhase(1_000, exp)).toBe("wake");
    expect(wakePhase(15_000, exp)).toBe("start");
    expect(wakePhase(30_000, exp)).toBe("connect");
    expect(wakePhase(48_000, exp)).toBe("almost");
    expect(wakePhase(70_000, exp)).toBe("slow");
  });
});

describe("BootLoader", () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.useFakeTimers();
    await i18n.changeLanguage("en");
  });
  afterEach(() => vi.useRealTimers());

  it("al principio es discreto y después enseña círculo, tiempo y fase", () => {
    render(<BootLoader />);
    expect(screen.queryByRole("progressbar")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    const bar = screen.getByRole("progressbar");
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    expect(screen.getByText("sec left, approx.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /Waking up|Starting|Connecting|Almost/,
    );
    expect(screen.getByText(/Tip:/)).toBeInTheDocument();
  });

  it("si tarda más de lo previsto lo dice con honestidad", () => {
    render(<BootLoader />);
    act(() => {
      vi.advanceTimersByTime(75_000);
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Taking a bit longer than usual",
    );
    expect(screen.getByText(/Still working on it/)).toBeInTheDocument();
  });

  it("recuerda cuánto tardó un arranque en frío para afinar la próxima estimación", () => {
    expect(expectedWakeMs()).toBe(50_000);
    const { unmount } = render(<BootLoader />);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    unmount();
    expect(expectedWakeMs()).toBe(40_000); // media entre 50 s y 30 s
  });

  it("un arranque rápido no altera la estimación", () => {
    const { unmount } = render(<BootLoader />);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    unmount();
    expect(expectedWakeMs()).toBe(50_000);
  });
});
