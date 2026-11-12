import { BellRing, Share, SquarePlus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { needsIOSInstall } from "@/lib/platform";

const DISMISS_KEY = "onmi.install-dismissed";

/** Pasos para instalar ONMi en la pantalla de inicio del iPhone (necesario para notificaciones e insignia). */
export function InstallSteps() {
  const { t } = useTranslation();
  const steps = [
    { icon: Share, text: t("install.step1") },
    { icon: SquarePlus, text: t("install.step2") },
    { icon: BellRing, text: t("install.step3") },
  ];
  return (
    <ol className="space-y-2.5">
      {steps.map(({ icon: Icon, text }, i) => (
        <li key={i} className="flex items-start gap-3 text-sm">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="pt-0.5">
            <span className="font-medium">{i + 1}. </span>
            {text}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Aviso en Inicio (solo iPhone/iPad en Safari y sin instalar). Se puede descartar. */
export function InstallBanner() {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (hidden || !needsIOSInstall()) return null;
  return (
    <Card className="relative space-y-3 border-primary/30 bg-primary/5 p-4">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* sin almacenamiento */
          }
        }}
        className="absolute right-2 top-2 grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted pointer-coarse:size-10"
      >
        <X className="size-4" />
      </button>
      <div className="pr-8">
        <p className="font-medium">{t("install.title")}</p>
        <p className="text-sm text-muted-foreground">{t("install.why")}</p>
      </div>
      <InstallSteps />
    </Card>
  );
}
