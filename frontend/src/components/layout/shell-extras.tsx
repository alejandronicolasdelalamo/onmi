import { useQueryClient } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { flushOutbox, useOnline, useOutboxCount } from "@/lib/outbox";
import { useDashboard } from "@/lib/queries";

/** Gesto de iOS: deslizar desde el borde izquierdo (solo pantallas táctiles) vuelve a la pantalla anterior. */
export function useSwipeBack() {
  const navigate = useNavigate();
  const { key } = useLocation();
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    let start: { x: number; y: number; t: number } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start =
        t && t.clientX < 24
          ? { x: t.clientX, y: t.clientY, t: Date.now() }
          : null;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const s = start;
      start = null;
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = Math.abs(t.clientY - s.y);
      const history = window.history.state as { idx?: number } | null;
      if (
        dx > 80 &&
        dy < 60 &&
        Date.now() - s.t < 700 &&
        (history?.idx ?? 0) > 0 &&
        !document.querySelector('[role="dialog"]')
      )
        navigate(-1);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [navigate, key]);
}

/** Número rojo en el icono de la app (iPhone con la app instalada): hábitos que faltan por hacer hoy. */
export function useAppBadge() {
  const { data } = useDashboard();
  const pending = data
    ? Math.max(0, data.habits.total - data.habits.done_today)
    : null;
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (pending === null || !nav.setAppBadge) return;
    const run = pending > 0 ? nav.setAppBadge(pending) : nav.clearAppBadge?.();
    run?.catch(() => undefined); // sin permiso de notificaciones iOS lo rechaza: no pasa nada
  }, [pending]);
}

/** Aviso de «sin conexión» y envío automático de las notas guardadas mientras tanto. */
export function OfflineSync() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const online = useOnline();
  const queued = useOutboxCount();

  useEffect(() => {
    if (!online || queued === 0) return;
    void flushOutbox((n) =>
      api.post("/api/notes", { ...n, tags: [], pinned: false, queued: true }),
    ).then((sent) => {
      if (sent > 0) {
        toast.success(t("capture.synced", { count: sent }));
        void qc.invalidateQueries({ queryKey: ["notes"] });
        void qc.invalidateQueries({ queryKey: ["dashboard"] });
      }
    });
  }, [online, queued, qc, t]);

  if (online && queued === 0) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning/20 px-4 py-2 text-sm"
    >
      <CloudOff className="size-4 shrink-0" aria-hidden />
      <span>
        {online
          ? t("capture.syncing", { count: queued })
          : queued > 0
            ? t("capture.offlineQueued", { count: queued })
            : t("capture.offline")}
      </span>
    </div>
  );
}
