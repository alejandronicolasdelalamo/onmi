import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  Lock,
  Pencil,
  Plus,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNewDialog } from "@/lib/use-new-dialog";
import { toast } from "sonner";
import { z } from "zod";
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
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { ShareToggle } from "@/components/ui/share-toggle";
import { errorMessage } from "@/lib/errors";
import {
  useCreateGoal,
  useDeleteGoal,
  useGoals,
  useProjects,
  useUpdateGoal,
} from "@/lib/queries";
import type { Goal } from "@/lib/types";
import { cn, localISODate } from "@/lib/utils";

import { QueryError } from "@/components/query-error";
import { formatDate } from "@/lib/format";
function GoalDialog({
  goal,
  open,
  onOpenChange,
}: {
  goal?: Goal;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const { data: projects = [] } = useProjects();
  const schema = useMemo(
    () =>
      z.object({
        title: z.string().trim().min(1, t("errors.required")),
        description: z.string(),
        due_date: z.string(),
        project_id: z.string(),
        shared: z.boolean(),
      }),
    [t],
  );
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      due_date: "",
      project_id: "",
      shared: false,
    },
  });

  const shared = useWatch({ control: form.control, name: "shared" });

  useEffect(() => {
    if (open)
      form.reset({
        title: goal?.title ?? "",
        description: goal?.description ?? "",
        due_date: goal?.due_date ?? "",
        project_id: goal?.project_id ? String(goal.project_id) : "",
        shared: goal?.shared ?? false,
      });
  }, [open, goal, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    const body = {
      title: v.title,
      description: v.description ?? "",
      due_date: v.due_date || null,
      project_id: v.project_id ? Number(v.project_id) : null,
      shared: v.shared,
    };
    try {
      if (goal) await update.mutateAsync({ id: goal.id, ...body });
      else await create.mutateAsync(body);
      toast.success(t("common.saved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, t));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={goal ? t("goals.edit") : t("goals.new")}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field
            label={t("goals.goalTitle")}
            error={form.formState.errors.title?.message}
          >
            {(p) => (
              <Input
                autoFocus
                maxLength={200}
                {...p}
                {...form.register("title")}
              />
            )}
          </Field>
          <Field label={t("goals.description")}>
            {(p) => (
              <Textarea
                rows={3}
                maxLength={2000}
                {...p}
                {...form.register("description")}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("goals.due")}>
              {(p) => (
                <Input type="date" {...p} {...form.register("due_date")} />
              )}
            </Field>
            <Field label={t("goals.project")}>
              {(p) => (
                <NativeSelect {...p} {...form.register("project_id")}>
                  <option value="">{t("goals.noProject")}</option>
                  {projects.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <ShareToggle
            checked={shared}
            onChange={(v) => form.setValue("shared", v)}
            label={t("goals.share")}
            hint={t("goals.shareHint")}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || update.isPending}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GoalRow({
  goal,
  project,
  onEdit,
}: {
  goal: Goal;
  project?: string;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateGoal();
  const del = useDeleteGoal();
  const [confirm, setConfirm] = useState(false);
  const overdue =
    !goal.done && !!goal.due_date && goal.due_date < localISODate();
  return (
    <li className="group flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/60">
      <input
        type="checkbox"
        checked={goal.done}
        onChange={() => update.mutate({ id: goal.id, done: !goal.done })}
        aria-label={`${t("goals.markDone")}: ${goal.title}`}
        className="mt-0.5 size-4 cursor-pointer accent-[var(--primary)]"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "text-sm font-medium",
            goal.done && "text-muted-foreground line-through",
          )}
        >
          {goal.title}
        </p>
        {goal.description && (
          <p className="text-xs text-muted-foreground">{goal.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {project && <Badge tone="primary">{project}</Badge>}
          <Badge tone={goal.shared ? "success" : "neutral"}>
            {goal.shared ? (
              <Users className="size-3" aria-hidden />
            ) : (
              <Lock className="size-3" aria-hidden />
            )}
            {goal.shared ? t("goals.sharedBadge") : t("goals.privateBadge")}
          </Badge>
          {goal.due_date && (
            <span
              className={cn(
                "flex items-center gap-1 text-xs",
                overdue
                  ? "font-medium text-destructive"
                  : "text-muted-foreground",
              )}
            >
              <CalendarDays className="size-3.5" /> {formatDate(goal.due_date)}
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onEdit}
          aria-label={t("common.edit")}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive"
          onClick={() => setConfirm(true)}
          aria-label={t("common.delete")}
        >
          <Trash2 />
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("goals.deleteTitle", { name: goal.title })}
        description={t("goals.deleteDesc")}
        confirmLabel={t("common.delete")}
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(goal.id, { onSuccess: () => setConfirm(false) })
        }
      />
    </li>
  );
}

export function GoalsPage() {
  const { t } = useTranslation();
  const { data: goals, isPending, isError, error, refetch } = useGoals();
  const { data: projects = [] } = useProjects();
  const [editing, setEditing] = useState<Goal | undefined>();
  const [dialog, setDialog] = useNewDialog();

  const projectName = (id: number | null) =>
    projects.find((p) => p.id === id)?.name;
  const pending = goals?.filter((g) => !g.done) ?? [];
  const done = goals?.filter((g) => g.done) ?? [];
  const openNew = () => {
    setEditing(undefined);
    setDialog(true);
  };

  return (
    <Page>
      <PageHeader
        title={t("goals.title")}
        subtitle={t("goals.subtitle")}
        actions={
          <Button onClick={openNew}>
            <Plus /> {t("goals.new")}
          </Button>
        }
      />
      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : goals && goals.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[
            { key: "pending", items: pending },
            { key: "completed", items: done },
          ].map((section) => (
            <Card key={section.key}>
              <CardHeader>
                <CardTitle>{t(`goals.${section.key}`)}</CardTitle>
                <Badge>{section.items.length}</Badge>
              </CardHeader>
              <CardContent>
                <ul className="-mx-2 space-y-0.5">
                  {section.items.map((g) => (
                    <GoalRow
                      key={g.id}
                      goal={g}
                      project={projectName(g.project_id)}
                      onEdit={() => {
                        setEditing(g);
                        setDialog(true);
                      }}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Target />}
            title={t("goals.empty")}
            description={t("goals.emptyDesc")}
            action={
              <Button onClick={openNew}>
                <Plus /> {t("goals.new")}
              </Button>
            }
          />
        </Card>
      )}
      <GoalDialog goal={editing} open={dialog} onOpenChange={setDialog} />
    </Page>
  );
}
