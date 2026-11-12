import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Illustration, type ArtName } from "@/components/illustrations";
import { InstallSteps } from "@/components/install-guide";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { parseUtc } from "@/lib/format";
import { needsIOSInstall } from "@/lib/platform";
import { cn } from "@/lib/utils";

const KEY = "onmi.welcomed";
const NEW_USER_MS = 15 * 60_000;

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // sin almacenamiento no se puede recordar: mejor no insistir
  }
}

/** Solo para cuentas recién creadas, una vez por dispositivo. */
export function shouldWelcome(
  createdAt: string,
  isDemo: boolean,
  now = Date.now(),
) {
  return !isDemo && now - parseUtc(createdAt) < NEW_USER_MS && !alreadySeen();
}

/** Bienvenida de tres pantallas con ilustraciones propias (qué es ONMi, privacidad e instalación en iPhone). */
export function Welcome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(
    () => !!user && shouldWelcome(user.created_at, user.is_demo),
  );
  const [i, setI] = useState(0);
  const ios = needsIOSInstall();

  const slides: { art: ArtName; key: string; extra?: boolean }[] = [
    { art: "habits", key: "one" },
    { art: "lock", key: "two" },
    ...(ios ? [{ art: "phone" as ArtName, key: "three", extra: true }] : []),
  ];
  const last = i === slides.length - 1;
  const slide = slides[i]!;

  const finish = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* sin almacenamiento */
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && finish()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col gap-5 overflow-y-auto rounded-t-3xl border border-border bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl animate-[sheet-up_0.3s_ease-out] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
          <div key={i} className="animate-fade-up space-y-4 text-center">
            <Illustration name={slide.art} className="mx-auto h-36" />
            <DialogPrimitive.Title className="text-xl font-semibold tracking-tight">
              {t(`welcome.${slide.key}.title`, {
                name: user?.name.split(" ")[0],
              })}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {t(`welcome.${slide.key}.body`)}
            </DialogPrimitive.Description>
            {slide.extra && (
              <div className="rounded-xl bg-muted/60 p-4 text-left">
                <InstallSteps />
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5" aria-hidden>
            {slides.map((_, n) => (
              <span
                key={n}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  n === i ? "w-6 bg-primary" : "w-1.5 bg-border",
                )}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {!last && (
              <Button variant="ghost" className="flex-1" onClick={finish}>
                {t("welcome.skip")}
              </Button>
            )}
            <Button
              className="flex-1"
              size="lg"
              onClick={() => (last ? finish() : setI(i + 1))}
            >
              {last ? t("welcome.start") : t("welcome.next")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
