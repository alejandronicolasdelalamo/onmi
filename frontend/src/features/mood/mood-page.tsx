import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from "recharts";
import { toast } from "sonner";
import { MOOD_COLORS, MoodFace, MOODS } from "@/components/mood-face";
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
import { Input } from "@/components/ui/form";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { useMoods, useSetMood } from "@/lib/queries";
import type { MoodKind } from "@/lib/types";
import { addDays, cn, localISODate } from "@/lib/utils";

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

export function MoodPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, isPending } = useMoods(30);
  const setMood = useSetMood();
  // Lo que el usuario ha tocado manda; si no, se muestra lo ya guardado hoy.
  const [pickedMood, setPickedMood] = useState<MoodKind | null>(null);
  const [pickedNote, setPickedNote] = useState<string | null>(null);
  const selected: MoodKind = pickedMood ?? data?.today?.mood ?? "neutral";
  const note = pickedNote ?? data?.today?.note ?? "";
  const setSelected = setPickedMood;
  const setNote = setPickedNote;

  const save = () =>
    setMood.mutate(
      { mood: selected, note },
      {
        onSuccess: () => toast.success(t("mood.saved")),
        onError: (e) => toast.error(errorMessage(e, t)),
      },
    );

  const today = localISODate();
  const byDate = new Map(data?.items.map((e) => [e.date, e]));
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const pie = data
    ? MOODS.map((m) => ({
        name: t(`mood.kinds.${m}`),
        mood: m,
        value: data.counts[m],
      })).filter((d) => d.value > 0)
    : [];

  return (
    <Page>
      <PageHeader title={t("mood.title")} subtitle={t("mood.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("mood.prompt")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <AvatarGif
              avatar={user?.avatar ?? null}
              mood={selected}
              className="size-40 shrink-0"
            />
            <div className="w-full flex-1 space-y-4">
              <div
                className="flex flex-wrap justify-center gap-2 sm:justify-start"
                role="radiogroup"
                aria-label={t("mood.prompt")}
              >
                {MOODS.map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={selected === m}
                    onClick={() => setSelected(m)}
                    className={cn(
                      "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-2.5 text-xs font-medium transition-all hover:-translate-y-0.5",
                      selected === m
                        ? "border-primary bg-accent"
                        : "border-transparent bg-muted/60 hover:bg-muted",
                    )}
                  >
                    <MoodFace mood={m} className="size-9" />
                    {t(`mood.kinds.${m}`)}
                  </button>
                ))}
              </div>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder={t("mood.notePlaceholder")}
                aria-label={t("mood.notePlaceholder")}
              />
              <Button onClick={save} disabled={setMood.isPending}>
                {t("mood.save")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("mood.distribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <Skeleton className="h-44" />
            ) : pie.length === 0 ? (
              <EmptyState title={t("mood.empty")} />
            ) : (
              <>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pie}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={44}
                        outerRadius={70}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {pie.map((d) => (
                          <Cell key={d.mood} fill={MOOD_COLORS[d.mood]} />
                        ))}
                      </Pie>
                      <ChartTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {pie.map((d) => (
                    <li
                      key={d.mood}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <MoodFace mood={d.mood} className="size-4" /> {d.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {d.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("mood.history")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="grid grid-cols-6 gap-2 sm:grid-cols-10 lg:grid-cols-15"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(2.75rem, 1fr))",
              }}
            >
              {days.map((d) => {
                const e = byDate.get(d);
                return (
                  <div
                    key={d}
                    className="flex flex-col items-center gap-1"
                    title={e?.note ? `${d}: ${e.note}` : d}
                  >
                    {e ? (
                      <MoodFace
                        mood={e.mood}
                        title={t(`mood.kinds.${e.mood}`)}
                        className="size-8"
                      />
                    ) : (
                      <span className="size-8 rounded-full border border-dashed border-border" />
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {d.slice(8)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
