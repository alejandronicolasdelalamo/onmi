import { ArrowRight, CalendarDays, Check, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ProgressRings, type Ring } from "@/components/progress-rings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { useCalendar, useToggleHabit } from "@/lib/queries";
import type { Dashboard } from "@/lib/types";

/** Minutos de enfoque al día que cierran el anillo (dos pomodoros). */
export const FOCUS_GOAL_MIN = 50;

export type NextAction =
  | { kind: "habit"; id: number; name: string }
  | { kind: "mood" }
  | { kind: "focus" }
  | { kind: "goal"; title: string; due: string }
  | { kind: "done" };

/** La única acción que más sentido tiene ahora mismo, en orden de prioridad. */
export function nextAction(
  data: Dashboard,
  today: string,
  now = new Date(),
): NextAction {
  const pending = data.habits.today.find((h) => !h.dates.includes(today));
  if (pending) return { kind: "habit", id: pending.id, name: pending.name };
  if (!data.mood_today) return { kind: "mood" };
  if (data.focus_minutes_today < FOCUS_GOAL_MIN && now.getHours() < 21)
    return { kind: "focus" };
  const soon = data.goals.find((g) => {
    if (!g.due_date) return false;
    const days = (Date.parse(g.due_date) - now.getTime()) / 86_400_000;
    return days <= 3;
  });
  if (soon?.due_date)
    return { kind: "goal", title: soon.title, due: soon.due_date };
  return { kind: "done" };
}

export function TodayCard({ data, today }: { data: Dashboard; today: string }) {
  const { t } = useTranslation();
  const toggle = useToggleHabit();
  const { data: cal } = useCalendar(today, today);
  const doneHabits = data.habits.today.filter((h) =>
    h.dates.includes(today),
  ).length;
  const total = data.habits.total;

  const rings: Ring[] = [
    {
      key: "habits",
      label: t("today.habits"),
      value: total ? doneHabits / total : 0,
      stroke: "stroke-primary",
      detail: `${doneHabits}/${total}`,
    },
    {
      key: "focus",
      label: t("today.focus"),
      value: data.focus_minutes_today / FOCUS_GOAL_MIN,
      stroke: "stroke-success",
      detail: t("dashboard.minutes", { count: data.focus_minutes_today }),
    },
    {
      key: "mood",
      label: t("today.mood"),
      value: data.mood_today ? 1 : 0,
      stroke: "stroke-warning",
      detail: data.mood_today ? t("today.logged") : t("today.notYet"),
    },
  ];

  const events = (cal?.occurrences ?? [])
    .filter((o) => o.day === today)
    .sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99"))
    .slice(0, 4);
  const next = nextAction(data, today);

  return (
    <Card className="grid gap-6 p-5 md:grid-cols-[auto_1fr_1fr] md:items-center">
      <ProgressRings rings={rings} label={t("today.title")} />

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden /> {t("today.next")}
        </p>
        {next.kind === "habit" ? (
          <>
            <p className="text-sm font-medium">
              {t("today.nextHabit", { name: next.name })}
            </p>
            <Button
              size="sm"
              onClick={() => {
                haptic();
                toggle.mutate({ id: next.id });
              }}
            >
              <Check /> {t("today.markDone")}
            </Button>
          </>
        ) : next.kind === "mood" ? (
          <>
            <p className="text-sm font-medium">{t("today.nextMood")}</p>
            <Button asChild size="sm" variant="outline">
              <Link to="/mood">
                {t("today.logMood")} <ArrowRight />
              </Link>
            </Button>
          </>
        ) : next.kind === "focus" ? (
          <>
            <p className="text-sm font-medium">{t("today.nextFocus")}</p>
            <Button asChild size="sm" variant="outline">
              <Link to="/focus">
                {t("today.startFocus")} <ArrowRight />
              </Link>
            </Button>
          </>
        ) : next.kind === "goal" ? (
          <p className="text-sm font-medium">
            {t("today.nextGoal", {
              title: next.title,
              date: formatDate(next.due),
            })}
          </p>
        ) : (
          <p className="text-sm font-medium">{t("today.allDone")}</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden /> {t("today.events")}
        </p>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("today.noEvents")}</p>
        ) : (
          <ul className="space-y-1.5">
            {events.map((e) => (
              <li
                key={`${e.event_id}-${e.day}`}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: e.color }}
                />
                <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {e.start_time?.slice(0, 5) ?? "—"}
                </span>
                <span
                  className={
                    e.done
                      ? "truncate text-muted-foreground line-through"
                      : "truncate"
                  }
                >
                  {e.title}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
