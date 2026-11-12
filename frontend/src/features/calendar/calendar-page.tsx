import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  Pencil,
  Plus,
  Repeat as RepeatIcon,
  SkipForward,
  Users,
} from "lucide-react";
import { MoodFace } from "@/components/mood-face";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Page, PageHeader } from "@/components/page";
import { QueryError } from "@/components/query-error";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, EmptyState } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import {
  useCalendar,
  useCalendarActivity,
  useMarkDay,
  useSharedCalendars,
} from "@/lib/queries";
import type {
  BuddyUser,
  CalendarEventDef,
  MoodKind,
  Occurrence,
} from "@/lib/types";
import { addDays, cn, localISODate } from "@/lib/utils";
import {
  addMonths,
  endTime,
  monthGrid,
  monthStart,
  weekDays,
  weekdayName,
  weekdayOrder,
  weekdaysSummary,
} from "./calendar-utils";
import { EventDialog } from "./event-dialog";
import { buildLayerItems, LAYERS, type LayerKey } from "./calendar-layers";
import { CalendarsDialog } from "./calendars-dialog";

type View = "month" | "week";
type Scope = "mine" | "shared";
interface Prefs {
  weekStart: 0 | 6;
  view: View;
  scope: Scope;
  /** Calendarios míos que están ocultos. */
  hiddenCals: number[];
  /** Calendarios compartidos conmigo que están ocultos. */
  hiddenShared: number[];
  /** Datos de ONMi que se ven sobre mi calendario privado. */
  layers: LayerKey[];
}
const PREFS_KEY = "onmi-calendar-prefs";

const nums = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : [];

function loadPrefs(): Prefs {
  const fallback: Prefs = {
    weekStart: 0,
    view: "month",
    scope: "mine",
    hiddenCals: [],
    hiddenShared: [],
    layers: [...LAYERS],
  };
  try {
    const raw = JSON.parse(
      localStorage.getItem(PREFS_KEY) ?? "null",
    ) as Partial<Prefs> | null;
    return {
      weekStart: raw?.weekStart === 6 ? 6 : 0,
      view: raw?.view === "week" ? "week" : "month",
      scope: raw?.scope === "shared" ? "shared" : "mine",
      hiddenCals: nums(raw?.hiddenCals),
      hiddenShared: nums(raw?.hiddenShared),
      layers: Array.isArray(raw?.layers)
        ? raw.layers.filter((l): l is LayerKey =>
            (LAYERS as readonly string[]).includes(l),
          )
        : fallback.layers,
    };
  } catch {
    return fallback;
  }
}

type Item =
  | { kind: "mine"; occ: Occurrence }
  | { kind: "shared"; occ: Occurrence; user: BuddyUser; calendar: string }
  | { kind: "layer"; occ: Occurrence; layer: LayerKey; mood?: MoodKind };

function timeLabel(o: Occurrence): string | null {
  if (!o.start_time) return null;
  return o.duration_min
    ? `${o.start_time}–${endTime(o.start_time, o.duration_min)}`
    : o.start_time;
}

