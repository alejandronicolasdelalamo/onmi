import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { ShareToggle } from "@/components/ui/share-toggle";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import {
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
  type EventInput,
} from "@/lib/queries";
import type { CalendarEventDef, Repeat } from "@/lib/types";
import { cn } from "@/lib/utils";
import { weekdayIndex, weekdayName, weekdayOrder } from "./calendar-utils";

export const EVENT_COLORS = [
  "#6366f1",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#8b5cf6",
  "#64748b",
];

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

const blank = (day: string): EventInput => ({
  title: "",
  notes: "",
  color: EVENT_COLORS[0]!,
  start_date: day,
  start_time: null,
  duration_min: null,
  repeat: "none",
  weekdays: [weekdayIndex(day)],
  per_week: 3,
  every_weeks: 1,
  until: null,
  shared: false,
});

/** Campos que pueden mostrar un error junto a sí mismos; `form` es un aviso general del formulario. */
type FieldKey = "title" | "start_date" | "weekdays" | "until" | "form";
type FormErrors = Partial<Record<FieldKey, string>>;
const FIELD_KEYS: FieldKey[] = ["title", "start_date", "weekdays", "until"];

function EventForm({
  event,
  defaultDay,
  onOpenChange,
  weekStart,
  canShare,
}: {
  event?: CalendarEventDef;
  defaultDay: string;
  onOpenChange: (open: boolean) => void;
  weekStart: 0 | 6;
  canShare: boolean;
}) {
  const { t, i18n } = useTranslation();
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const del = useDeleteEvent();
  // Cada apertura monta el formulario de cero, así que el estado inicial sale del evento (o de un borrador vacío).
  const base = event ?? blank(defaultDay);
  const [v, setV] = useState<EventInput>(() => ({
    ...base,
    weekdays: base.weekdays.length
      ? base.weekdays
      : [weekdayIndex(base.start_date)],
    per_week: base.per_week ?? 3,
  }));
  const [allDay, setAllDay] = useState(!base.start_time);
  const [errors, setErrors] = useState<FormErrors>({});
  const [confirm, setConfirm] = useState(false);

  const set = <K extends keyof EventInput>(k: K, value: EventInput[K]) => {
    setV((p) => ({ ...p, [k]: value }));
    // Al corregir un campo desaparece su aviso (y el general); cambiar la fecha de inicio revalida la final.
    setErrors((p) =>
      Object.keys(p).length === 0
        ? p
        : {
            ...p,
            [k]: undefined,
            ...(k === "start_date" ? { until: undefined } : {}),
            form: undefined,
          },
    );
  };

  const toggleDay = (d: number) =>
    set(
      "weekdays",
      v.weekdays.includes(d)
        ? v.weekdays.filter((x) => x !== d)
        : [...v.weekdays, d].sort(),
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: FormErrors = {};
    if (!v.title.trim()) next.title = t("errors.required");
    if (!v.start_date) next.start_date = t("errors.required");
    if (v.repeat === "weekdays" && v.weekdays.length === 0)
      next.weekdays = t("calendar.pickDay");
    if (
      v.repeat !== "none" &&
      v.until &&
      v.start_date &&
      v.until < v.start_date
    )
      next.until = t("calendar.untilBeforeStart");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const body: EventInput = {
      ...v,
      title: v.title.trim(),
      start_time: allDay ? null : (v.start_time ?? "09:00"),
      duration_min: allDay ? null : (v.duration_min ?? 60),
      weekdays: v.repeat === "weekdays" ? v.weekdays : [],
      per_week: v.repeat === "weekly_count" ? (v.per_week ?? 3) : null,
      every_weeks: v.repeat === "weekdays" ? v.every_weeks : 1,
      until: v.repeat === "none" ? null : v.until || null,
    };
    try {
      if (event) await update.mutateAsync({ id: event.id, ...body });
      else await create.mutateAsync(body);
      toast.success(t("common.saved"));
      onOpenChange(false);
    } catch (err) {
      // Si el servidor rechaza algo, se muestra el motivo en su campo (o en un aviso general), no solo un toast.
      const server: FormErrors = {};
      if (err instanceof ApiError && err.details?.length) {
        for (const d of err.details) {
          const key = FIELD_KEYS.find((k) => k === d.field);
          if (key) server[key] = d.message;
          else
            server.form = server.form
              ? `${server.form} ${d.message}`
              : d.message;
        }
      }
      setErrors(server);
      toast.error(errorMessage(err, t));
    }
  };

  const REPEATS: Repeat[] = ["none", "daily", "weekdays", "weekly_count"];
  const preset = (days: number[]) => set("weekdays", days);

  return (
    <>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t("calendar.eventTitle")} error={errors.title}>
          {(p) => (
            <Input
              autoFocus={!event}
              maxLength={120}
              value={v.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={t("calendar.titlePlaceholder")}
              {...p}
            />
          )}
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("calendar.color")}</legend>
          <div className="flex flex-wrap gap-2">
            {EVENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("color", c)}
                aria-pressed={v.color === c}
                aria-label={c}
                className={cn(
                  "size-8 rounded-full border-2 border-transparent transition-transform pointer-coarse:size-10",
                  v.color === c && "scale-110 border-foreground",
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("calendar.date")} error={errors.start_date}>
            {(p) => (
              <Input
                type="date"
                value={v.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                required
                {...p}
              />
            )}
          </Field>
          <div className="flex items-end justify-between gap-3 rounded-md border border-border px-3 py-2">
            <label htmlFor="allday" className="text-sm font-medium">
              {t("calendar.allDay")}
            </label>
            <Switch id="allday" checked={allDay} onCheckedChange={setAllDay} />
          </div>
        </div>

        {!allDay && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("calendar.startTime")}>
              {(p) => (
                <Input
                  type="time"
                  value={v.start_time ?? "09:00"}
                  onChange={(e) => set("start_time", e.target.value)}
                  {...p}
                />
              )}
            </Field>
            <Field label={t("calendar.duration")}>
              {(p) => (
                <NativeSelect
                  value={v.duration_min ?? 60}
                  onChange={(e) => set("duration_min", Number(e.target.value))}
                  {...p}
                >
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>
                      {m >= 60 && m % 60 === 0
                        ? t("calendar.hours", { count: m / 60 })
                        : t("calendar.minutes", { count: m })}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
        )}

        <Field label={t("calendar.repeat")}>
          {(p) => (
            <NativeSelect
              value={v.repeat}
              onChange={(e) => set("repeat", e.target.value as Repeat)}
              {...p}
            >
              {REPEATS.map((r) => (
                <option key={r} value={r}>
                  {t(`calendar.repeat_${r}`)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>

        {v.repeat === "weekdays" && (
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">
              {t("calendar.pickDays")}
            </legend>
            <div className="flex justify-between gap-1">
              {weekdayOrder(weekStart).map((d) => {
                const on = v.weekdays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    aria-pressed={on}
                    aria-label={weekdayName(d, i18n.language, "long")}
                    className={cn(
                      "grid size-10 place-items-center rounded-full border text-xs font-semibold transition-colors pointer-coarse:size-11",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {weekdayName(d, i18n.language, "narrow")}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => preset([0, 1, 2, 3, 4])}
              >
                {t("calendar.presetWeekdays")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => preset([5, 6])}
              >
                {t("calendar.presetWeekend")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => preset([0, 1, 2, 3, 4, 5, 6])}
              >
                {t("calendar.presetAll")}
              </Button>
            </div>
            {errors.weekdays && (
              <p role="alert" className="text-xs text-destructive">
                {errors.weekdays}
              </p>
            )}
            <Field label={t("calendar.everyWeeks")}>
              {(p) => (
                <NativeSelect
                  value={v.every_weeks}
                  onChange={(e) => set("every_weeks", Number(e.target.value))}
                  {...p}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {t("calendar.everyNWeeks", { count: n })}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </fieldset>
        )}

        {v.repeat === "weekly_count" && (
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">
              {t("calendar.perWeek")}
            </legend>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set("per_week", n)}
                  aria-pressed={v.per_week === n}
                  aria-label={t("calendar.nPerWeek", { count: n })}
                  className={cn(
                    "grid size-10 place-items-center rounded-full border text-sm font-semibold transition-colors pointer-coarse:size-11",
                    v.per_week === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("calendar.perWeekHint", { count: v.per_week ?? 3 })}
            </p>
          </fieldset>
        )}

        {v.repeat !== "none" && (
          <Field
            label={t("calendar.until")}
            hint={t("calendar.untilHint")}
            error={errors.until}
          >
            {(p) => (
              <Input
                type="date"
                min={v.start_date}
                value={v.until ?? ""}
                onChange={(e) => set("until", e.target.value || null)}
                {...p}
              />
            )}
          </Field>
        )}

        <Field label={t("calendar.notes")}>
          {(p) => (
            <Textarea
              rows={2}
              maxLength={1000}
              value={v.notes}
              onChange={(e) => set("notes", e.target.value)}
              {...p}
            />
          )}
        </Field>

        <ShareToggle
          checked={v.shared}
          onChange={(value) => set("shared", value)}
          label={t("calendar.shareEvent")}
          hint={
            canShare ? t("calendar.shareEventHint") : t("calendar.shareDemo")
          }
          disabled={!canShare}
        />

        {errors.form && (
          <p role="alert" className="text-sm text-destructive">
            {errors.form}
          </p>
        )}

        <DialogFooter>
          {event && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive sm:mr-auto"
              onClick={() => setConfirm(true)}
            >
              {t("common.delete")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={create.isPending || update.isPending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </form>
      {event && (
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={t("calendar.deleteTitle", { name: event.title })}
          description={t("calendar.deleteDesc")}
          confirmLabel={t("common.delete")}
          pending={del.isPending}
          onConfirm={() =>
            del.mutate(event.id, {
              onSuccess: () => {
                setConfirm(false);
                onOpenChange(false);
              },
            })
          }
        />
      )}
    </>
  );
}

export function EventDialog({
  event,
  defaultDay,
  open,
  onOpenChange,
  weekStart,
  canShare,
}: {
  event?: CalendarEventDef;
  defaultDay: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: 0 | 6;
  canShare: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={event ? t("calendar.editEvent") : t("calendar.newEvent")}
      >
        <EventForm
          event={event}
          defaultDay={defaultDay}
          onOpenChange={onOpenChange}
          weekStart={weekStart}
          canShare={canShare}
        />
      </DialogContent>
    </Dialog>
  );
}
