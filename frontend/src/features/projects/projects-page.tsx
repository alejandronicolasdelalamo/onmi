import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  FolderKanban,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNewDialog } from "@/lib/use-new-dialog";
import { toast } from "sonner";
import { z } from "zod";
import { Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/card";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { errorMessage } from "@/lib/errors";
import {
  useCreateGoal,
  useCreateProject,
  useDeleteGoal,
  useDeleteProject,
  useGoals,
  useMoveProject,
  useProjects,
  useUpdateGoal,
  useUpdateProject,
} from "@/lib/queries";
import type { Priority, Project, ProjectStatus } from "@/lib/types";
import { cn, localISODate } from "@/lib/utils";

import { QueryError } from "@/components/query-error";
import { formatDate } from "@/lib/format";
const COLUMNS: ProjectStatus[] = ["todo", "in_progress", "done"];
const PRIORITY_TONE: Record<Priority, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

function ProjectCardBody({
  project,
  dragging,
}: {
  project: Project;
  dragging?: boolean;
}) {
  const { t } = useTranslation();
  const overdue =
    !!project.due_date &&
    project.status !== "done" &&
    project.due_date < localISODate();
  return (
    <div
      className={cn(
        "space-y-2.5 rounded-lg border border-border bg-card p-3.5 shadow-xs",
        dragging && "rotate-1 shadow-xl ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-snug">{project.name}</h4>
        <Badge tone={PRIORITY_TONE[project.priority]}>
          {t(`projects.priorities.${project.priority}`)}
        </Badge>
      </div>
      {project.category && (
        <p className="text-xs text-muted-foreground">{project.category}</p>
      )}
      {project.goals_total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>
              {t("projects.goalsCount", {
                done: project.goals_done,
                total: project.goals_total,
              })}
            </span>
            <span className="tabular-nums">{project.progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[color,background-color,border-color,box-shadow,transform,opacity]"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
      )}
      {project.due_date && (
        <p
          className={cn(
            "flex items-center gap-1 text-xs",
            overdue ? "font-medium text-destructive" : "text-muted-foreground",
          )}
        >
          <CalendarDays className="size-3.5" />
          {formatDate(project.due_date)}
          {overdue && <span> · {t("projects.overdue")}</span>}
        </p>
      )}
    </div>
  );
}

function SortableCard({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative touch-manipulation",
        isDragging && "opacity-30",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`${project.name} – drag`}
        className="absolute right-1 top-9 z-10 cursor-grab rounded p-1 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) =>
          (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())
        }
        className="cursor-pointer text-left"
      >
        <ProjectCardBody project={project} />
      </div>
    </div>
  );
}

function Column({
  status,
  projects,
  onOpen,
}: {
  status: ProjectStatus;
  projects: Project[];
  onOpen: (p: Project) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <section
      aria-label={t(`projects.columns.${status}`)}
      className="flex min-h-48 flex-col rounded-xl bg-muted/50 p-2.5"
    >
      <header className="mb-2 flex items-center justify-between px-1.5 pt-0.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span
            className={cn(
              "size-2 rounded-full",
              status === "todo"
                ? "bg-muted-foreground"
                : status === "in_progress"
                  ? "bg-warning"
                  : "bg-success",
            )}
          />
          {t(`projects.columns.${status}`)}
        </h3>
        <span className="rounded-full bg-card px-2 text-xs tabular-nums text-muted-foreground">
          {projects.length}
        </span>
      </header>
      <SortableContext
        items={projects.map((p) => p.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={cn(
            "flex flex-1 flex-col gap-2 rounded-lg p-0.5 transition-colors",
            isOver && "bg-accent/60",
          )}
        >
          {projects.map((p) => (
            <SortableCard key={p.id} project={p} onOpen={() => onOpen(p)} />
          ))}
          {projects.length === 0 && (
            <p className="grid flex-1 place-items-center rounded-lg border border-dashed border-border py-8 text-xs text-muted-foreground">
              {t("projects.emptyColumn")}
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function ProjectGoals({ project }: { project: Project }) {
  const { t } = useTranslation();
  const { data: goals = [] } = useGoals();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const del = useDeleteGoal();
  const [title, setTitle] = useState("");
  const mine = goals.filter((g) => g.project_id === project.id);

  const add = () => {
    const v = title.trim();
    if (!v) return;
    create.mutate(
      { title: v, project_id: project.id },
      { onSuccess: () => setTitle("") },
    );
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("projects.goals")}</p>
      {mine.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("projects.noGoals")}</p>
      )}
      <ul className="space-y-1">
        {mine.map((g) => (
          <li
            key={g.id}
            className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted"
          >
            <input
              type="checkbox"
              checked={g.done}
              onChange={() => update.mutate({ id: g.id, done: !g.done })}
              aria-label={g.title}
              className="size-4 cursor-pointer accent-[var(--primary)]"
            />
            <span
              className={cn(
                "flex-1 text-sm",
                g.done && "text-muted-foreground line-through",
              )}
            >
              {g.title}
            </span>
            <button
              onClick={() => del.mutate(g.id)}
              aria-label={t("common.delete")}
              className="cursor-pointer rounded p-1 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={t("projects.addGoal")}
          aria-label={t("projects.addGoal")}
          maxLength={200}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={add}
          aria-label={t("common.add")}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function ProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project?: Project;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateProject();
  const update = useUpdateProject();
  const del = useDeleteProject();
  const [confirm, setConfirm] = useState(false);
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("errors.required")),
        description: z.string(),
        category: z.string(),
        status: z.string(),
        priority: z.string(),
        due_date: z.string(),
      }),
    [t],
  );
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      status: "todo",
      priority: "medium",
      due_date: "",
    },
  });

  useEffect(() => {
    if (open)
      form.reset({
        name: project?.name ?? "",
        description: project?.description ?? "",
        category: project?.category ?? "",
        status: project?.status ?? "todo",
        priority: project?.priority ?? "medium",
        due_date: project?.due_date ?? "",
      });
  }, [open, project, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    const body = {
      name: v.name,
      description: v.description ?? "",
      category: v.category || null,
      priority: v.priority as Priority,
      due_date: v.due_date || null,
    };
    try {
      if (project) {
        await update.mutateAsync({
          id: project.id,
          ...body,
          ...(v.status !== project.status
            ? { status: v.status as ProjectStatus }
            : {}),
        });
      } else {
        await create.mutateAsync({
          ...body,
          status: v.status as ProjectStatus,
        });
      }
      toast.success(t("common.saved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, t));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        wide
        title={project ? t("projects.edit") : t("projects.new")}
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field
            label={t("projects.name")}
            error={form.formState.errors.name?.message}
          >
            {(p) => (
              <Input
                autoFocus
                maxLength={120}
                {...p}
                {...form.register("name")}
              />
            )}
          </Field>
          <Field label={t("projects.description")}>
            {(p) => (
              <Textarea
                rows={3}
                maxLength={5000}
                {...p}
                {...form.register("description")}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("projects.category")}>
              {(p) => (
                <Input maxLength={60} {...p} {...form.register("category")} />
              )}
            </Field>
            <Field label={t("projects.due")}>
              {(p) => (
                <Input type="date" {...p} {...form.register("due_date")} />
              )}
            </Field>
            <Field label={t("projects.status")}>
              {(p) => (
                <NativeSelect {...p} {...form.register("status")}>
                  {COLUMNS.map((s) => (
                    <option key={s} value={s}>
                      {t(`projects.columns.${s}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={t("projects.priority")}>
              {(p) => (
                <NativeSelect {...p} {...form.register("priority")}>
                  {(["low", "medium", "high"] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`projects.priorities.${s}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          {project && <ProjectGoals project={project} />}
          <DialogFooter className="sm:justify-between">
            {project ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setConfirm(true)}
              >
                <Trash2 /> {t("common.delete")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={create.isPending || update.isPending}
              >
                {t("common.save")}
              </Button>
            </div>
          </DialogFooter>
        </form>
        {project && (
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={t("projects.deleteTitle", { name: project.name })}
            description={t("projects.deleteDesc")}
            confirmLabel={t("common.delete")}
            pending={del.isPending}
            onConfirm={() =>
              del.mutate(project.id, {
                onSuccess: () => {
                  setConfirm(false);
                  onOpenChange(false);
                  toast.success(t("common.deleted"));
                },
              })
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsPage() {
  const { t } = useTranslation();
  const { data: projects, isPending, isError, error, refetch } = useProjects();
  const move = useMoveProject();
  const [active, setActive] = useState<Project | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialog, setDialog] = useNewDialog();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const columns = useMemo(
    () =>
      Object.fromEntries(
        COLUMNS.map((s) => [
          s,
          (projects ?? [])
            .filter((p) => p.status === s)
            .sort((a, b) => a.position - b.position),
        ]),
      ) as Record<ProjectStatus, Project[]>,
    [projects],
  );
  // El diálogo lee siempre el proyecto actual de la caché (así el progreso se actualiza al marcar metas).
  const editing = projects?.find((p) => p.id === editingId);

  const onDragStart = (e: DragStartEvent) =>
    setActive(projects?.find((p) => p.id === e.active.id) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const { active: a, over } = e;
    if (!over || !projects) return;
    const moving = projects.find((p) => p.id === a.id);
    if (!moving) return;

    let status: ProjectStatus;
    let position: number;
    if (String(over.id).startsWith("col:")) {
      status = String(over.id).slice(4) as ProjectStatus;
      position = columns[status].filter((p) => p.id !== moving.id).length;
    } else {
      const target = projects.find((p) => p.id === over.id);
      if (!target || target.id === moving.id) return;
      status = target.status;
      position = columns[status].findIndex((p) => p.id === target.id);
    }
    if (
      status === moving.status &&
      position === columns[status].findIndex((p) => p.id === moving.id)
    )
      return;
    move.mutate({ id: moving.id, status, position });
  };

  const openNew = () => {
    setEditingId(null);
    setDialog(true);
  };

  return (
    <Page>
      <PageHeader
        title={t("projects.title")}
        subtitle={t("projects.subtitle")}
        actions={
          <Button onClick={openNew}>
            <Plus /> {t("projects.new")}
          </Button>
        }
      />

      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActive(null)}
        >
          <div className="grid items-start gap-4 md:grid-cols-3">
            {COLUMNS.map((s) => (
              <Column
                key={s}
                status={s}
                projects={columns[s]}
                onOpen={(p) => {
                  setEditingId(p.id);
                  setDialog(true);
                }}
              />
            ))}
          </div>
          <DragOverlay>
            {active ? <ProjectCardBody project={active} dragging /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <Card>
          <EmptyState
            icon={<FolderKanban />}
            title={t("projects.empty")}
            description={t("projects.emptyDesc")}
            action={
              <Button onClick={openNew}>
                <Plus /> {t("projects.new")}
              </Button>
            }
          />
        </Card>
      )}

      <ProjectDialog project={editing} open={dialog} onOpenChange={setDialog} />
    </Page>
  );
}
