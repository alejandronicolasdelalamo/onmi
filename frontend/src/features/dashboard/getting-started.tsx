import { Check, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Dashboard } from "@/lib/types";
import { cn } from "@/lib/utils";

const KEY = "onmi-onboarding-dismissed";

function dismissed() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Lista de primeros pasos para cuentas nuevas. Se calcula con los datos reales y desaparece al completarse. */
export function GettingStarted({ data }: { data: Dashboard }) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(dismissed);

  const steps = [
    { key: "habit", done: data.habits.total > 0, to: "/habits?new=1" },
    { key: "note", done: data.notes.length > 0, to: "/notes?new=1" },
    {
      key: "project",
      done: Object.values(data.projects.counts).some((n) => n > 0),
      to: "/projects?new=1",
    },
    { key: "mood", done: data.mood_today !== null, to: "/mood" },
  ] as const;
  const done = steps.filter((s) => s.done).length;

  if (hidden || done === steps.length) return null;

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* sin almacenamiento: se oculta solo en esta sesión */
    }
  };

  return (
    <Card className="border-primary/30 bg-accent/40">
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="font-semibold tracking-tight">
              {t("onboarding.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("onboarding.progress", { done, total: steps.length })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 size-8"
            onClick={hide}
            aria-label={t("onboarding.hide")}
          >
            <X />
          </Button>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
          aria-label={t("onboarding.progress", { done, total: steps.length })}
          className="h-1.5 overflow-hidden rounded-full bg-background/70"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.key}>
              <Link
                to={s.to}
                className={cn(
                  "flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted pointer-coarse:py-3.5",
                  s.done && "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border-2",
                    s.done
                      ? "border-success bg-success text-white"
                      : "border-muted-foreground/40",
                  )}
                  aria-hidden
                >
                  {s.done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className={cn(s.done && "line-through")}>
                  {t(`onboarding.steps.${s.key}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
