import { BellOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** Móvil (iPhone, iPad o Android): ahí tiene sentido pedir que active No molestar / Concentración. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod|Android/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `dontAskAgain`: la persona pidió no volver a ver este aviso. */
  onStart: (dontAskAgain: boolean) => void;
}

/**
 * Aviso previo al enfoque: la web no puede silenciar el teléfono, así que se pide a la persona
 * que active No molestar / su Concentración antes de empezar.
 */
export function SilenceReminder({ open, onOpenChange, onStart }: Props) {
  const { t } = useTranslation();
  const [dontAsk, setDontAsk] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("pomodoro.reminder.title")}
        description={t("pomodoro.reminder.body")}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md bg-muted/60 p-3 text-sm">
            <BellOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{t("pomodoro.reminder.how")}</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={dontAsk}
              onChange={(e) => setDontAsk(e.target.checked)}
            />
            {t("pomodoro.reminder.dontAsk")}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button className="sm:flex-1" onClick={() => onStart(dontAsk)}>
              {t("pomodoro.reminder.ready")}
            </Button>
            <Button
              variant="outline"
              className="sm:flex-1"
              onClick={() => onStart(dontAsk)}
            >
              {t("pomodoro.reminder.without")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
