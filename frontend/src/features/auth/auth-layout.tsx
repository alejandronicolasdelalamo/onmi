import { CalendarCheck, FolderKanban, NotebookPen, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import i18n, { LANGUAGES } from "@/lib/i18n";

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const lang = i18n.language?.startsWith("es") ? "es" : "en";
  const features = [
    { icon: NotebookPen, label: t("nav.notes") },
    { icon: CalendarCheck, label: t("nav.habits") },
    { icon: FolderKanban, label: t("nav.projects") },
    { icon: Timer, label: t("nav.focus") },
  ];
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <div
          className="absolute -bottom-32 -left-16 size-96 rounded-full bg-fuchsia-400/20 blur-3xl"
          aria-hidden
        />
        <Logo className="relative text-white [&_svg]:drop-shadow" />
        <div className="relative space-y-8">
          <h2 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">
            {t("auth.tagline")}
          </h2>
          <ul className="grid max-w-md grid-cols-2 gap-3">
            {features.map((f) => (
              <li
                key={f.label}
                className="flex items-center gap-3 rounded-lg bg-white/10 px-4 py-3 text-sm font-medium backdrop-blur"
              >
                <f.icon className="size-4" aria-hidden /> {f.label}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/70">
          © {new Date().getFullYear()} ONMi
        </p>
      </aside>

      <main className="relative flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo className="lg:hidden" />
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto font-mono text-xs uppercase"
            onClick={() =>
              void i18n.changeLanguage(LANGUAGES.find((l) => l !== lang)!)
            }
            aria-label={t("common.language")}
          >
            {lang}
          </Button>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="animate-fade-up">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
