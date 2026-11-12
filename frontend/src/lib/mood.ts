import type { MoodKind } from "./types";

/** Qué ha influido en el día. Coincide con las etiquetas que acepta el servidor. */
export const MOOD_TAGS = [
  "sleep",
  "work",
  "study",
  "family",
  "friends",
  "partner",
  "exercise",
  "health",
  "food",
  "weather",
  "money",
  "hobby",
] as const;
export type MoodTag = (typeof MOOD_TAGS)[number];
export const MAX_MOOD_TAGS = 6;

/** La emoción que mejor representa una media de ánimo (1 = triste … 5 = enamorado). */
export function moodFromScore(score: number): MoodKind {
  if (score >= 4.5) return "love";
  if (score >= 3.5) return "happy";
  if (score >= 2.5) return "neutral";
  if (score >= 1.5) return "mad";
  return "sad";
}

export interface MonthCell {
  /** YYYY-MM-DD o null para los huecos antes del día 1. */
  date: string | null;
  day: number;
}

/** Cuadrícula de un mes (YYYY-MM) con el lunes como primer día de la semana. */
export function monthCells(ym: string): MonthCell[] {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells: MonthCell[] = Array.from({ length: lead }, () => ({
    date: null,
    day: 0,
  }));
  for (let d = 1; d <= days; d++)
    cells.push({ date: `${ym}-${String(d).padStart(2, "0")}`, day: d });
  return cells;
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const sameTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();
