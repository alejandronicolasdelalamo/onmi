import { ArrowRight, CalendarCheck, Flame, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { MoodFace, MOODS } from "@/components/mood-face";
import { Page, PageHeader, Stat } from "@/components/page";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useDashboard, useSetMood, useToggleHabit } from "@/lib/queries";
import { cn, localISODate } from "@/lib/utils";

import { QueryError } from "@/components/query-error";
import { formatDate } from "@/lib/format";
function greetingKey() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 19 ? "afternoon" : "evening";
}

function WeekBars({ data }: { data: { date: string; count: number }[] }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div
      className="flex h-24 items-end gap-2"
      role="img"
      aria-label={t("dashboard.weekActivity")}
    >
      {data.map((d) => (
        <div
          key={d.date}
          className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
        >
          <div
            className={cn(
              "w-full rounded-t-md transition-[color,background-color,border-color,box-shadow,transform,opacity]",
              d.count ? "bg-primary" : "bg-muted",
            )}
            style={{ height: `${Math.max(8, (d.count / max) * 100)}%` }}
            title={`${d.date}: ${d.count}`}
          />
          <span className="text-[10px] text-muted-foreground">
            {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "narrow",
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, isPending, isError, error, refetch } = useDashboard();
  const toggle = useToggleHabit();
  const setMood = useSetMood();
  const today = localISODate();

  return (
    <Page>
      <PageHeader
        title={`${t(`dashboard.${greetingKey()}`)}, ${user?.name.split(" ")[0]}`}
        subtitle={t("dashboard.subtitle")}
      />

      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending || !data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label={t("dashboard.habitsToday")}
              value={`${data.habits.today.filter((h) => h.dates.includes(today)).length}/${data.habits.total}`}
              icon={<CalendarCheck />}
            />
            <Stat
              label={t("dashboard.bestStreak")}
              value={t("dashboard.days", { count: data.habits.best_streak })}
              icon={<Flame />}
            />
            <Stat
              label={t("dashboard.focusToday")}
              value={t("dashboard.minutes", {
                count: data.focus_minutes_today,
              })}
              icon={<Timer />}
            />
            <Card className="flex flex-col justify-center p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {data.mood_today
                  ? t("dashboard.moodLogged")
                  : t("dashboard.moodTitle")}
              </p>
              <div
                className="flex gap-1.5"
                role="group"
                aria-label={t("dashboard.moodTitle")}
              >
                {MOODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMood.mutate({ mood: m })}
                    aria-pressed={data.mood_today?.mood === m}
                    aria-label={t(`mood.kinds.${m}`)}
                    className={cn(
                      "cursor-pointer rounded-full p-0.5 transition-[color,background-color,border-color,box-shadow,transform,opacity] hover:scale-110",
                      data.mood_today?.mood === m
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                        : data.mood_today && "opacity-40 hover:opacity-100",
                    )}
                  >
                    <MoodFace mood={m} className="size-7" />
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("dashboard.habitsToday")}</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/habits">
                    {t("common.viewAll")} <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.habits.today.length === 0 ? (
                  <EmptyState
                    title={t("dashboard.noHabits")}
                    action={
                      <Button asChild size="sm">
                        <Link to="/habits?new=1">{t("habits.new")}</Link>
                      </Button>
                    }
                  />
                ) : (
                  data.habits.today.map((h) => {
                    const done = h.dates.includes(today);
                    return (
                      <button
                        key={h.id}
                        onClick={() => toggle.mutate({ id: h.id })}
                        aria-pressed={done}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted"
                      >
                        <span
                          className={cn(
                            "grid size-5 place-items-center rounded-full border-2 transition-[color,background-color,border-color,box-shadow,transform,opacity]",
                            done && "animate-pop",
                          )}
                          style={{
                            borderColor: h.color,
                            background: done ? h.color : "transparent",
                          }}
                        >
                          {done && (
                            <svg
                              viewBox="0 0 12 12"
                              className="size-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                            >
                              <path
                                d="M2.5 6.5l2.2 2.2L9.5 3.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <span
                          className={cn(
                            "flex-1 text-sm font-medium",
                            done && "text-muted-foreground line-through",
                          )}
                        >
                          {h.name}
                        </span>
                        {h.current_streak > 0 && (
                          <Badge tone="warning">
                            <Flame className="size-3" /> {h.current_streak}
                          </Badge>
                        )}
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("dashboard.weekActivity")}</CardTitle>
              </CardHeader>
              <CardContent>
                <WeekBars data={data.habits.week} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("dashboard.activeProjects")}</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/projects">
                    {t("common.viewAll")} <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.projects.active.length === 0 ? (
                  <EmptyState title={t("dashboard.noProjects")} />
                ) : (
                  data.projects.active.map((p) => (
                    <div key={p.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {p.progress}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[color,background-color,border-color,box-shadow,transform,opacity]"
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("dashboard.upcomingGoals")}</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/goals">{t("common.viewAll")}</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.goals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.noGoals")}
                  </p>
                ) : (
                  data.goals.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate">{g.title}</span>
                      {g.due_date && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(g.due_date)}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>{t("dashboard.recentNotes")}</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/notes">
                    {t("common.viewAll")} <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {data.notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.noNotes")}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {data.notes.map((n) => (
                      <Link
                        key={n.id}
                        to="/notes"
                        className="rounded-md border border-border p-3 transition-colors hover:bg-muted"
                      >
                        <p className="truncate text-sm font-medium">
                          {n.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {n.content.replace(/[#*`>\-[\]]/g, "")}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}
