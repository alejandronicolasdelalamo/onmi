import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  usePomodoro,
} from "./use-pomodoro";

describe("usePomodoro", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (
    settings = { ...DEFAULT_SETTINGS, workMinutes: 1, breakMinutes: 1 },
  ) => {
    const onComplete = vi.fn();
    const hook = renderHook(() => usePomodoro({ settings, onComplete }));
    return { ...hook, onComplete };
  };

  it("empieza parado con la duración de trabajo", () => {
    const { result } = setup();
    expect(result.current).toMatchObject({
      mode: "work",
      remaining: 60,
      running: false,
    });
  });

  it("cuenta atrás por tiempo real, y avisa y cambia a descanso al terminar", () => {
    const { result, onComplete } = setup();
    act(() => result.current.start());
    act(() => void vi.advanceTimersByTime(30_000));
    expect(result.current.remaining).toBe(30);
    act(() => void vi.advanceTimersByTime(30_500));
    expect(onComplete).toHaveBeenCalledWith({ mode: "work", seconds: 60 });
    expect(result.current).toMatchObject({
      mode: "break",
      running: false,
      remaining: 60,
    });
  });

  it("pausar conserva el tiempo restante y reanudar continúa desde ahí", () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => void vi.advanceTimersByTime(20_000));
    act(() => result.current.pause());
    expect(result.current).toMatchObject({ running: false, remaining: 40 });
    act(() => void vi.advanceTimersByTime(10_000)); // pausado: no avanza
    expect(result.current.remaining).toBe(40);
    act(() => result.current.start());
    act(() => void vi.advanceTimersByTime(10_000));
    expect(result.current.remaining).toBe(30);
  });

  it("reset y skip", () => {
    const { result, onComplete } = setup();
    act(() => result.current.start());
    act(() => void vi.advanceTimersByTime(5_000));
    act(() => result.current.reset());
    expect(result.current).toMatchObject({
      running: false,
      remaining: 60,
      mode: "work",
    });
    act(() => result.current.skip());
    expect(result.current.mode).toBe("break");
    expect(onComplete).not.toHaveBeenCalled(); // saltar no cuenta como sesión completada
  });
});

describe("ajustes del pomodoro", () => {
  beforeEach(() => localStorage.clear());

  it("usa valores por defecto y limita rangos absurdos", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem(
      "onmi-pomodoro",
      JSON.stringify({ workMinutes: 9999, breakMinutes: -4 }),
    );
    expect(loadSettings()).toMatchObject({ workMinutes: 120, breakMinutes: 1 });
  });

  it("guarda y recupera", () => {
    saveSettings({ ...DEFAULT_SETTINGS, workMinutes: 50, sound: false });
    expect(loadSettings()).toMatchObject({ workMinutes: 50, sound: false });
  });

  it("tolera JSON corrupto", () => {
    localStorage.setItem("onmi-pomodoro", "{nope");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