function DayItem({
  item,
  event,
  onEdit,
}: {
  item: Item;
  event?: CalendarEventDef;
  onEdit: () => void;
}) {
  const { t, i18n } = useTranslation();
  const mark = useMarkDay();
  const { occ } = item;
  const mine = item.kind === "mine";
  const time = timeLabel(occ);
  if (item.kind === "layer")
    return (
      <li className="flex items-center gap-3 py-2.5">
        {item.mood ? (
          <MoodFace mood={item.mood} className="size-6 shrink-0" />
        ) : (
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ background: occ.color }}
            aria-hidden
          />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm",
              occ.done && item.layer === "goals" && "line-through",
            )}
          >
            {occ.title}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" aria-hidden />
            {t(`calendar.layers.${item.layer}`)}
          </p>
        </div>
      </li>
    );
  return (
    <li className="flex items-start gap-3 py-3">
      {mine ? (
        <button
          type="button"
          onClick={() =>
            mark.mutate({
              id: occ.event_id,
              day: occ.day,
              status: occ.done ? null : "done",
            })
          }
          aria-pressed={occ.done}
          aria-label={`${t("calendar.markDone")}: ${occ.title}`}
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors pointer-coarse:size-9",
            occ.done
              ? "border-transparent text-white"
              : "border-border hover:bg-muted",
          )}
          style={
            occ.done ? { background: occ.color } : { borderColor: occ.color }
          }
        >
          {occ.done && <Check className="size-4" />}
        </button>
      ) : (
        <span
          className="mt-1 size-3 shrink-0 rounded-full"
          style={{ background: occ.color }}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "text-sm font-medium",
            occ.done && "text-muted-foreground line-through",
          )}
        >
          {occ.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{time ?? t("calendar.allDay")}</span>
          {occ.flexible && occ.per_week && (
            <Badge tone="primary">
              {t("calendar.weekProgress", {
                done: Math.min(occ.week_done ?? 0, occ.per_week),
                count: occ.per_week,
              })}
            </Badge>
          )}
          {occ.repeat === "weekdays" && event && (
            <span className="flex items-center gap-1">
              <RepeatIcon className="size-3" />{" "}
              {weekdaysSummary(event.weekdays, i18n.language)}
            </span>
          )}
          {occ.repeat === "daily" && (
            <span className="flex items-center gap-1">
              <RepeatIcon className="size-3" /> {t("calendar.repeat_daily")}
            </span>
          )}
          {mine && !occ.shared && (
            <span
              className="flex items-center gap-1"
              title={t("calendar.private")}
            >
              <Lock className="size-3" />
              <span className="sr-only">{t("calendar.private")}</span>
            </span>
          )}
          {mine && occ.shared && (
            <span className="flex items-center gap-1">
              <Users className="size-3" /> {t("calendar.shared")}
            </span>
          )}
          {item.kind === "shared" && (
            <span className="flex items-center gap-1.5">
              <Avatar name={item.user.name} className="size-5 text-[10px]" />
              {item.user.name} · {item.calendar}
            </span>
          )}
        </div>
        {mine && occ.notes && (
          <p className="text-xs text-muted-foreground">{occ.notes}</p>
        )}
      </div>
      {mine && (
        <div className="flex shrink-0 gap-0.5">
          {occ.repeat !== "none" && !occ.done && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 pointer-coarse:size-10"
              aria-label={`${t("calendar.skipDay")}: ${occ.title}`}
              title={t("calendar.skipDay")}
              onClick={() =>
                mark.mutate({
                  id: occ.event_id,
                  day: occ.day,
                  status: "skipped",
                })
              }
            >
              <SkipForward />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 pointer-coarse:size-10"
            aria-label={`${t("common.edit")}: ${occ.title}`}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
        </div>
      )}
    </li>
  );
}

