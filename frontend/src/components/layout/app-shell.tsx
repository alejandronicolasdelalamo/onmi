import { useMutation } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  Ellipsis,
  Home,
  Languages,
  LogOut,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Logo, LogoMark } from "@/components/brand";
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
import { useAuth, usePublicConfig, useSetLanguage } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { isMac } from "@/lib/format";
import i18n, { LANGUAGES } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cn, initials } from "@/lib/utils";
import { QuickCapture } from "@/components/quick-capture";
import { Welcome } from "@/components/welcome";
import { CommandPalette } from "./command-palette";
import { OfflineSync, useAppBadge, useSwipeBack } from "./shell-extras";
import { NAV } from "./nav";

/** Las cuatro pantallas de uso diario van en la barra inferior del móvil; el resto, en «Más». */
const TABS = ["dashboard", "habits", "calendar", "buddies"] as const;
const VERIFY_DISMISSED = "onmi-verify-dismissed";

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
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:py-3",
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

function readDismissed(): boolean {
  try {
    return localStorage.getItem(VERIFY_DISMISSED) === "1";
  } catch {
    return false;
  }
}

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { data: config } = usePublicConfig();
  const setLanguage = useSetLanguage();
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [verifyDismissed, setVerifyDismissed] = useState(readDismissed);
  const { pathname } = useLocation();
  useSwipeBack();
  useAppBadge();

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
  const nextLang = LANGUAGES.find((l) => l !== lang)!;
  // El aviso solo tiene sentido si el servidor puede enviar el correo, y se puede descartar.
  const showVerify =
    !!config?.mail_enabled &&
    !user.email_verified &&
    !user.is_demo &&
    !verifyDismissed;
  const dismissVerify = () => {
    setVerifyDismissed(true);
    try {
      localStorage.setItem(VERIFY_DISMISSED, "1");
    } catch {
      /* sin almacenamiento: el aviso vuelve en la próxima visita */
    }
  };

  const sidebar = (
    <nav
      className="flex h-full flex-col gap-1 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      aria-label="Main"
    >
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
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
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
      </div>
      <div className="space-y-1 border-t border-border pt-3">
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
        {/* En móvil el idioma y el tema viven aquí, no en la cabecera. */}
        <div className="flex gap-2 pt-1 sm:hidden">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setLanguage(nextLang)}
          >
            <Languages /> {nextLang.toUpperCase()}
          </Button>
          <Button variant="outline" className="flex-1" onClick={toggle}>
            {resolved === "dark" ? <Sun /> : <Moon />}
            {t("palette.toggleTheme")}
          </Button>
        </div>
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

      {/* Cajón «Más» en móvil */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-black/50"
            aria-label={t("common.close")}
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[min(20rem,85vw)] animate-[drawer-in_0.2s_ease-out] border-r border-border bg-sidebar shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-4">
            {/* Móvil: el botón del logo abre el menú completo y la palabra «ONMi» lleva al inicio. */}
            <div className="flex items-center gap-1 lg:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    // El Button fija 16 px a sus SVG; estos selectores, más específicos, agrandan el logo.
                    className="h-12 gap-1 px-2 [&_svg:first-child]:size-10 [&_svg:last-child]:size-5 [&_svg:last-child]:text-foreground/70"
                    aria-label={t("nav.menu")}
                  >
                    <LogoMark />
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {NAV.map((n) => (
                    <DropdownMenuItem key={n.to} asChild>
                      <NavLink to={n.to} end={"end" in n ? n.end : undefined}>
                        <n.icon /> {t(`nav.${n.key}`)}
                      </NavLink>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  {user.role === "admin" && (
                    <DropdownMenuItem asChild>
                      <NavLink to="/admin">
                        <ShieldCheck /> {t("nav.admin")}
                      </NavLink>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <NavLink to="/settings">
                      <Settings /> {t("nav.profile")}
                    </NavLink>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <NavLink
                to="/"
                end
                className="rounded-md px-1 text-xl font-semibold tracking-tight"
              >
                ONMi
              </NavLink>
            </div>
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden h-9 w-full max-w-sm cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-muted lg:flex"
            >
              <Search className="size-4" />
              <span className="flex-1 truncate text-left">
                {t("palette.placeholder")}
              </span>
              <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[10px]">
                {isMac() ? "⌘ K" : "Ctrl K"}
              </kbd>
            </button>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setPaletteOpen(true)}
                aria-label={t("palette.open")}
              >
                <Search />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="hidden font-mono text-xs uppercase sm:inline-flex"
                onClick={() => setLanguage(nextLang)}
                aria-label={`${lang}, ${t("palette.switchLanguage")}`}
              >
                {lang}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden sm:inline-flex"
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
          </div>
        </header>

        {showVerify && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-warning/30 bg-warning/15 px-4 py-2 text-sm"
          >
            <span>{t("auth.verifyBanner")}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => resend.mutate()}
              disabled={resend.isPending}
            >
              {t("auth.resend")}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismissVerify}>
              {t("auth.verifyDismiss")}
            </Button>
          </div>
        )}

        <OfflineSync />

        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 lg:pb-8"
        >
          {/* Cada pantalla entra con un fundido suave (como al cambiar de vista en iOS). */}
          <div key={pathname} className="animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Barra inferior (móvil): alcanzable con el pulgar, con áreas táctiles de 48 px. */}
      <nav
        aria-label={t("nav.tabs")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((key) => {
            const item = NAV.find((n) => n.key === key)!;
            return (
              <li key={key}>
                <NavLink
                  to={item.to}
                  end={"end" in item ? item.end : undefined}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium text-muted-foreground transition-colors active:bg-muted",
                      isActive && "text-primary",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          "grid h-7 w-12 place-items-center rounded-full transition-colors",
                          isActive && "bg-accent",
                        )}
                      >
                        <item.icon className="size-5" aria-hidden />
                      </span>
                      <span className="max-w-full truncate">
                        {t(`nav.${key}`)}
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium text-muted-foreground active:bg-muted"
            >
              <span className="grid h-7 w-12 place-items-center">
                <Ellipsis className="size-5" aria-hidden />
              </span>
              {t("nav.more")}
            </button>
          </li>
        </ul>
      </nav>

      <QuickCapture />
      <Welcome />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
