import { useCallback, useEffect, useRef, useState } from "react";

export type Mode = "work" | "break";

export interface PomodoroSettings {
  workMinutes: number;
  breakMinutes: number;
  sound: boolean;
  notifications: boolean;
}

export const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  breakMinutes: 5,
  sound: true,
  notifications: false,
};
const KEY = "onmi-pomodoro";

export function loadSettings(): PomodoroSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as PomodoroSettings;
    return {
      ...s,
      workMinutes: Math.min(120, Math.max(1, Number(s.workMinutes) || 25)),
      breakMinutes: Math.min(60, Math.max(1, Number(s.breakMinutes) || 5)),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: PomodoroSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sin almacenamiento */
  }
}

/** Pitido corto con WebAudio (sin archivos de audio). */
export function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.25,
        ctx.currentTime + delay + 0.02,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + delay + 0.2,
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.22);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* audio no disponible */
  }
}

interface Options {
  settings: PomodoroSettings;
  onComplete: (info: { mode: Mode; seconds: number }) => void;
}

/**
 * Temporizador basado en la hora de fin (no en restar 1 cada segundo):
 * sigue siendo exacto aunque la pestaña esté en segundo plano.
 *
 * Estado mínimo: `paused` guarda los segundos restantes solo si se pausó a medias
 * (null = intervalo completo, que sigue los ajustes) y `tick` es el valor en marcha.
 */
export function usePomodoro({ settings, onComplete }: Options) {
  const total = useCallback(
    (m: Mode) =>
      (m === "work" ? settings.workMinutes : settings.breakMinutes) * 60,
    [settings.workMinutes, settings.breakMinutes],
  );
  const [mode, setMode] = useState<Mode>("work");
  const [paused, setPaused] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const endAt = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const remaining = running ? tick : (paused ?? total(mode));

  const finish = useCallback(() => {
    endAt.current = null;
    setRunning(false);
    setPaused(null);
    onCompleteRef.current({ mode, seconds: total(mode) });
    setMode((m) => (m === "work" ? "break" : "work"));
  }, [mode, total]);

  useEffect(() => {
    if (!running) return;
    const update = () => {
      // Ya terminó o se pausó: evita completar dos veces si llegan varios ticks seguidos.
      if (endAt.current === null) return;
      const left = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setTick(left);
      if (left <= 0) finish();
    };
    const id = setInterval(update, 250);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", update);
    };
  }, [running, finish]);

  const start = useCallback(() => {
    const secs = paused ?? total(mode);
    endAt.current = Date.now() + secs * 1000;
    setTick(secs);
    setRunning(true);
  }, [paused, total, mode]);

  const pause = useCallback(() => {
    if (endAt.current)
      setPaused(Math.max(0, Math.round((endAt.current - Date.now()) / 1000)));
    endAt.current = null;
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    endAt.current = null;
    setRunning(false);
    setPaused(null);
  }, []);

  const skip = useCallback(() => {
    endAt.current = null;
    setRunning(false);
    setPaused(null);
    setMode((m) => (m === "work" ? "break" : "work"));
  }, []);

  return {
    mode,
    remaining,
    running,
    total: total(mode),
    start,
    pause,
    reset,
    skip,
  };
}
