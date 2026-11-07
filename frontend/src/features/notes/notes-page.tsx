import * as TabsPrimitive from "@radix-ui/react-tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  NotebookPen,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { useForm, useWatch } from "react-hook-form";
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
  useCreateNote,
  useDeleteNote,
  useGoals,
  useNotes,
  useProjects,
  useTags,
  useUpdateNote,
} from "@/lib/queries";
import type { Note } from "@/lib/types";
import { cn } from "@/lib/utils";

import { QueryError } from "@/components/query-error";
const Markdown = lazy(() => import("./markdown"));

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function TagInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim().toLowerCase().replace(/^#/, "");
    if (tag && !value.includes(tag) && value.length < 10)
      onChange([...value, tag]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && value.length)
      onChange(value.slice(0, -1));
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 focus-within:outline-2 focus-within:outline-ring">
      {value.map((tag) => (
        <Badge key={tag} tone="primary" className="gap-1 pr-1">
          #{tag}
          <button
            type="button"
            aria-label={`remove ${tag}`}
            className="cursor-pointer rounded-full hover:bg-black/10"
            onClick={() => onChange(value.filter((t) => t !== tag))}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        maxLength={30}
        placeholder={value.length ? "" : placeholder}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

function NoteForm({
  note,
  onOpenChange,
}: {
  note?: Note;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateNote();
  const update = useUpdateNote();
  const del = useDeleteNote();
  const { data: projects = [] } = useProjects();
  const { data: goals = [] } = useGoals();
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [confirm, setConfirm] = useState(false);
  const schema = useMemo(
    () =>
      z.object({
        title: z.string().trim().min(1, t("errors.required")),
        content: z.string(),
        project_id: z.string(),
        goal_id: z.string(),
      }),
    [t],
  );
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: note?.title ?? "",
      content: note?.content ?? "",
      project_id: note?.project_id ? String(note.project_id) : "",
      goal_id: note?.goal_id ? String(note.goal_id) : "",
    },
  });

  const content = useWatch({ control: form.control, name: "content" });
  const pending = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit(async (v) => {
    const body = {
      title: v.title,
      content: v.content ?? "",
      tags,
      pinned,
      project_id: v.project_id ? Number(v.project_id) : null,
      goal_id: v.goal_id ? Number(v.goal_id) : null,
    };
    try {
      if (note) await update.mutateAsync({ id: note.id, ...body });
      else await create.mutateAsync(body);
      toast.success(t("common.saved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e, t));
    }
  });

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="flex items-end gap-2">
          <Field
            className="flex-1"
            label={t("notes.titleLabel")}
            error={form.formState.errors.title?.message}
          >
            {(p) => (
              <Input
                autoFocus
                maxLength={150}
                {...p}
                {...form.register("title")}
              />
            )}
          </Field>
          <Button
            type="button"
            variant={pinned ? "default" : "outline"}
            size="icon"
            onClick={() => setPinned((p) => !p)}
            aria-pressed={pinned}
            aria-label={pinned ? t("notes.unpin") : t("notes.pin")}
            title={pinned ? t("notes.unpin") : t("notes.pin")}
          >
            {pinned ? <Pin /> : <PinOff />}
          </Button>
        </div>

        <TabsPrimitive.Root defaultValue="write">
          <TabsPrimitive.List className="mb-2 inline-flex rounded-md bg-muted p-0.5 text-sm">
            {(["write", "preview"] as const).map((tab) => (
              <TabsPrimitive.Trigger
                key={tab}
                value={tab}
                className="cursor-pointer rounded-[5px] px-3 py-1 font-medium text-muted-foreground transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
              >
                {t(`notes.${tab}`)}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
          <TabsPrimitive.Content value="write">
            <Textarea
              aria-label={t("notes.content")}
              rows={10}
              maxLength={20000}
              placeholder={t("notes.contentPlaceholder")}
              className="font-mono text-[13px] leading-relaxed"
              {...form.register("content")}
            />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="preview">
            <div className="prose prose-sm dark:prose-invert min-h-[15rem] max-w-none rounded-md border border-border bg-card p-4">
              {content?.trim() ? (
                <Suspense fallback={<Skeleton className="h-24" />}>
                  <Markdown>{content}</Markdown>
                </Suspense>
              ) : (
                <p className="text-muted-foreground">
                  {t("notes.nothingToPreview")}
                </p>
              )}
            </div>
          </TabsPrimitive.Content>
        </TabsPrimitive.Root>

        <Field label={t("notes.tags")}>
          {(p) => (
            <TagInput
              id={p.id}
              value={tags}
              onChange={setTags}
              placeholder={t("notes.tagsPlaceholder")}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("notes.project")}>
            {(p) => (
              <NativeSelect {...p} {...form.register("project_id")}>
                <option value="">{t("common.none")}</option>
                {projects.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t("notes.goal")}>
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
        </div>

        <DialogFooter className="sm:justify-between">
          {note ? (
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
            <Button type="submit" disabled={pending}>
              {t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </form>
      {note && (
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={t("notes.deleteTitle", { name: note.title })}
          description={t("notes.deleteDesc")}
          confirmLabel={t("common.delete")}
          pending={del.isPending}
          onConfirm={() =>
            del.mutate(note.id, {
              onSuccess: () => {
                setConfirm(false);
                onOpenChange(false);
                toast.success(t("common.deleted"));
              },
            })
          }
        />
      )}
    </>
  );
}

function NoteDialog({
  note,
  open,
  onOpenChange,
}: {
  note?: Note;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title={note ? t("notes.edit") : t("notes.new")}>
        <NoteForm
          key={note?.id ?? "new"}
          note={note}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function plain(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*`>_~[\]()-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function NotesPage() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const q = useDebounced(search);
  const {
    data: notes,
    isPending,
    isError,
    error,
    refetch,
  } = useNotes({ q, tag });
  const { data: tags = [] } = useTags();
  const update = useUpdateNote();
  const [editing, setEditing] = useState<Note | undefined>();
  const [dialog, setDialog] = useNewDialog();

  const openNew = () => {
    setEditing(undefined);
    setDialog(true);
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      month: "short",
      day: "numeric",
    });

  return (
    <Page>
      <PageHeader
        title={t("notes.title")}
        subtitle={t("notes.subtitle")}
        actions={
          <Button onClick={openNew}>
            <Plus /> {t("notes.new")}
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("notes.searchPlaceholder")}
            aria-label={t("common.search")}
            className="pl-9"
          />
        </div>
        {tags.length > 0 && (
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t("notes.tags")}
          >
            <button
              onClick={() => setTag("")}
              aria-pressed={!tag}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
                !tag
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {t("notes.allTags")}
            </button>
            {tags.map((tg) => (
              <button
                key={tg.tag}
                onClick={() => setTag(tg.tag === tag ? "" : tg.tag)}
                aria-pressed={tag === tg.tag}
                className={cn(
                  "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  tag === tg.tag
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                #{tg.tag} <span className="opacity-60">{tg.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : notes && notes.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <Card
              key={n.id}
              className="group relative flex cursor-pointer flex-col gap-2 p-4 transition-[color,background-color,border-color,box-shadow,transform,opacity] hover:-translate-y-0.5 hover:shadow-md"
              onClick={() => {
                setEditing(n);
                setDialog(true);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-1 font-semibold tracking-tight">
                  {n.title}
                </h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    update.mutate({ id: n.id, pinned: !n.pinned });
                  }}
                  aria-label={n.pinned ? t("notes.unpin") : t("notes.pin")}
                  aria-pressed={n.pinned}
                  className={cn(
                    "-m-1 cursor-pointer rounded-md p-1 transition-colors hover:bg-muted",
                    n.pinned
                      ? "text-primary"
                      : "text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                  )}
                >
                  <Pin className={cn("size-4", n.pinned && "fill-current")} />
                </button>
              </div>
              <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">
                {plain(n.content) || "—"}
              </p>
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex min-w-0 flex-wrap gap-1">
                  {n.tags.slice(0, 3).map((tg) => (
                    <Badge key={tg} tone="primary">
                      #{tg}
                    </Badge>
                  ))}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {fmt(n.updated_at)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<NotebookPen />}
            title={t("notes.empty")}
            description={q || tag ? undefined : t("notes.emptyDesc")}
            action={
              !q && !tag ? (
                <Button onClick={openNew}>
                  <Plus /> {t("notes.new")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      <NoteDialog note={editing} open={dialog} onOpenChange={setDialog} />
    </Page>
  );
}