export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const today = localISODate();
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState<CalendarEventDef | undefined>();
  const [dialog, setDialog] = useState(false);
  const [managing, setManaging] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const setPrefs = (patch: Partial<Prefs>) =>
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento: las preferencias duran lo que la pestaña */
      }
      return next;
    });

  const { weekStart, view } = prefs;
  const cells = useMemo(
    () =>
      view === "month"
        ? monthGrid(cursor, weekStart)
        : weekDays(cursor, weekStart),
    [view, cursor, weekStart],
  );
  const from = cells[0]!;
  const to = cells[cells.length - 1]!;
  const mine = useCalendar(from, to);
  const shared = useSharedCalendars(from, to);
  const { scope } = prefs;
  const showLayers = scope === "mine" && prefs.layers.length > 0;
  const activity = useCalendarActivity(from, to, showLayers);
  const personalId = mine.data?.calendars.find((c) => c.is_default)?.id;

  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    const push = (day: string, item: Item) =>
      map.set(day, [...(map.get(day) ?? []), item]);
    if (scope === "mine") {
      for (const occ of mine.data?.occurrences ?? []) {
        if (prefs.hiddenCals.includes(occ.calendar_id ?? personalId ?? -1))
          continue;
        push(occ.day, { kind: "mine", occ });
      }
      for (const l of buildLayerItems(activity.data ?? [], prefs.layers, {
        habits: (count, names) => t("calendar.layerHabits", { count, names }),
        focus: (minutes) => t("calendar.layerFocus", { count: minutes }),
        mood: (m) => t(`mood.kinds.${m}`),
      }))
        push(l.occ.day, { kind: "layer", ...l });
    } else {
      for (const sc of shared.data?.calendars ?? []) {
        if (prefs.hiddenShared.includes(sc.calendar.id)) continue;
        for (const occ of sc.occurrences)
          push(occ.day, {
            kind: "shared",
            occ: { ...occ, color: occ.color },
            user: sc.user,
            calendar: sc.calendar.name,
          });
      }
    }
    for (const list of map.values())
      list.sort((a, b) =>
        (a.occ.start_time ?? "").localeCompare(b.occ.start_time ?? ""),
      );
    return map;
  }, [
    scope,
    mine.data,
    shared.data,
    activity.data,
    prefs.hiddenCals,
    prefs.hiddenShared,
    prefs.layers,
    personalId,
    t,
  ]);

  const eventById = (id: number) => mine.data?.events.find((e) => e.id === id);
  const lang = i18n.language;
  const title = new Intl.DateTimeFormat(lang, {
    month: "long",
    year: "numeric",
  }).format(new Date(`${monthStart(cursor)}T00:00:00`));
  const weekTitle = `${new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(new Date(`${from}T00:00:00`))} – ${new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(new Date(`${to}T00:00:00`))}`;
  const step = (dir: 1 | -1) =>
    setCursor((c) =>
      view === "month" ? addMonths(c, dir) : addDays(c, 7 * dir),
    );
  const goToday = () => {
    setCursor(today);
    setSelected(today);
  };
  const openNew = (day = selected) => {
    setEditing(undefined);
    setSelected(day);
    setDialog(true);
  };
  const sharedCals = shared.data?.calendars ?? [];
  const selectedItems = byDay.get(selected) ?? [];
  const selectedLabel = new Intl.DateTimeFormat(lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${selected}T00:00:00`));

  const renderDayList = (day: string) => {
    const items = byDay.get(day) ?? [];
    return items.length === 0 ? (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t("calendar.nothing")}
      </p>
    ) : (
      <ul className="divide-y divide-border">
        {items.map((it, i) => (
          <DayItem
            key={`${it.kind}-${it.occ.event_id}-${i}`}
            item={it}
            event={it.kind === "mine" ? eventById(it.occ.event_id) : undefined}
            onEdit={() => {
              setEditing(eventById(it.occ.event_id));
              setDialog(true);
            }}
          />
        ))}
      </ul>
    );
  };

  return (
    <Page>
      <PageHeader
        title={t("calendar.title")}
        subtitle={t("calendar.subtitle")}
        actions={
          <>
            <Button variant="outline" onClick={() => setManaging(true)}>
              <Users />{" "}
              <span className="max-sm:sr-only">{t("calendar.calendars")}</span>
            </Button>
            {/* También en móvil (solo el icono): un botón flotante tapaba los lápices de editar. */}
            <Button onClick={() => openNew()}>
              <Plus />{" "}
              <span className="max-sm:sr-only">{t("calendar.newEvent")}</span>
            </Button>
          </>
        }
      />

      {mine.isError ? (
        <QueryError error={mine.error} onRetry={() => void mine.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => step(-1)}
                  aria-label={t(
                    view === "month"
                      ? "calendar.prevMonth"
                      : "calendar.prevWeek",
                  )}
                >
                  <ChevronLeft />
                </Button>
                <h2
                  className="min-w-0 flex-1 text-center text-base font-semibold capitalize sm:flex-none sm:px-2 sm:text-left"
                  aria-live="polite"
                >
                  {view === "month" ? title : weekTitle}
                </h2>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => step(1)}
                  aria-label={t(
                    view === "month"
                      ? "calendar.nextMonth"
                      : "calendar.nextWeek",
                  )}
                >
                  <ChevronRight />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToday}
                  className="sm:ml-1"
                >
                  {t("calendar.today")}
                </Button>
                <div
                  className="ml-auto flex items-center gap-1"
                  role="group"
                  aria-label={t("calendar.view")}
                >
                  {(["month", "week"] as View[]).map((v) => (
                    <Button
                      key={v}
                      size="sm"
                      variant={view === v ? "default" : "ghost"}
                      aria-pressed={view === v}
                      onClick={() => setPrefs({ view: v })}
                    >
                      {t(`calendar.${v}`)}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-expanded={showOptions}
                    onClick={() => setShowOptions((o) => !o)}
                  >
                    {t("calendar.options")}
                  </Button>
                </div>
              </div>

              {showOptions && (
                <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
                  <fieldset className="flex flex-wrap items-center gap-2">
                    <legend className="mb-1 text-xs font-medium text-muted-foreground">
                      {t("calendar.weekStarts")}
                    </legend>
                    {([0, 6] as const).map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={weekStart === s ? "default" : "outline"}
                        aria-pressed={weekStart === s}
                        onClick={() => setPrefs({ weekStart: s })}
                      >
                        {weekdayName(s === 0 ? 0 : 6, lang, "long")}
                      </Button>
                    ))}
                  </fieldset>
                </div>
              )}

              <div
                className="inline-flex w-fit rounded-md bg-muted p-0.5 text-sm"
                role="group"
                aria-label={t("calendar.scope")}
              >
                {(["mine", "shared"] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    aria-pressed={scope === sc}
                    onClick={() => setPrefs({ scope: sc })}
                    className={cn(
                      "cursor-pointer rounded-[5px] px-3 py-1 font-medium transition-colors pointer-coarse:min-h-11",
                      scope === sc
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground",
                    )}
                  >
                    {t(`calendar.scope_${sc}`)}
                    {sc === "shared" && sharedCals.length > 0 && (
                      <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-[11px] text-primary">
                        {sharedCals.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {scope === "mine" ? (
                <>
                  <div
                    className="flex flex-wrap items-center gap-2"
                    role="group"
                    aria-label={t("calendar.myCalendars")}
                  >
                    {(mine.data?.calendars ?? []).map((c) => {
                      const on = !prefs.hiddenCals.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setPrefs({
                              hiddenCals: on
                                ? [...prefs.hiddenCals, c.id]
                                : prefs.hiddenCals.filter((x) => x !== c.id),
                            })
                          }
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors pointer-coarse:min-h-11",
                            on
                              ? "border-transparent bg-muted text-foreground"
                              : "border-border text-muted-foreground line-through",
                          )}
                        >
                          <span
                            aria-hidden
                            className="size-2.5 rounded-full"
                            style={{
                              background: on ? c.color : "transparent",
                              border: `2px solid ${c.color}`,
                            }}
                          />
                          {c.is_default ? t("calendar.personal") : c.name}
                          {c.viewers.length > 0 ? (
                            <Users
                              className="size-3"
                              aria-label={t("calendar.shared")}
                            />
                          ) : (
                            <Lock
                              className="size-3 opacity-60"
                              aria-label={t("calendar.private")}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    className="flex flex-wrap items-center gap-2"
                    role="group"
                    aria-label={t("calendar.myData")}
                  >
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="size-3" aria-hidden />{" "}
                      {t("calendar.myData")}
                    </span>
                    {LAYERS.map((l) => {
                      const on = prefs.layers.includes(l);
                      return (
                        <button
                          key={l}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setPrefs({
                              layers: on
                                ? prefs.layers.filter((x) => x !== l)
                                : [...prefs.layers, l],
                            })
                          }
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors pointer-coarse:min-h-11",
                            on
                              ? "border-primary bg-accent text-accent-foreground"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {t(`calendar.layers.${l}`)}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : sharedCals.length === 0 ? (
                <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  {t("calendar.noSharedCalendars")}
                </p>
              ) : (
                <div
                  className="flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label={t("calendar.sharedWithMe")}
                >
                  {sharedCals.map(({ calendar: c, user: p }) => {
                    const on = !prefs.hiddenShared.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setPrefs({
                            hiddenShared: on
                              ? [...prefs.hiddenShared, c.id]
                              : prefs.hiddenShared.filter((x) => x !== c.id),
                          })
                        }
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium transition-colors pointer-coarse:min-h-11",
                          on
                            ? "border-primary bg-accent text-accent-foreground"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        <Avatar name={p.name} className="size-5 text-[10px]" />
                        {p.name} · {c.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {view === "month" ? (
                <div>
                  <div
                    className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-muted-foreground"
                    aria-hidden
                  >
                    {weekdayOrder(weekStart).map((d) => (
                      <span key={d} className="py-1">
                        {weekdayName(d, lang, "short")}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
                    {cells.map((day) => {
                      const items = byDay.get(day) ?? [];
                      const inMonth = day.slice(0, 7) === cursor.slice(0, 7);
                      const isToday = day === today;
                      const isSelected = day === selected;
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setSelected(day)}
                          onDoubleClick={() => openNew(day)}
                          aria-pressed={isSelected}
                          className={cn(
                            "flex min-h-14 flex-col items-center gap-1 bg-card p-1 text-sm transition-colors hover:bg-muted sm:min-h-24 sm:items-stretch",
                            !inMonth && "bg-muted text-muted-foreground",
                            isSelected && "bg-accent hover:bg-accent",
                          )}
                        >
                          <span className="sr-only">
                            {new Intl.DateTimeFormat(lang, {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            }).format(new Date(`${day}T00:00:00`))}
                            {items.length
                              ? `, ${t("calendar.eventCount", { count: items.length })}`
                              : ""}
                          </span>
                          <span
                            aria-hidden
                            className={cn(
                              "grid size-7 place-items-center self-center rounded-full text-xs font-medium sm:self-start",
                              isToday && "bg-primary text-primary-foreground",
                            )}
                          >
                            {Number(day.slice(8))}
                          </span>
                          {/* Móvil: puntos de color. Escritorio: etiquetas con el título. */}
                          <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                            {items.slice(0, 4).map((it, i) => (
                              <span
                                key={i}
                                className={cn(
                                  "size-1.5 rounded-full",
                                  it.kind === "shared" &&
                                    "bg-transparent ring-1",
                                )}
                                style={{
                                  background:
                                    it.kind !== "shared"
                                      ? it.occ.color
                                      : undefined,
                                  // El anillo hueco distingue lo que comparten otros.
                                  ["--tw-ring-color" as string]: it.occ.color,
                                }}
                              />
                            ))}
                          </span>
                          <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                            {items.slice(0, 3).map((it, i) => (
                              <span
                                key={i}
                                className={cn(
                                  "truncate rounded px-1 text-left text-[11px] leading-4 text-foreground",
                                  it.occ.done &&
                                    "text-muted-foreground line-through",
                                )}
                                style={
                                  it.kind === "mine"
                                    ? {
                                        background: `${it.occ.color}26`,
                                        borderLeft: `3px solid ${it.occ.color}`,
                                      }
                                    : it.kind === "layer"
                                      ? {
                                          background: `${it.occ.color}1a`,
                                          fontStyle: "italic",
                                        }
                                      : { border: `1px dashed ${it.occ.color}` }
                                }
                              >
                                {it.occ.title}
                              </span>
                            ))}
                            {items.length > 3 && (
                              <span className="px-1 text-left text-[11px] text-muted-foreground">
                                +{items.length - 3}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {cells.map((day) => (
                    <section
                      key={day}
                      aria-label={day}
                      className="rounded-lg border border-border"
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(day)}
                        aria-pressed={day === selected}
                        className={cn(
                          "flex w-full items-center justify-between rounded-t-lg px-3 py-2 text-left text-sm font-semibold",
                          day === selected ? "bg-accent" : "bg-muted/40",
                          day === today && "text-primary",
                        )}
                      >
                        <span className="capitalize">
                          {new Intl.DateTimeFormat(lang, {
                            weekday: "long",
                            day: "numeric",
                            month: "short",
                          }).format(new Date(`${day}T00:00:00`))}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {t("calendar.eventCount", {
                            count: (byDay.get(day) ?? []).length,
                          })}
                        </span>
                      </button>
                      <div className="px-3">{renderDayList(day)}</div>
                    </section>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {view === "month" && (
            <Card className="h-fit lg:sticky lg:top-20">
              <CardContent className="pt-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold capitalize">
                    {selectedLabel}
                  </h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openNew(selected)}
                  >
                    <Plus /> {t("calendar.add")}
                  </Button>
                </div>
                {mine.isPending ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("common.loading")}
                  </p>
                ) : selectedItems.length === 0 &&
                  (mine.data?.events.length ?? 0) === 0 ? (
                  <EmptyState
                    art="calendar"
                    icon={<CalendarDays />}
                    title={t("calendar.empty")}
                    description={t("calendar.emptyDesc")}
                    action={
                      <Button onClick={() => openNew(selected)}>
                        <Plus /> {t("calendar.newEvent")}
                      </Button>
                    }
                  />
                ) : (
                  renderDayList(selected)
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <EventDialog
        event={editing}
        defaultDay={selected}
        open={dialog}
        onOpenChange={setDialog}
        weekStart={weekStart}
      />
      <CalendarsDialog
        open={managing}
        onOpenChange={setManaging}
        demo={!!user?.is_demo}
      />
    </Page>
  );
}
