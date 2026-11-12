import { Lock, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/errors";
import {
  useCalendars,
  useCreateCalendar,
  useDeleteCalendar,
  useUpdateCalendar,
} from "@/lib/queries";
import type { BuddyUser, CalendarInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EVENT_COLORS } from "./event-dialog";

/** Nombre a mostrar: el calendario Personal se traduce; los demás llevan el nombre que les pusiste. */
export const calendarLabel = (
  c: Pick<CalendarInfo, "name" | "is_default">,
  t: (k: string) => string,
) => (c.is_default ? t("calendar.personal") : c.name);

function CalendarForm({
  calendar,
  buddies,
  demo,
  onClose,
}: {
  calendar: CalendarInfo | null;
  buddies: BuddyUser[];
  demo: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateCalendar();
  const update = useUpdateCalendar();
  const [name, setName] = useState(calendar?.name ?? "");
  const [color, setColor] = useState(calendar?.color ?? EVENT_COLORS[6]!);
  const [chosen, setChosen] = useState<Set<number>>(
    () => new Set(calendar?.viewers.map((v) => v.id) ?? []),
  );
  const [error, setError] = useState<string>();

  const toggle = (id: number) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!name.trim()) return setError(t("errors.required"));
    const body = { name: name.trim(), color, user_ids: [...chosen] };
    try {
      if (calendar) await update.mutateAsync({ id: calendar.id, ...body });
      else await create.mutateAsync(body);
      toast.success(t("calendar.calendarSaved"));
      onClose();
    } catch (err) {
      setError(errorMessage(err, t));
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      <Field label={t("calendar.calendarName")} error={error}>
        {(p) => (
          <Input
            {...p}
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
              setError(undefined);
            }}
            placeholder={t("calendar.calendarNamePlaceholder")}
          />
        )}
      </Field>
      <div className="space-y-1.5">
        <p className="text-sm font-medium" id="cal-color">
          {t("calendar.color")}
        </p>
        <div
          role="radiogroup"
          aria-labelledby="cal-color"
          className="flex flex-wrap gap-2"
        >
          {EVENT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              onClick={() => setColor(c)}
              className={cn(
                "size-7 cursor-pointer rounded-full transition-transform active:scale-90 pointer-coarse:size-9",
                color === c &&
                  "ring-2 ring-foreground ring-offset-2 ring-offset-card",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("calendar.shareWith")}</p>
        {demo ? (
          <p className="text-sm text-muted-foreground">
            {t("calendar.shareDemo")}
          </p>
        ) : buddies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("calendar.noBuddies")}{" "}
            <Link to="/buddies" className="font-medium text-primary underline">
              {t("nav.buddies")}
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border px-3">
            {buddies.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={u.name} />
                <label
                  htmlFor={`viewer-${u.id}`}
                  className="min-w-0 flex-1 cursor-pointer truncate text-sm font-medium"
                >
                  {u.name}
                </label>
                <Switch
                  id={`viewer-${u.id}`}
                  checked={chosen.has(u.id)}
                  onCheckedChange={() => toggle(u.id)}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {chosen.size === 0
            ? t("calendar.sharedWithNobody")
            : t("calendar.sharedWithN", { count: chosen.size })}
          {" · "}
          {t("calendar.sharingPrivacy")}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={create.isPending || update.isPending}>
          {t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Gestiona tus calendarios: el Personal (privado) y los que compartes con una o varias personas. */
export function CalendarsDialog({
  open,
  onOpenChange,
  demo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  demo: boolean;
}) {
  const { t } = useTranslation();
  const { data } = useCalendars();
  const del = useDeleteCalendar();
  const [editing, setEditing] = useState<CalendarInfo | "new" | null>(null);
  const [removing, setRemoving] = useState<CalendarInfo | null>(null);

  const close = (o: boolean) => {
    if (!o) setEditing(null);
    onOpenChange(o);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          title={
            editing === null
              ? t("calendar.calendarsTitle")
              : editing === "new"
                ? t("calendar.newCalendar")
                : t("calendar.editCalendar")
          }
          description={t("calendar.calendarsDesc")}
        >
          {editing !== null ? (
            <CalendarForm
              key={editing === "new" ? "new" : editing.id}
              calendar={editing === "new" ? null : editing}
              buddies={data?.buddies ?? []}
              demo={demo}
              onClose={() => setEditing(null)}
            />
          ) : (
            <div className="space-y-4">
              <ul className="divide-y divide-border rounded-lg border border-border">
                {(data?.mine ?? []).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <span
                      aria-hidden
                      className="size-3.5 shrink-0 rounded-full"
                      style={{ background: c.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {calendarLabel(c, t)}
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {c.viewers.length === 0 ? (
                          <>
                            <Lock className="size-3" aria-hidden />
                            {t("calendar.private")}
                          </>
                        ) : (
                          <>
                            <Users className="size-3" aria-hidden />
                            {c.viewers.map((v) => v.name).join(", ")}
                          </>
                        )}
                        {" · "}
                        {t("calendar.eventCount", { count: c.events })}
                      </p>
                    </div>
                    {!c.is_default && (
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 pointer-coarse:size-10"
                          aria-label={`${t("common.edit")}: ${c.name}`}
                          onClick={() => setEditing(c)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive pointer-coarse:size-10"
                          aria-label={`${t("common.delete")}: ${c.name}`}
                          onClick={() => setRemoving(c)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                {t("calendar.personalNote")}
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => close(false)}>
                  {t("common.close")}
                </Button>
                <Button onClick={() => setEditing("new")}>
                  <Plus /> {t("calendar.newCalendar")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("calendar.deleteCalendarTitle", { name: removing?.name })}
        description={t("calendar.deleteCalendarDesc")}
        confirmLabel={t("common.delete")}
        pending={del.isPending}
        onConfirm={() =>
          removing &&
          del.mutate(removing.id, {
            onSuccess: () => {
              setRemoving(null);
              toast.success(t("common.deleted"));
            },
            onError: (e) => toast.error(errorMessage(e, t)),
          })
        }
      />
    </>
  );
}
