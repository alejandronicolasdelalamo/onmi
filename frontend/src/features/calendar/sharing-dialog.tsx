import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/errors";
import { useCalendarSharing, useSetCalendarSharing } from "@/lib/queries";
import type { CalendarSharing } from "@/lib/types";

function SharingForm({
  data,
  disabled,
  onClose,
}: {
  data?: CalendarSharing;
  disabled: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useSetCalendarSharing();
  // Cada apertura monta este formulario de cero: el estado inicial es lo que ya estaba compartido.
  const [chosen, setChosen] = useState<Set<number>>(
    () =>
      new Set(
        (data?.buddies ?? []).filter((b) => b.shared).map((b) => b.user.id),
      ),
  );

  const toggle = (id: number) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onSave = async () => {
    try {
      await save.mutateAsync([...chosen]);
      toast.success(t("calendar.sharingSaved"));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, t));
    }
  };

  const buddies = data?.buddies ?? [];
  return (
    <>
      {disabled ? (
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
        <ul className="divide-y divide-border">
          {buddies.map(({ user }) => (
            <li key={user.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={user.name} />
              <label
                htmlFor={`share-${user.id}`}
                className="min-w-0 flex-1 cursor-pointer truncate text-sm font-medium"
              >
                {user.name}
              </label>
              <Switch
                id={`share-${user.id}`}
                checked={chosen.has(user.id)}
                onCheckedChange={() => toggle(user.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {t("calendar.sharingPrivacy")}
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={() => void onSave()}
          disabled={disabled || buddies.length === 0 || save.isPending}
        >
          {t("common.save")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Elige con qué compañeros se comparte el calendario (solo se ven los eventos marcados como compartidos). */
export function SharingDialog({
  open,
  onOpenChange,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { data } = useCalendarSharing();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("calendar.sharingTitle")}
        description={t("calendar.sharingDesc")}
      >
        <SharingForm
          // Al llegar los datos se remonta para partir de lo ya compartido.
          key={data ? "ready" : "loading"}
          data={data}
          disabled={disabled}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
