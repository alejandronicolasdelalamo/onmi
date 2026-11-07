import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  ArchiveRestore,
  CalendarCheck,
  Flame,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNewDialog } from "@/lib/use-new-dialog";
import { toast } from "sonner";
import { z } from "zod";
import { Heatmap } from "@/components/heatmap";
import { Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from "@/components/ui/card";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/errors";
import {
  useCreateHabit,
  useDeleteHabit,
  useGoals,
  useHabits,
  useHeatmap,
  useToggleHabit,
  useUpdateHabit,
} from "@/lib/queries";
import type { Habit } from "@/lib/types";
import { addDays, cn, localISODate } from "@/lib/utils";

import { QueryError } from "@/components/query-error";
const COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
];

function HabitDialog({
  habit,
  open,
  onOpenChange,
}: {
  habit?: Habit;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const { data: goals = [] } = useGoals();
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("errors.required")),
        description: z.string(),
        category: z.string(),
        color: z.string(),
        goal_id: z.string(),
      }),
    [t],
  );
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      color: COLORS[0]!,
      goal_id: "",
    },
  });

  useEffect(() => {
    if (open)
      form.reset({
        name: habit?.name ?? "",
        description: habit?.description ?? "",
        category: habit?.category ?? "",
        color: habit?.color ?? COLORS[0]!,
        goal_id: habit?.goal_id ? String(habit.goal_id) : "",
      });
  }, [open, habit, form]);

  const color = useWatch({ control: form.control, name: "color" });
  const pending = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit(async (v) => {
    const body = {
      name: v.name,
      description: v.description ?? "",
      category: v.category || null,
      color: v.color,
      goal_id: v.goal_id ? Number(v.goal_id) : null,
    };
    try {
      if (habit) await update.mutateAsync({ id: habit.id, ...body });
      else await create.mutateAsync(body);
      toast.success(t("common.saved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, t));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={habit ? t("habits.edit") : t("habits.new")}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field
            label={t("habits.name")}
            error={form.formState.errors.name?.message}
          >
            {(p) => (
              <Input
                autoFocus
                maxLength={100}
                {...p}
                {...form.register("name")}
              />
            )}
          </Field>
          <Field label={t("habits.category")}>
            {(p) => (
              <Input maxLength={60} {...p} {...form.register("category")} />
            )}
          </Field>
          <Field label={t("habits.description")}>
            {(p) => (
              <Textarea
                rows={2}
                maxLength={500}
                {...p}
                {...form.register("description")}
              />
            )}
          </Field>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("habits.color")}</p>
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label={t("habits.color")}
            >
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => form.setValue("color", c)}
                  className={cn(
                    "size-7 cursor-pointer rounded-full transition-transform hover:scale-110",
                    color === c &&
                      "ring-2 ring-foreground ring-offset-2 ring-offset-card",
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <Field label={`${t("habits.goal")} (${t("common.optional")})`}>
            {(p) => (
              <NativeSelect {...p} {...form.register("goal_id")}>
                <option value="">{t("common.none")}</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LastDays({
  habit,
  onToggle,
}: {
  habit: Habit;
  onToggle: (date: string) => void;
}) {
  const { t } = useTranslation();
  const today = localISODate();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const done = new Set(habit.dates);
  return (
    <div className="flex gap-1.5" role="group" aria-label={t("habits.last14")}>
      {days.map((d) => {
        const on = done.has(d);
        return (
          <button
            key={d}
            onClick={() => onToggle(d)}
            aria-pressed={on}
            aria-label={t("habits.toggleDay", { date: d })}
            title={d}
            className={cn(
              "h-7 pointer-coarse:h-10 flex-1 cursor-pointer rounded-[5px] border border-transparent transition-[color,background-color,border-color,box-shadow,transform,opacity] hover:scale-105",
              !on && "bg-muted hover:border-border",
              d === today && !on && "border-border",
            )}
            style={on ? { background: habit.color } : undefined}
          />
        );
      })}
    </div>
  );
}

function HabitCard({ habit, onEdit }: { habit: Habit; onEdit: () => void }) {
  const { t } = useTranslation();
  const toggle = useToggleHabit();
  const update = useUpdateHabit();
  const del = useDeleteHabit();
  const [confirm, setConfirm] = useState(false);
  const today = localISODate();
  const doneToday = habit.dates.includes(today);

  return (
    <Card className={cn("flex flex-col", habit.archived && "opacity-60")}>
      <CardHeader className="items-start">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: habit.color }}
            />
            <CardTitle className="truncate text-base">{habit.name}</CardTitle>
          </div>
          {habit.category && <Badge>{habit.category}</Badge>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 size-8"
              aria-label={habit.name}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> {t("common.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                update.mutate({ id: habit.id, archived: !habit.archived })
              }
            >
              {habit.archived ? <ArchiveRestore /> : <Archive />}{" "}
              {habit.archived ? t("habits.unarchive") : t("habits.archive")}
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => setConfirm(true)}>
              <Trash2 /> {t("common.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {habit.description && (
          <p className="text-sm text-muted-foreground">{habit.description}</p>
        )}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            {
              label: t("habits.streak"),
              value: habit.current_streak,
              icon: <Flame className="size-3.5 text-warning" />,
            },
            { label: t("habits.best"), value: habit.longest_streak },
            { label: t("habits.total"), value: habit.count },
          ].map((s) => (
            <div key={s.label} className="rounded-md bg-muted/60 px-2 py-2">
              <p className="flex items-center justify-center gap-1 text-lg font-semibold tabular-nums">
                {s.icon}
                {s.value}
              </p>
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
        <LastDays
          habit={habit}
          onToggle={(date) => toggle.mutate({ id: habit.id, date })}
        />
        <Button
          variant={doneToday ? "secondary" : "default"}
          className="mt-auto w-full"
          onClick={() => toggle.mutate({ id: habit.id, date: today })}
          disabled={habit.archived}
        >
          <CalendarCheck />{" "}
          {doneToday ? t("habits.undo") : t("habits.markDone")}
        </Button>
      </CardContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("habits.deleteTitle", { name: habit.name })}
        description={t("habits.deleteDesc")}
        confirmLabel={t("common.delete")}
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(habit.id, { onSuccess: () => setConfirm(false) })
        }
      />
    </Card>
  );
}

export function HabitsPage() {
  const { t } = useTranslation();
  const [showArchived, setShowArchived] = useState(false);
  const {
    data: habits,
    isPending,
    isError,
    error,
    refetch,
  } = useHabits(showArchived);
  const { data: heatmap } = useHeatmap(120);
  const [editing, setEditing] = useState<Habit | undefined>();
  const [dialog, setDialog] = useNewDialog();

  const openNew = () => {
    setEditing(undefined);
    setDialog(true);
  };

  return (
    <Page>
      <PageHeader
        title={t("habits.title")}
        subtitle={t("habits.subtitle")}
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Switch
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              {t("habits.showArchived")}
            </label>
            <Button onClick={openNew}>
              <Plus /> {t("habits.new")}
            </Button>
          </>
        }
      />

      {heatmap && heatmap.total_habits > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <div>
              <CardTitle>{t("habits.heatmap")}</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("habits.heatmapDesc")}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Heatmap series={heatmap.series} />
            <div className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {heatmap.habits.map((h) => (
                <div key={h.id} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="truncate">{h.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {Math.round(h.rate_30d * 100)}%
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    title={t("habits.completion")}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${h.rate_30d * 100}%`,
                        background: h.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : habits && habits.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {habits.map((h) => (
            <HabitCard
              key={h.id}
              habit={h}
              onEdit={() => {
                setEditing(h);
                setDialog(true);
              }}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<CalendarCheck />}
            title={t("habits.empty")}
            description={t("habits.emptyDesc")}
            action={
              <Button onClick={openNew}>
                <Plus /> {t("habits.new")}
              </Button>
            }
          />
        </Card>
      )}

      <HabitDialog habit={editing} open={dialog} onOpenChange={setDialog} />
    </Page>
  );
}
