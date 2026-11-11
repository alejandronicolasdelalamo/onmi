import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadRun,
  loadSettings,
  saveSettings,
  usePomodoro,
} from "./use-pomodoro";

describe("usePomodoro", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
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

describe("sesión en marcha guardada", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());
  const settings = { ...DEFAULT_SETTINGS, workMinutes: 1, breakMinutes: 1 };

  it("al volver a abrir la app retoma la sesión (y con ella el bloqueo)", () => {
    const first = renderHook(() =>
      usePomodoro({ settings, onComplete: vi.fn() }),
    );
    act(() => first.result.current.start());
    act(() => void vi.advanceTimersByTime(20_000));
    expect(loadRun()?.mode).toBe("work");
    first.unmount();

    const onComplete = vi.fn();
    const again = renderHook(() => usePomodoro({ settings, onComplete }));
    expect(again.result.current).toMatchObject({
      running: true,
      mode: "work",
      remaining: 40,
      elapsed: 20,
    });
    act(() => void vi.advanceTimersByTime(41_000));
    expect(onComplete).toHaveBeenCalledWith({ mode: "work", seconds: 60 });
    expect(loadRun()).toBeNull();
  });

  it("si terminó con la app cerrada, cuenta como completada al abrir", () => {
    localStorage.setItem(
      "onmi-pomodoro-run",
      JSON.stringify({ mode: "work", endAt: Date.now() - 5_000 }),
    );
    const onComplete = vi.fn();
    const { result } = renderHook(() => usePomodoro({ settings, onComplete }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ running: false, mode: "break" });
  });

  it("pausar o reiniciar borra la sesión guardada", () => {
    const { result } = renderHook(() =>
      usePomodoro({ settings, onComplete: vi.fn() }),
    );
    act(() => result.current.start());
    act(() => result.current.pause());
    expect(loadRun()).toBeNull();
    act(() => result.current.start());
    act(() => result.current.reset());
    expect(loadRun()).toBeNull();
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
