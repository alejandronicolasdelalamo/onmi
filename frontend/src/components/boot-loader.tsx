import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/card";

const KEY = "onmi.wake-ms";
const DEFAULT_MS = 50_000; // un arranque en frío del servicio gratuito suele rondar el minuto
const SHOW_AFTER_MS = 2_500; // si responde enseguida no se enseña nada de esto

/** Cuánto tardó la última vez que el servidor estuvo dormido (el aviso se afina con el uso). */
export function expectedWakeMs(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return n >= 10_000 && n <= 120_000 ? n : DEFAULT_MS;
  } catch {
    return DEFAULT_MS;
  }
}

function rememberWake(elapsed: number) {
  if (elapsed < 8_000) return; // arranque normal, no frío: no cuenta
  try {
    const mixed = Math.round(
      (expectedWakeMs() + Math.min(elapsed, 120_000)) / 2,
    );
    localStorage.setItem(KEY, String(mixed));
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Progreso estimado (0-0.95). Sube rápido al principio y se frena cerca del final: nunca llega a 100 %
 * mientras el servidor no responda, para no prometer algo que no sabemos.
 */
export function wakeProgress(elapsed: number, expected: number): number {
  const x = Math.max(0, elapsed) / expected;
  return Math.min(0.95, 1 - Math.exp(-2.2 * x)) * (x < 1 ? 1 : 0.999);
}

export type WakePhase = "wake" | "start" | "connect" | "almost" | "slow";

export function wakePhase(elapsed: number, expected: number): WakePhase {
  const p = wakeProgress(elapsed, expected);
  if (elapsed > expected + 10_000) return "slow";
  if (p < 0.4) return "wake";
  if (p < 0.7) return "start";
  if (p < 0.85) return "connect";
  return "almost";
}

const TIPS = ["tip1", "tip2", "tip3", "tip4"] as const;
const R = 52;
const C = 2 * Math.PI * R;

/**
 * Pantalla de arranque mientras el servidor despierta: círculo con progreso, tiempo estimado que queda,
 * mensajes por fases y consejos, para que la espera no parezca tiempo perdido.
 */
export function BootLoader() {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  const [begin] = useState(() => Date.now());
  const [exp] = useState(expectedWakeMs);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - begin), 250);
    return () => {
      clearInterval(id);
      rememberWake(Date.now() - begin);
    };
  }, [begin]);

  if (elapsed < SHOW_AFTER_MS)
    return (
      <div
        className="grid min-h-dvh place-items-center"
        role="status"
        aria-label="Loading"
      >
        <Skeleton className="size-10 rounded-xl" />
      </div>
    );

  const progress = wakeProgress(elapsed, exp);
  const phase = wakePhase(elapsed, exp);
  const remaining = Math.max(0, Math.ceil((exp - elapsed) / 1000));
  const stalled = phase === "slow";
  const tip = TIPS[Math.floor(elapsed / 7000) % TIPS.length]!;

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6">
      <div
        className="flex w-full max-w-sm flex-col items-center gap-6 text-center"
        role="status"
        aria-live="polite"
      >
        <div
          className="relative size-36"
          role="progressbar"
          aria-label={t("boot.title")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <svg viewBox="0 0 120 120" className="size-full -rotate-90">
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              strokeWidth="8"
              className="stroke-muted"
            />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className={
                stalled
                  ? "origin-center animate-spin stroke-primary [animation-duration:1.4s] motion-reduce:animate-none"
                  : "stroke-primary transition-[stroke-dashoffset] duration-300"
              }
              strokeDasharray={stalled ? `${C * 0.25} ${C}` : C}
              strokeDashoffset={stalled ? 0 : C * (1 - progress)}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            {stalled ? (
              <span className="text-sm font-medium text-muted-foreground">
                …
              </span>
            ) : (
              <div className="leading-tight">
                <span className="text-3xl font-semibold tabular-nums tracking-tight">
                  {remaining > 0 ? remaining : "<1"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("boot.seconds")}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold tracking-tight">
            {t(`boot.phase.${phase}`)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {stalled ? t("boot.slow") : t("boot.why")}
          </p>
        </div>

        <p
          key={tip}
          className="animate-[fade-up_0.4s_ease-out] rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground motion-reduce:animate-none"
        >
          <span className="font-medium text-foreground">{t("boot.tip")} </span>
          {t(`boot.${tip}`)}
        </p>
      </div>
    </div>
  );
}
