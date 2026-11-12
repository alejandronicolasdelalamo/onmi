import { ChevronLeft, ChevronRight, Flame, Pencil, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from "recharts";
import { toast } from "sonner";
import {
  MOOD_COLORS,
  MoodBurst,
  MoodFace,
  MOODS,
} from "@/components/mood-face";
import { Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { errorMessage } from "@/lib/errors";
import { parseUtc } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import {
  MAX_MOOD_TAGS,
  MOOD_TAGS,
  monthCells,
  moodFromScore,
  sameTags,
  shiftMonth,
} from "@/lib/mood";
import { useDeleteMood, useMoods, useSetMood } from "@/lib/queries";
import type { MoodEntry, MoodKind } from "@/lib/types";
import { addDays, cn, localISODate } from "@/lib/utils";

import { QueryError } from "@/components/query-error";

/** GIF del avatar elegido en Ajustes reaccionando al ánimo seleccionado. */
export function AvatarGif({
  avatar,
  mood,
  className,
}: {
  avatar: string | null;
  mood: MoodKind;
  className?: string;
}) {
  const base =
    avatar && ["male", "female", "prefer_not_to_say"].includes(avatar)
      ? avatar
      : "prefer_not_to_say";
  return (
    <img
      src={`/avatars/${base}_${mood}.gif`}
      alt=""
      width={160}
      height={160}
      loading="lazy"
      className={cn("rounded-2xl bg-muted object-cover", className)}
    />
  );
}

interface Draft {
  date: string;
  mood?: MoodKind;
  note?: string;
  tags?: string[];
}

export function MoodPage() {
  const { t, i18n } = useTranslation();
  const today = localISODate();
  const recent = useMoods(30);
  const year = useMoods(365);
  const setMood = useSetMood();
  const delMood = useDeleteMood();
  const heroRef = useRef<HTMLDivElement>(null);

  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [burst, setBurst] = useState(0);
  const [confirm, setConfirm] = useState(false);

  const byDate = useMemo(
    () => new Map<string, MoodEntry>(year.data?.items.map((e) => [e.date, e])),
    [year.data],
  );
  const saved = byDate.get(date);
  const d = draft?.date === date ? draft : null;
  const picked = d?.mood ?? saved?.mood ?? null;
  const face: MoodKind = picked ?? "neutral";
  const note = d?.note ?? saved?.note ?? "";
  const tags = d?.tags ?? saved?.tags ?? [];
  const dirty =
    picked !== null &&
    (picked !== saved?.mood ||
      note !== (saved?.note ?? "") ||
      !sameTags(tags, saved?.tags ?? []));

  const update = (patch: Partial<Draft>) =>
    setDraft({ ...(d ?? { date }), date, ...patch });

  const pick = (m: MoodKind) => {
    haptic();
    update({ mood: m });
    setBurst((n) => n + 1);
  };

  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) update({ tags: tags.filter((x) => x !== tag) });
    else if (tags.length < MAX_MOOD_TAGS) update({ tags: [...tags, tag] });
  };

  const goTo = (next: string, scroll = false) => {
    setDate(next);
    setMonth(next.slice(0, 7));
    setDraft(null);
    if (scroll) heroRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const save = () => {
    if (!picked) return;
    const wasSaved = !!saved;
    setMood.mutate(
      { mood: picked, note, tags, date },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success(wasSaved ? t("mood.updated") : t("mood.saved"));
        },
        onError: (e) => toast.error(errorMessage(e, t)),
      },
    );
  };

  const remove = () =>
    delMood.mutate(date, {
      onSuccess: () => {
        setConfirm(false);
        setDraft(null);
        toast.success(t("mood.deleted"));
      },
      onError: (e) => toast.error(errorMessage(e, t)),
    });

  const dayLabel = (iso: string, opts?: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      weekday: "long",
      day: "numeric",
      month: "long",
      ...opts,
    });
  const headline =
    date === today
      ? t("mood.today")
      : date === addDays(today, -1)
        ? t("mood.yesterday")
        : dayLabel(date);

  const stats = recent.data?.stats;
  const pie = recent.data
    ? MOODS.map((m) => ({
        name: t(`mood.kinds.${m}`),
        mood: m,
        value: recent.data.counts[m],
      })).filter((x) => x.value > 0)
    : [];
  const lifts = (stats?.by_tag ?? []).filter(
    (x) => x.count >= 2 && x.average >= 3.5,
  );
  const weighs = (stats?.by_tag ?? [])
    .filter((x) => x.count >= 2 && x.average < 3)
    .reverse();

  const cells = monthCells(month);
  const monthTitle = new Date(`${month}-01T00:00:00`).toLocaleDateString(
    i18n.language,
    { month: "long", year: "numeric" },
  );
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(i18n.language, {
      weekday: "narrow",
    }),
  );
  const timeline = [...(year.data?.items ?? [])].reverse().slice(0, 10);
  const error = recent.error ?? year.error;

  return (
    <Page>
      <PageHeader title={t("mood.title")} subtitle={t("mood.subtitle")} />
      {(recent.isError || year.isError) && (
        <div className="mb-4">
          <QueryError
            error={error}
            onRetry={() => {
              void recent.refetch();
              void year.refetch();
            }}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2" ref={heroRef}>
          <Card>
            <CardHeader className="flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("mood.prevDay")}
                  onClick={() => goTo(addDays(date, -1))}
                >
                  <ChevronLeft />
                </Button>
                <CardTitle className="min-w-32 text-center capitalize">
                  {headline}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("mood.nextDay")}
                  disabled={date >= today}
                  onClick={() => goTo(addDays(date, 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
              {date !== today && (
                <Button variant="outline" size="sm" onClick={() => goTo(today)}>
                  {t("mood.backToToday")}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-8">
                <div className="relative grid size-44 shrink-0 place-items-center">
                  <span
                    aria-hidden
                    className="absolute inset-3 rounded-full transition-all duration-500"
                    style={{
                      background: `radial-gradient(circle, ${MOOD_COLORS[face]}${picked ? "55" : "22"} 0%, transparent 70%)`,
                    }}
                  />
                  <MoodFace
                    key={face}
                    mood={face}
                    animated
                    className={cn(
                      "size-36 animate-pop transition-opacity",
                      !picked && "opacity-40",
                    )}
                    title={t(`mood.kinds.${face}`)}
                  />
                  <MoodBurst mood={face} nonce={burst} />
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-center sm:text-left">
                  <p className="text-2xl font-semibold tracking-tight">
                    {picked ? t(`mood.kinds.${picked}`) : t("mood.pick")}
                  </p>
                  <p
                    className="text-sm text-muted-foreground"
                    aria-live="polite"
                  >
                    {saved?.updated_at
                      ? t("mood.loggedAt", {
                          time: new Date(
                            parseUtc(saved.updated_at),
                          ).toLocaleTimeString(i18n.language, {
                            hour: "2-digit",
                            minute: "2-digit",
                          }),
                        })
                      : t("mood.notLogged")}
                    {saved && picked && picked !== saved.mood && (
                      <>
                        {" · "}
                        {t("mood.changedFrom", {
                          from: t(`mood.kinds.${saved.mood}`),
                        })}
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div
                className="flex flex-wrap justify-center gap-2 sm:justify-start"
                role="radiogroup"
                aria-label={t("mood.prompt")}
              >
                {MOODS.map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={picked === m}
                    onClick={() => pick(m)}
                    className={cn(
                      "flex min-w-[4.25rem] cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-2.5 text-xs font-medium transition-[color,background-color,border-color,box-shadow,transform,opacity] hover:-translate-y-0.5 active:scale-95",
                      picked === m
                        ? "border-primary bg-accent shadow-sm"
                        : "border-transparent bg-muted/60 hover:bg-muted",
                    )}
                  >
                    <MoodFace
                      mood={m}
                      animated={picked === m}
                      className="size-10"
                    />
                    {t(`mood.kinds.${m}`)}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium" id="mood-tags-label">
                  {t("mood.influences")}
                </p>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-labelledby="mood-tags-label"
                >
                  {MOOD_TAGS.map((tag) => {
                    const on = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleTag(tag)}
                        disabled={!on && tags.length >= MAX_MOOD_TAGS}
                        className={cn(
                          "cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                          on
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/70",
                        )}
                      >
                        {t(`mood.tags.${tag}`)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("mood.influencesHint", { max: MAX_MOOD_TAGS })}
                </p>
              </div>

              <Input
                value={note}
                onChange={(e) => update({ note: e.target.value })}
                maxLength={300}
                placeholder={t("mood.notePlaceholder")}
                aria-label={t("mood.notePlaceholder")}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={save} disabled={!dirty || setMood.isPending}>
                  {saved ? t("mood.update") : t("mood.save")}
                </Button>
                {saved && (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirm(true)}
                  >
                    <Trash2 /> {t("mood.delete")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("mood.statsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {recent.isPending || !stats ? (
                <Skeleton className="h-24" />
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/60 p-2.5">
                      <Flame
                        className="mx-auto size-5 text-warning"
                        aria-hidden
                      />
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {stats.streak}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("mood.streakLabel")}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-2.5">
                      {stats.average !== null ? (
                        <MoodFace
                          mood={moodFromScore(stats.average)}
                          className="mx-auto size-5"
                        />
                      ) : (
                        <span className="mx-auto block size-5 rounded-full border border-dashed border-border" />
                      )}
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {stats.average?.toFixed(1) ?? "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("mood.average")}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-2.5">
                      <p className="mt-6 text-lg font-semibold tabular-nums">
                        {stats.logged_days}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("mood.logged")}
                      </p>
                    </div>
                  </div>

                  {lifts.length === 0 && weighs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("mood.needMore")}
                    </p>
                  ) : (
                    <>
                      {(
                        [
                          ["lifts", lifts],
                          ["weighs", weighs],
                        ] as const
                      ).map(([kind, items]) =>
                        items.length ? (
                          <div key={kind} className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">
                              {t(`mood.${kind}`)}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {items.slice(0, 3).map((x) => (
                                <span
                                  key={x.tag}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
                                >
                                  <MoodFace
                                    mood={moodFromScore(x.average)}
                                    className="size-4"
                                  />
                                  {t(`mood.tags.${x.tag}`)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null,
                      )}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("mood.distribution")}</CardTitle>
            </CardHeader>
            <CardContent>
              {recent.isPending ? (
                <Skeleton className="h-44" />
              ) : pie.length === 0 ? (
                <EmptyState art="mood" title={t("mood.empty")} />
              ) : (
                <>
                  <div
                    className="h-40"
                    role="img"
                    aria-label={`${t("mood.distribution")}: ${pie.map((x) => `${x.name} ${x.value}`).join(", ")}`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart accessibilityLayer={false}>
                        <Pie
                          data={pie}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={40}
                          outerRadius={64}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {pie.map((x) => (
                            <Cell key={x.mood} fill={MOOD_COLORS[x.mood]} />
                          ))}
                        </Pie>
                        <ChartTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {pie.map((x) => (
                      <li
                        key={x.mood}
                        className="flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2">
                          <MoodFace mood={x.mood} className="size-4" /> {x.name}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {x.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="capitalize">{monthTitle}</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("mood.prevMonth")}
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("mood.nextMonth")}
                disabled={month >= today.slice(0, 7)}
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div
              role="group"
              aria-label={t("mood.calendar")}
              className="grid grid-cols-7 gap-1.5"
            >
              {weekdays.map((w, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="pb-1 text-center text-[11px] font-medium text-muted-foreground"
                >
                  {w}
                </span>
              ))}
              {cells.map((c, i) => {
                if (!c.date) return <span key={`b${i}`} />;
                const e = byDate.get(c.date);
                const future = c.date > today;
                const isSel = c.date === date;
                return (
                  <button
                    key={c.date}

                    disabled={future}
                    aria-pressed={isSel}
                    aria-label={`${dayLabel(c.date, { weekday: undefined })}${e ? `, ${t(`mood.kinds.${e.mood}`)}` : ""}`}
                    onClick={() => goTo(c.date!, true)}
                    className={cn(
                      "flex h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border text-[11px] transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent",
                      isSel
                        ? "border-primary bg-accent"
                        : c.date === today
                          ? "border-primary/40"
                          : "border-transparent",
                    )}
                  >
                    {e ? (
                      <MoodFace mood={e.mood} className="size-6" />
                    ) : (
                      <span className="size-6 rounded-full border border-dashed border-border" />
                    )}
                    <span className="tabular-nums text-muted-foreground">
                      {c.day}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("mood.timeline")}</CardTitle>
          </CardHeader>
          <CardContent>
            {year.isPending ? (
              <Skeleton className="h-40" />
            ) : timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("mood.empty")}</p>
            ) : (
              <ul className="space-y-3">
                {timeline.map((e) => (
                  <li key={e.id} className="flex items-start gap-3">
                    <MoodFace
                      mood={e.mood}
                      className="mt-0.5 size-8 shrink-0"
                      title={t(`mood.kinds.${e.mood}`)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium capitalize">
                        {dayLabel(e.date, { weekday: "short", month: "short" })}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {e.note || t("mood.noNote")}
                      </p>
                      {e.tags.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {e.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {t(`mood.tags.${tag}`)}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`${t("mood.edit")}: ${dayLabel(e.date)}`}
                      onClick={() => goTo(e.date, true)}
                    >
                      <Pencil />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("mood.deleteTitle")}
        description={t("mood.deleteDesc")}
        confirmLabel={t("common.delete")}
        pending={delMood.isPending}
        onConfirm={remove}
      />
    </Page>
  );
}
