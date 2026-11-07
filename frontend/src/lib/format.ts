import i18n from "./i18n";

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, opts: Intl.DateTimeFormatOptions) {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    cache.set(key, f);
  }
  return f;
}

/** "2026-11-14" -> "14 nov 2026" / "Nov 14, 2026", según el idioma activo (Intl, nunca formato fijo). */
export function formatDate(
  iso: string,
  opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
  locale: string = i18n.language,
): string {
  // Una fecha sin hora se interpreta en local para no desplazarla un día por la zona horaria.
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return formatter(locale, opts).format(d);
}

export const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform ?? "");
