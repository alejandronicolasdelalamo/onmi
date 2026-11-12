import { ArrowDown, ArrowUp, Flame, Minus, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { MoodFace } from "@/components/mood-face";
import { QueryError } from "@/components/query-error";
import { Page, PageHeader } from "@/components/page";
import { CoachCard } from "./coach-card";
import { ShareWeekButton } from "./share-week";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { useInsights } from "@/lib/queries";
import type { HabitEffect, MoodKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const MOOD_BY_SCORE: Record<number, MoodKind> = {
  1: "sad",
  2: "mad",
  3: "neutral",
  4: "happy",
  5: "love",
};
const moodFor = (score: number): MoodKind =>
  MOOD_BY_SCORE[Math.min(5, Math.max(1, Math.round(score)))]!;

/** Variación respecto a la semana anterior: flecha + texto + etiqueta para lectores (nunca solo color). */
function Delta({ value, text }: { value: number | null; text: string }) {
  const { t } = useTranslation();
  if (value === null) {
    return (
      <span className="text-xs text-muted-foreground">
        –<span className="sr-only"> {t("insights.delta.none")}</span>
      </span>
    );
  }
  const dir = value > 0 ? "up" : value < 0 ? "down" : "same";
  const Icon = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        dir === "up" && "text-success-text",
        dir === "down" && "text-danger-text",
        dir === "same" && "text-muted-foreground",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {text}
      <span className="sr-only"> ({t(`insights.delta.${dir}`)})</span>
    </span>
  );
}

function Metric({
  label,
  value,
  delta,
  extra,
}: {
  label: string;
  value: ReactNode;
  delta: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="flex items-center gap-2 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
        {extra}
      </p>
      {delta}
    </div>
  );
}

const signed = (n: number, digits = 0) =>
  `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

function EffectCard({ effect }: { effect: HabitEffect }) {
  const { t } = useTranslation();
  const up = effect.diff > 0;
  const bar = (score: number) => `${(score / 5) * 100}%`;
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <p className="max-w-xl text-lg leading-snug text-balance">
            <Trans
              i18nKey="insights.effect"
              values={{
                habit: effect.name,
                withAvg: effect.avg_with.toFixed(1),
                withoutAvg: effect.avg_without.toFixed(1),
              }}
              components={{ b: <strong className="font-semibold" /> }}
            />
          </p>
          <p
            className={cn(
              "shrink-0 text-4xl font-semibold tabular-nums tracking-tight",
              up ? "text-success-text" : "text-danger-text",
            )}
            aria-label={`${signed(effect.diff, 1)} ${t("insights.outOf")}`}
          >
            {signed(effect.diff, 1)}
          </p>
        </div>
        <div className="space-y-2.5" aria-hidden>
          {[
            {
              label: t("insights.withLabel"),
              score: effect.avg_with,
              color: effect.color,
            },
            {
              label: t("insights.withoutLabel"),
              score: effect.avg_without,
              color: "var(--muted-foreground)",
            },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3 text-sm">
              <span className="w-16 shrink-0 text-muted-foreground">
                {row.label}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{ width: bar(row.score), background: row.color }}
                />
              </div>
              <span className="flex w-14 shrink-0 items-center justify-end gap-1.5 tabular-nums">
                <MoodFace mood={moodFor(row.score)} className="size-4" />
                {row.score.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("insights.basedOn", {
            withDays: effect.days_with,
            withoutDays: effect.days_without,
          })}
        </p>
      </CardContent>
    </Card>
  );
}

export function InsightsPage() {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useInsights();

  if (isError) {
    return (
      <Page>
        <PageHeader
          title={t("insights.title")}
          subtitle={t("insights.subtitle")}
        />
        <QueryError error={error} onRetry={() => void refetch()} />
      </Page>
    );
  }

  const week = data?.week;
  const weekdayName = (wd: number) =>
    formatDate(`2024-01-0${wd + 1}`, { weekday: "long" });

  return (
    <Page>
      <PageHeader
        title={t("insights.title")}
        subtitle={t("insights.subtitle")}
        actions={data ? <ShareWeekButton data={data} /> : undefined}
      />
      {isPending || !data || !week ? (
        <div className="space-y-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-56" />
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t("insights.weekTitle")}</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("insights.weekSub")}
                </p>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Metric
                label={t("insights.metrics.habits")}
                value={
                  week.current.habit_rate === null
                    ? "–"
                    : `${Math.round(week.current.habit_rate * 100)}%`
                }
                delta={
                  <Delta
                    value={
                      week.deltas.habit_rate === null
                        ? null
                        : Math.round(week.deltas.habit_rate * 100)
                    }
                    text={
                      week.deltas.habit_rate === null
                        ? ""
                        : t("insights.delta.pts", {
                            value: signed(
                              Math.round(week.deltas.habit_rate * 100),
                            ),
                          })
                    }
                  />
                }
              />
              <Metric
                label={t("insights.metrics.focus")}
                value={t("dashboard.minutes", {
                  count: week.current.focus_minutes,
                })}
                delta={
                  <Delta
                    value={week.deltas.focus_minutes}
                    text={
                      week.deltas.focus_minutes === null
                        ? ""
                        : t("insights.delta.percent", {
                            value: signed(
                              Math.round(week.deltas.focus_minutes * 100),
                            ),
                          })
                    }
                  />
                }
              />
              <Metric
                label={t("insights.metrics.mood")}
                value={
                  week.current.avg_mood === null
                    ? "–"
                    : week.current.avg_mood.toFixed(1)
                }
                extra={
                  week.current.avg_mood === null ? null : (
                    <MoodFace
                      mood={moodFor(week.current.avg_mood)}
                      className="size-6"
                    />
                  )
                }
                delta={
                  <Delta
                    value={week.deltas.avg_mood}
                    text={
                      week.deltas.avg_mood === null
                        ? ""
                        : signed(week.deltas.avg_mood, 1)
                    }
                  />
                }
              />
              <Metric
                label={t("insights.metrics.goals")}
                value={week.current.goals_done}
                delta={
                  <Delta
                    value={week.deltas.goals_done}
                    text={signed(week.deltas.goals_done)}
                  />
                }
              />
            </CardContent>
          </Card>

          <CoachCard />

          <section aria-labelledby="patterns" className="space-y-4">
            <h2
              id="patterns"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight"
            >
              <TrendingUp className="size-5 text-primary" aria-hidden />
              {t("insights.patternsTitle")}
            </h2>
            {data.habit_effects.length > 0 ? (
              data.habit_effects.map((e) => (
                <EffectCard key={e.habit_id} effect={e} />
              ))
            ) : data.unlock.mood_days < data.unlock.target ? (
              <Card>
                <CardContent className="space-y-3">
                  <p className="font-medium">
                    {t("insights.unlockTitle", { target: data.unlock.target })}
                  </p>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={data.unlock.target}
                    aria-valuenow={data.unlock.mood_days}
                    aria-label={t("insights.unlockProgress", {
                      days: data.unlock.mood_days,
                      target: data.unlock.target,
                    })}
                    className="h-2 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{
                        width: `${(data.unlock.mood_days / data.unlock.target) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      {t("insights.unlockProgress", {
                        days: data.unlock.mood_days,
                        target: data.unlock.target,
                      })}
                    </p>
                    <Button asChild size="sm">
                      <Link to="/mood">{t("insights.unlockCta")}</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t("insights.noPatterns")}
                  </p>
                </CardContent>
              </Card>
            )}

            {(data.best_weekday || data.top_streak) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {data.best_weekday && (
                  <Card>
                    <CardContent className="space-y-1">
                      <p className="font-medium">
                        {t("insights.bestDay", {
                          day: weekdayName(data.best_weekday.weekday),
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("insights.bestDayDesc", {
                          share: Math.round(data.best_weekday.share * 100),
                          day: weekdayName(data.best_weekday.weekday),
                        })}
                      </p>
                    </CardContent>
                  </Card>
                )}
                {data.top_streak && (
                  <Card>
                    <CardContent className="space-y-1">
                      <p className="flex items-center gap-1.5 font-medium">
                        <Flame className="size-4 text-warning" aria-hidden />
                        {t(
                          data.top_streak.unit === "week"
                            ? "insights.topStreakWeeks"
                            : "insights.topStreak",
                          {
                            count: data.top_streak.count,
                          },
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("insights.topStreakDesc", {
                          name: data.top_streak.name,
                        })}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
