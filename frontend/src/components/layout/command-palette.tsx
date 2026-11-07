import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  Languages,
  MoonStar,
  Plus,
  Settings,
  ShieldCheck,
  Target,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth, useSetLanguage } from "@/lib/auth";
import i18n, { LANGUAGES } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { NAV } from "./nav";

const itemClass =
  "flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toggle } = useTheme();
  const { user } = useAuth();
  const setLanguage = useSetLanguage();

  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  const lang = i18n.language?.startsWith("es") ? "es" : "en";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-label={t("palette.open")}
          className="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        >
          <DialogPrimitive.Title className="sr-only">
            {t("palette.open")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {t("palette.placeholder")}
          </DialogPrimitive.Description>
          <Command label={t("palette.open")}>
            <Command.Input
              autoFocus
              placeholder={t("palette.placeholder")}
              className="h-12 w-full border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Command.List className="max-h-80 overflow-y-auto p-2 scrollbar-thin">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("palette.empty")}
              </Command.Empty>

              <Command.Group
                heading={t("palette.actions")}
                className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5"
              >
                <Command.Item
                  className={itemClass}
                  onSelect={run(() => navigate("/notes?new=1"))}
                >
                  <Plus /> {t("palette.newNote")}
                </Command.Item>
                <Command.Item
                  className={itemClass}
                  onSelect={run(() => navigate("/habits?new=1"))}
                >
                  <Plus /> {t("palette.newHabit")}
                </Command.Item>
                <Command.Item
                  className={itemClass}
                  onSelect={run(() => navigate("/projects?new=1"))}
                >
                  <Plus /> {t("palette.newProject")}
                </Command.Item>
                <Command.Item
                  className={itemClass}
                  onSelect={run(() => navigate("/goals?new=1"))}
                >
                  <Target /> {t("palette.newGoal")}
                </Command.Item>
                <Command.Item className={itemClass} onSelect={run(toggle)}>
                  <MoonStar /> {t("palette.toggleTheme")}
                </Command.Item>
                <Command.Item
                  className={itemClass}
                  onSelect={run(() =>
                    setLanguage(LANGUAGES.find((l) => l !== lang)!),
                  )}
                >
                  <Languages /> {t("palette.switchLanguage")}
                </Command.Item>
              </Command.Group>

              <Command.Group
                heading={t("palette.navigate")}
                className="mt-1 text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5"
              >
                {NAV.map((n) => (
                  <Command.Item
                    key={n.to}
                    className={itemClass}
                    value={t(`nav.${n.key}`)}
                    onSelect={run(() => navigate(n.to))}
                  >
                    <n.icon /> {t(`nav.${n.key}`)}
                  </Command.Item>
                ))}
                <Command.Item
                  className={itemClass}
                  value={t("nav.profile")}
                  onSelect={run(() => navigate("/settings"))}
                >
                  <Settings /> {t("nav.profile")}
                </Command.Item>
                {user?.role === "admin" && (
                  <Command.Item
                    className={itemClass}
                    value={t("nav.admin")}
                    onSelect={run(() => navigate("/admin"))}
                  >
                    <ShieldCheck /> {t("nav.admin")}
                  </Command.Item>
                )}
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
