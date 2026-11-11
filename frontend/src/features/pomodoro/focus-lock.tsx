import { Lock } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Tiempo que hay que mantener pulsado «Abandonar» para salir del bloqueo antes de tiempo. */
export const HOLD_MS = 3000;

/** Pantalla completa del navegador si se puede (en iPhone Safari no existe: la PWA ya ocupa toda la pantalla). */
export function enterFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen().catch(() => {
    /* el navegador lo rechazó: seguimos con el bloqueo dentro de la página */
  });
}

export function exitFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen)
    document.exitFullscreen().catch(() => {});
}

/** Botón que solo actúa tras mantenerlo pulsado `HOLD_MS` (evita salir por un toque sin querer). */
function HoldButton({
  onConfirm,
  children,
}: {
  onConfirm: () => void;
  children: ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);

  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const start = () => {
    if (timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  };
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button
      type="button"
      className="relative overflow-hidden rounded-full border border-white/25 px-6 py-3 text-sm font-medium text-white/80 select-none touch-none focus-visible:outline-2 focus-visible:outline-white"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) start();
      }}
      onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 bg-white/20",
          holding ? "w-full ease-linear" : "w-0 duration-150",
        )}
        style={{
          transitionProperty: "width",
          transitionDuration: holding ? `${HOLD_MS}ms` : undefined,
        }}
      />
      <span className="relative">{children}</span>
    </button>
  );
}

interface Props {
  remaining: string;
  progress: number;
  project?: string;
  interruptions: number;
  onAbandon: () => void;
}

/**
 * Pantalla de bloqueo del modo enfoque. Tapa toda la app (lo de debajo queda `inert`: ni clics ni teclado)
 * y solo deja salir manteniendo pulsado «Abandonar». Desaparece sola al acabar el tiempo.
 */
export function FocusLock({
  remaining,
  progress,
  project,
  interruptions,
  onAbandon,
}: Props) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    document.body.dataset.focusLock = "on"; // oculta los avisos (toasts) de la app, ver index.css
    dialog.current?.focus();
    return () => {
      root?.removeAttribute("inert");
      delete document.body.dataset.focusLock;
    };
  }, []);

  const r = 120;
  const c = 2 * Math.PI * r;

  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="focus-lock-title"
      tabIndex={-1}
      className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-between overflow-hidden bg-[#0b0b14] px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-white outline-none"
    >
      <div className="flex items-center gap-2 text-sm text-white/70">
        <Lock className="size-4" aria-hidden />
        <h2 id="focus-lock-title">{t("pomodoro.lock.title")}</h2>
      </div>

      <div className="relative grid size-72 max-w-full place-items-center">
        <svg
          viewBox="0 0 260 260"
          className="absolute inset-0 -rotate-90"
          aria-hidden
        >
          <circle
            cx="130"
            cy="130"
            r={r}
            fill="none"
            strokeWidth="8"
            className="stroke-white/10"
          />
          <circle
            cx="130"
            cy="130"
            r={r}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - progress)}
            className="stroke-[#8b8bf5] transition-[stroke-dashoffset] duration-300"
          />
        </svg>
        <div className="relative text-center">
          <p
            className="font-mono text-6xl font-semibold tabular-nums tracking-tight"
            role="timer"
            aria-live="off"
          >
            {remaining}
          </p>
          {project && (
            <p className="mt-2 max-w-52 truncate text-sm text-white/60">
              {project}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 text-center">
        <p className="max-w-xs text-sm text-white/60">
          {t("pomodoro.lock.hint")}
        </p>
        <p
          className={cn(
            "text-xs",
            interruptions ? "text-amber-300" : "text-white/40",
          )}
          aria-live="polite"
        >
          {t("pomodoro.lock.interruptions", { count: interruptions })}
        </p>
        <HoldButton onConfirm={onAbandon}>
          {t("pomodoro.lock.abandon")}
        </HoldButton>
      </div>
    </div>,
    document.body,
  );
}
