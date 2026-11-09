import { addDays, localISODate } from "@/lib/utils";

/** Lunes = 0 … domingo = 6 (igual que el servidor). */
export function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

/** Primer día de la semana (según la preferencia: lunes o domingo) que contiene `iso`. */
export function startOfWeek(iso: string, weekStart: 0 | 6): string {
  const idx = weekdayIndex(iso);
  const back = weekStart === 0 ? idx : (idx + 1) % 7;
  return addDays(iso, -back);
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(iso: string, n: number): string {
  const d = new Date(`${monthStart(iso)}T00:00:00`);
  d.setMonth(d.getMonth() + n);
  return localISODate(d);
}

/** Todas las casillas de la cuadrícula del mes (semanas completas). */
export function monthGrid(iso: string, weekStart: 0 | 6): string[] {
  const first = monthStart(iso);
  const gridStart = startOfWeek(first, weekStart);
  const next = addMonths(first, 1);
  const days: string[] = [];
  for (let d = gridStart; d < next || days.length % 7 !== 0; d = addDays(d, 1))
    days.push(d);
  return days;
}

export function weekDays(iso: string, weekStart: 0 | 6): string[] {
  const s = startOfWeek(iso, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/** Nombre del día de la semana (0 = lunes) en el idioma actual. */
export function weekdayName(
  index: number,
  locale: string,
  width: "narrow" | "short" | "long" = "short",
): string {
  // 2024-01-01 fue lunes.
  const d = new Date(2024, 0, 1 + index);
  return new Intl.DateTimeFormat(locale, { weekday: width }).format(d);
}

export function weekdayOrder(weekStart: 0 | 6): number[] {
  return Array.from(
    { length: 7 },
    (_, i) => (i + (weekStart === 0 ? 0 : 6)) % 7,
  );
}

export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
}

export function endTime(start: string, minutes: number): string {
  const total = (hhmmToMinutes(start) + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** «Mar, Jue» a partir de [1, 3]. */
export function weekdaysSummary(days: number[], locale: string): string {
  return days.map((d) => weekdayName(d, locale, "short")).join(", ");
}
