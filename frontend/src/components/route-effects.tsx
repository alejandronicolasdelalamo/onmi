import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

const TITLES: Record<string, string> = {
  "/": "nav.dashboard",
  "/notes": "nav.notes",
  "/habits": "nav.habits",
  "/projects": "nav.projects",
  "/goals": "nav.goals",
  "/mood": "nav.mood",
  "/focus": "nav.focus",
  "/insights": "nav.insights",
  "/buddies": "nav.buddies",
  "/settings": "nav.profile",
  "/admin": "nav.admin",
  "/login": "auth.signIn",
  "/register": "auth.signUp",
  "/forgot-password": "auth.forgotTitle",
  "/reset-password": "auth.resetTitle",
  "/verify-email": "auth.verifyTitle",
};

/**
 * Accesibilidad de una SPA (WCAG 2.4.2, 3.1.1, 2.4.3):
 *  - `<html lang>` sigue al idioma activo,
 *  - el título de la pestaña describe la pantalla,
 *  - al navegar, el foco pasa al contenido para que lectores de pantalla y teclado noten el cambio.
 */
export function RouteEffects() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    document.documentElement.lang = i18n.language?.startsWith("es")
      ? "es"
      : "en";
  }, [i18n.language]);

  useEffect(() => {
    const key = TITLES[pathname];
    // El pomodoro gestiona su propio título mientras corre.
    if (pathname !== "/focus")
      document.title = key
        ? `${t(key)} · ONMi`
        : `${t("notFound.title")} · ONMi`;
  }, [pathname, t, i18n.language]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const target =
      document.getElementById("main") ??
      document.querySelector<HTMLElement>("main, h1");
    target?.setAttribute("tabindex", "-1");
    target?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
