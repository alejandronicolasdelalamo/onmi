import { useTranslation } from "react-i18next";

/** iPhone o iPad (el iPad moderno se presenta como Mac con pantalla táctil). */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Guía para silenciar todas las notificaciones en iPhone. La web no puede hacerlo sola (iOS no lo permite):
 * se configura una vez una Concentración que se activa al abrir ONMi.
 */
export function IosSilenceGuide() {
  const { t } = useTranslation();
  const steps = t("pomodoro.ios.steps", { returnObjects: true }) as string[];
  return (
    <details className="rounded-md border bg-muted/40 p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {t("pomodoro.ios.title")}
      </summary>
      <p className="mt-2 text-muted-foreground">{t("pomodoro.ios.intro")}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("pomodoro.ios.note")}
      </p>
    </details>
  );
}
