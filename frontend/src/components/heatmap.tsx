import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  series: { date: string; count: number }[];
  className?: string;
}

type Cell = { date: string; count: number; dow: number } | null;

const LEVELS = [
  "bg-muted",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
];
// Lunes, miércoles y viernes: suficiente para orientarse sin saturar (como GitHub).
const LABELLED_ROWS = new Map([
  [0, "2024-01-01"],
  [2, "2024-01-03"],
  [4, "2024-01-05"],
]);

/** Heatmap estilo GitHub: columnas = semanas, filas = días (lunes primero), con etiquetas de día y mes. */
export function Heatmap({ series, className }: Props) {
  const { t } = useTranslation();
  const { weeks, max, total, months } = useMemo(() => {
    const cells = series.map((s) => ({
      ...s,
      dow: (new Date(`${s.date}T00:00:00`).getDay() + 6) % 7,
    }));
    const weeks: Cell[][] = [];
    let week: Cell[] = [];
    cells.forEach((c, i) => {
      if (i === 0) week = Array<Cell>(c.dow).fill(null);
      week.push(c);
      if (c.dow === 6) {
        weeks.push(week);
        week = [];
      }
    });
    if (week.length) weeks.push(week);

    // Etiqueta de mes en la columna donde empieza, separadas al menos 3 columnas para que no se pisen.
    const months = new Map<number, string>();
    let last = -10;
    weeks.forEach((w, i) => {
      const first = w.find(
        (c): c is NonNullable<Cell> => !!c && Number(c.date.slice(8)) <= 7,
      );
      const startsMonth = w.some((c) => c && c.date.endsWith("-01")) || i === 0;
      if (first && startsMonth && i - last >= 3) {
        months.set(i, formatDate(first.date, { month: "short" }));
        last = i;
      }
    });
    return {
      weeks,
      months,
      max: Math.max(1, ...series.map((s) => s.count)),
      total: series.reduce((n, s) => n + s.count, 0),
    };
  }, [series]);

  const level = (n: number) =>
    n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <div
          className="flex flex-col gap-1 pt-[1.125rem] text-[10px] leading-3 text-muted-foreground"
          aria-hidden
        >
          {Array.from({ length: 7 }, (_, row) => (
            <span key={row} className="h-3">
              {LABELLED_ROWS.has(row)
                ? formatDate(LABELLED_ROWS.get(row)!, { weekday: "short" })
                : ""}
            </span>
          ))}
        </div>
        <div
          className="flex gap-1"
          role="img"
          aria-label={`${t("habits.heatmap")}: ${t("dashboard.completions", { count: total })}`}
        >
          {weeks.map((w, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span
                className="relative h-3.5 text-[10px] leading-3.5 text-muted-foreground"
                aria-hidden
              >
                <span className="absolute left-0 whitespace-nowrap">
                  {months.get(i) ?? ""}
                </span>
              </span>
              {Array.from({ length: 7 }, (_, d) => {
                const cell = w[d] ?? null;
                return cell ? (
                  <div
                    key={d}
                    title={`${formatDate(cell.date)}: ${t("dashboard.completions", { count: cell.count })}`}
                    data-date={cell.date}
                    className={cn(
                      "size-3 rounded-[3px]",
                      LEVELS[level(cell.count)],
                    )}
                  />
                ) : (
                  <div key={d} data-empty className="size-3" />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div
        className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground"
        aria-hidden
      >
        <span>{t("habits.less")}</span>
        {LEVELS.map((l) => (
          <span key={l} className={cn("size-3 rounded-[3px]", l)} />
        ))}
        <span>{t("habits.more")}</span>
      </div>
    </div>
  );
}
