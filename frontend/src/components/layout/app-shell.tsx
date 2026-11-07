import { useMutation } from "@tanstack/react-query";
import {
  BookOpen,
  Home,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { api } from "@/lib/api";
import { useAuth, useSetLanguage } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import i18n, { LANGUAGES } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cn, initials } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { NAV } from "./nav";

import { isMac } from "@/lib/format";
function SidebarLink({
  to,
  label,
  icon: Icon,
  end,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          isActive &&
            "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
        )
      }
    >
      <Icon className="size-4" />
      {label}
    </NavLink>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const setLanguage = useSetLanguage();
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const resend = useMutation({
    mutationFn: () => api.post("/api/auth/resend-verification"),
    onSuccess: () => toast.success(t("auth.resent")),
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  if (!user) return null;
  const lang = i18n.language?.startsWith("es") ? "es" : "en";

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Main">
      <div className="mb-4 flex items-center justify-between px-2 pt-1">
        <Logo />
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setOpen(false)}
          aria-label={t("common.close")}
        >
          <X />
        </Button>
      </div>
      {NAV.map((n) => (
        <SidebarLink
          key={n.to}
          to={n.to}
          end={"end" in n ? n.end : undefined}
          label={t(`nav.${n.key}`)}
          icon={n.icon}
          onNavigate={() => setOpen(false)}
        />
      ))}
      <div className="mt-auto space-y-1 border-t border-border pt-3">
        {user.role === "admin" && (
          <SidebarLink
            to="/admin"
            label={t("nav.admin")}
            icon={ShieldCheck}
            onNavigate={() => setOpen(false)}
          />
        )}
        <SidebarLink
          to="/settings"
          label={t("nav.profile")}
          icon={Settings}
          onNavigate={() => setOpen(false)}
        />
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t("nav.skip")}
      </a>

      {/* Sidebar fija en escritorio */}
      <aside className="sticky top-0 hidden h-dvh border-r border-border bg-sidebar lg:block">
        {sidebar}
      </aside>

      {/* Cajón en móvil */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-black/50"
            aria-label={t("common.close")}
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-sidebar shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label={t("nav.menu")}
          >
            <Menu />
          </Button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full max-w-sm cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            <Search className="size-4" />
            <span className="flex-1 truncate text-left">
              {t("palette.placeholder")}
            </span>
            <kbd className="hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] sm:inline">
              {isMac() ? "⌘ K" : "Ctrl K"}
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="font-mono text-xs uppercase"
              onClick={() => setLanguage(LANGUAGES.find((l) => l !== lang)!)}
              aria-label={`${lang}, ${t("palette.switchLanguage")}`}
            >
              {lang}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label={t("palette.toggleTheme")}
            >
              {resolved === "dark" ? <Sun /> : <Moon />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <span
                    className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
                    aria-hidden
                  >
                    {initials(user.name)}
                  </span>
                  <span className="sr-only">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>
                  <span className="block text-sm font-medium text-foreground">
                    {user.name}
                  </span>
                  <span className="block">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate("/settings")}>
                  <Settings /> {t("nav.profile")}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="/docs" target="_blank" rel="noreferrer">
                    <BookOpen /> {t("nav.apiDocs")}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    void logout().then(() => navigate("/login"));
                  }}
                >
                  <LogOut /> {t("nav.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {!user.email_verified && !user.is_demo && (
          <div className="flex flex-wrap items-center justify-center gap-3 border-b border-warning/30 bg-warning/15 px-4 py-2 text-sm">
            <span>{t("auth.verifyBanner")}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => resend.mutate()}
              disabled={resend.isPending}
            >
              {t("auth.resend")}
            </Button>
          </div>
        )}

        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
