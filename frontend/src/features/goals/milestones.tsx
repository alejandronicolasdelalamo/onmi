import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { errorMessage } from "@/lib/errors";
import {
  useAddMilestone,
  useDeleteMilestone,
  useGoals,
  useUpdateMilestone,
} from "@/lib/queries";

/** Hitos de una meta (lista de pasos con casillas) y lo que la alimenta: hábitos y notas vinculados. */
export function MilestonesSection({ goalId }: { goalId: number }) {
  const { t } = useTranslation();
  const { data: goals = [] } = useGoals();
  const goal = goals.find((g) => g.id === goalId);
  const add = useAddMilestone();
  const update = useUpdateMilestone();
  const del = useDeleteMilestone();
  const [title, setTitle] = useState("");
  if (!goal) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // vive dentro del formulario de la meta
    const text = title.trim();
    if (!text) return;
    add.mutate(
      { goalId, title: text },
      {
        onSuccess: () => setTitle(""),
        onError: (err) => toast.error(errorMessage(err, t)),
      },
    );
  };
  const total = goal.milestones.length;

  return (
    <section
      aria-label={t("goals.milestones")}
      className="space-y-3 rounded-lg border border-border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("goals.milestones")}</h3>
        {total > 0 && (
          <Badge tone={goal.milestones_done === total ? "success" : "neutral"}>
            {goal.milestones_done}/{total}
          </Badge>
        )}
      </div>
      {total > 0 && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={goal.milestones_done}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${(goal.milestones_done / total) * 100}%` }}
          />
        </div>
      )}
      <ul className="space-y-1">
        {goal.milestones.map((m) => (
          <li key={m.id} className="group flex items-center gap-2">
            <input
              type="checkbox"
              checked={m.done}
              onChange={() => update.mutate({ id: m.id, done: !m.done })}
              aria-label={m.title}
              className="size-4 cursor-pointer accent-[var(--primary)]"
            />
            <span
              className={
                m.done
                  ? "flex-1 text-sm text-muted-foreground line-through"
                  : "flex-1 text-sm"
              }
            >
              {m.title}
            </span>
            <button
              type="button"
              onClick={() => del.mutate(m.id)}
              aria-label={`${t("common.delete")}: ${m.title}`}
              className="cursor-pointer rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(e);
          }}
          placeholder={t("goals.milestonePlaceholder")}
          aria-label={t("goals.milestonePlaceholder")}
          maxLength={160}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={submit}
          disabled={add.isPending || !title.trim()}
          aria-label={t("goals.addMilestone")}
        >
          <Plus />
        </Button>
      </div>
      {(goal.linked.habits.length > 0 || goal.linked.notes.length > 0) && (
        <div className="space-y-1.5 border-t border-border pt-3 text-xs">
          <p className="font-medium text-muted-foreground">
            {t("goals.fedBy")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {goal.linked.habits.map((h) => (
              <Link
                key={`h${h.id}`}
                to="/habits"
                className="rounded-full bg-success/15 px-2.5 py-1 font-medium text-success-text hover:opacity-80"
              >
                {h.name}
              </Link>
            ))}
            {goal.linked.notes.map((n) => (
              <Link
                key={`n${n.id}`}
                to={`/notes?open=${n.id}`}
                className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary hover:opacity-80"
              >
                {n.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
