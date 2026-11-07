import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface Props {
  series: { date: string; count: number }[];
  className?: string;
}

const LEVELS = [
  "bg-muted",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
];

/** Heatmap estilo GitHub: columnas = semanas, filas = días (lunes primero). */
export function Heatmap({ series, className }: Props) {
  const { t } = useTranslation();
  const { weeks, max } = useMemo(() => {
    const cells = series.map((s) => ({
      ...s,
      dow: (new Date(`${s.date}T00:00:00`).getDay() + 6) % 7,
    }));
    const weeks: ((typeof cells)[number] | null)[][] = [];
    let week: ((typeof cells)[number] | null)[] = [];
    cells.forEach((c, i) => {
      if (i === 0) week = Array<null>(c.dow).fill(null);
      week.push(c);
      if (c.dow === 6) {
        weeks.push(week);
        week = [];
      }
    });
    if (week.length) weeks.push(week);
    return { weeks, max: Math.max(1, ...series.map((s) => s.count)) };
  }, [series]);

  const level = (n: number) =>
    n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4));

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin"
        role="img"
        aria-label={t("habits.heatmap")}
      >
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-1">
            {Array.from({ length: 7 }, (_, d) => {
              const cell = w[d] ?? null;
              return (
                <div
                  key={d}
                  title={
                    cell
                      ? `${cell.date}: ${t("dashboard.completions", { count: cell.count })}`
                      : undefined
                  }
                  className={cn(
                    "size-3 rounded-[3px]",
                    cell ? LEVELS[level(cell.count)] : "bg-transparent",
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        <span>{t("habits.less")}</span>
        {LEVELS.map((l) => (
          <span key={l} className={cn("size-3 rounded-[3px]", l)} />
        ))}
        <span>{t("habits.more")}</span>
      </div>
    </div>
  );
}
