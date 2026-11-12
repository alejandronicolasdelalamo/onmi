import * as TabsPrimitive from "@radix-ui/react-tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ImagePlus,
  KeyRound,
  Link2,
  Lock,
  LockOpen,
  NotebookPen,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
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
import { api, ApiError, postBinary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { prepareImage } from "@/lib/image";
import { enqueueNote } from "@/lib/outbox";
import { firstImageId, tagHue } from "@/lib/tag-color";
import {
  clearOneNote,
  holdAutoLock,
  lockNotes,
  useLockPrefs,
  useNotesUnlocked,
} from "@/lib/notes-lock";
import {
  useCreateNote,
  useDeleteNote,
  useEmptyTrash,
  useGoals,
  useNoteLinks,
  useNotes,
  useProjects,
  useRestoreNote,
  useTags,
  useUpdateNote,
} from "@/lib/queries";
import type { Note } from "@/lib/types";
import { cn } from "@/lib/utils";

import { QueryError } from "@/components/query-error";
import { NoteThumb } from "./note-image";
import { NotesLockDialog, type LockMode } from "./notes-lock-dialog";
const Markdown = lazy(() => import("./markdown"));

const TEMPLATES = ["journal", "meeting", "checklist"] as const;

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

type NoteBody = {
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  locked: boolean;
  project_id: number | null;
  goal_id: number | null;
};

function NoteForm({
  note,
  onOpenChange,
  onOpenNote,
}: {
  note?: Note;
  onOpenChange: (o: boolean) => void;
  onOpenNote: (id: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const create = useCreateNote();
  const update = useUpdateNote();
  const del = useDeleteNote();
  const restore = useRestoreNote();
  const { data: projects = [] } = useProjects();
  const { data: goals = [] } = useGoals();
  const { data: links } = useNoteLinks(note?.id);
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [locked, setLocked] = useState(note?.locked ?? false);
  const [setup, setSetup] = useState(false);
  const [relock, setRelock] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pendingBody, setPendingBody] = useState<NoteBody | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const { user } = useAuth();
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
  const title = useWatch({ control: form.control, name: "title" });
  const pending = create.isPending || update.isPending;
  const contentField = form.register("content");

  const save = async (body: NoteBody) => {
    try {
      if (note) await update.mutateAsync({ id: note.id, ...body });
      else await create.mutateAsync(body);
      toast.success(t("common.saved"));
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "notes_locked") {
        // Se volvieron a bloquear mientras escribías: se pide la contraseña y se guarda sin perder nada.
        setPendingBody(body);
        setRelock(true);
      } else if (
        !note &&
        e instanceof ApiError &&
        e.status === 0 &&
        // Solo notas sencillas: la bandeja sin conexión no guarda etiquetas, vínculos ni el modo oculto.
        !body.locked &&
        !body.pinned &&
        body.tags.length === 0 &&
        !body.project_id &&
        !body.goal_id &&
        enqueueNote(body.title, body.content)
      ) {
        toast.info(t("capture.savedOffline"));
        onOpenChange(false);
      } else toast.error(errorMessage(e, t));
    }
  };

  const onSubmit = form.handleSubmit((v) =>
    save({
      title: v.title,
      content: v.content ?? "",
      tags,
      pinned,
      locked,
      project_id: v.project_id ? Number(v.project_id) : null,
      goal_id: v.goal_id ? Number(v.goal_id) : null,
    }),
  );

  const applyTemplate = (id: (typeof TEMPLATES)[number]) => {
    const date = new Date().toLocaleDateString(i18n.language, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    form.setValue("title", t(`notes.templates.${id}Title`, { date }), {
      shouldDirty: true,
    });
    form.setValue("content", t(`notes.templates.${id}Body`, { date }), {
      shouldDirty: true,
    });
  };

  const insertAtCursor = (text: string) => {
    const cur = form.getValues("content") ?? "";
    const pos = textRef.current?.selectionStart ?? cur.length;
    form.setValue("content", cur.slice(0, pos) + text + cur.slice(pos), {
      shouldDirty: true,
    });
  };

  const addImage = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await prepareImage(file);
      const r = await postBinary<{ ref: string }>("/api/notes/images", blob);
      insertAtCursor(`\n![](${r.ref})\n`);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? errorMessage(e, t) : t("notes.image.failed"),
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openLinked = (id: number) => {
    if (form.formState.isDirty) toast.error(t("notes.saveFirst"));
    else onOpenNote(id);
  };

  const hasLinks =
    !!links && (links.outgoing.length > 0 || links.backlinks.length > 0);

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {!note && !content && !title && (
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={t("notes.templates.label")}
          >
            <span className="text-xs text-muted-foreground">
              {t("notes.templates.label")}
            </span>
            {TEMPLATES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => applyTemplate(id)}
                className="cursor-pointer rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground pointer-coarse:py-2"
              >
                {t(`notes.templates.${id}`)}
              </button>
            ))}
          </div>
        )}
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
          {!user?.is_demo && (
            <Button
              type="button"
              variant={locked ? "default" : "outline"}
              size="icon"
              onClick={() => {
                // Sin contraseña de notas todavía: primero se crea y luego se oculta la nota.
                if (!locked && !user?.notes_lock_enabled) setSetup(true);
                else setLocked((l) => !l);
              }}
              aria-pressed={locked}
              aria-label={
                locked ? t("notes.lock.showNote") : t("notes.lock.hideNote")
              }
              title={
                locked ? t("notes.lock.showNote") : t("notes.lock.hideNote")
              }
            >
              {locked ? <Lock /> : <LockOpen />}
            </Button>
          )}
        </div>

        <TabsPrimitive.Root defaultValue="write">
          <div className="mb-2 flex items-center justify-between gap-2">
            <TabsPrimitive.List className="inline-flex rounded-md bg-muted p-0.5 text-sm">
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
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void addImage(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => {
                // El iPhone puede pasar la app a segundo plano al abrir cámara o fotos: no se bloquean las notas.
                holdAutoLock(180);
                fileRef.current?.click();
              }}
            >
              <ImagePlus /> {t("notes.image.add")}
            </Button>
          </div>
          <TabsPrimitive.Content value="write">
            <Textarea
              aria-label={t("notes.content")}
              rows={10}
              maxLength={20000}
              placeholder={t("notes.contentPlaceholder")}
              className="font-mono text-[13px] leading-relaxed"
              {...contentField}
              ref={(el) => {
                contentField.ref(el);
                textRef.current = el;
              }}
            />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="preview">
            <div className="prose prose-sm dark:prose-invert min-h-[15rem] max-w-none rounded-md border border-border bg-card p-4">
              {content?.trim() ? (
                <Suspense fallback={<Skeleton className="h-24" />}>
                  <Markdown links={links?.outgoing} onOpenNote={openLinked}>
                    {content}
                  </Markdown>
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

        {hasLinks && (
          <section
            aria-label={t("notes.links.title")}
            className="space-y-3 rounded-lg border border-border p-3 text-sm"
          >
            {(
              [
                ["outgoing", links.outgoing],
                ["backlinks", links.backlinks],
              ] as const
            ).map(([kind, items]) =>
              items.length ? (
                <div key={kind}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Link2 className="size-3.5" aria-hidden />
                    {t(`notes.links.${kind}`)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((l) =>
                      l.id ? (
                        <button
                          key={`${kind}-${l.id}`}
                          type="button"
                          onClick={() => openLinked(l.id!)}
                          className="cursor-pointer rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 pointer-coarse:py-2"
                        >
                          {l.title}
                        </button>
                      ) : (
                        <span
                          key={`${kind}-${l.title}`}
                          title={t("notes.links.unresolved")}
                          className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground"
                        >
                          {l.title}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ) : null,
            )}
          </section>
        )}

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
      <NotesLockDialog
        mode="setup"
        open={setup}
        onOpenChange={setSetup}
        onDone={() => setLocked(true)}
      />
      <NotesLockDialog
        mode="unlock"
        open={relock}
        onOpenChange={setRelock}
        onDone={() => {
          if (pendingBody) void save(pendingBody);
        }}
      />
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
                toast(t("notes.trash.moved"), {
                  action: {
                    label: t("notes.trash.undo"),
                    onClick: () => restore.mutate(note.id),
                  },
                });
              },
              onError: (e) => toast.error(errorMessage(e, t)),
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
  onOpenNote,
}: {
  note?: Note;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onOpenNote: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title={note ? t("notes.edit") : t("notes.new")}>
        <NoteForm
          key={note?.id ?? "new"}
          note={note}
          onOpenChange={onOpenChange}
          onOpenNote={onOpenNote}
        />
      </DialogContent>
    </Dialog>
  );
}

function plain(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[#*`>_~[\]()-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function NotesPage() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [view, setView] = useState<"notes" | "trash">("notes");
  const inTrash = view === "trash";
  const q = useDebounced(search);
  const {
    data: notes,
    isPending,
    isError,
    error,
    refetch,
  } = useNotes(inTrash ? { trash: true } : { q, tag });
  const { data: tags = [] } = useTags();
  const update = useUpdateNote();
  const restore = useRestoreNote();
  const forever = useDeleteNote();
  const emptyTrash = useEmptyTrash();
  const { user } = useAuth();
  const unlocked = useNotesUnlocked();
  const prefs = useLockPrefs();
  const [lockMode, setLockMode] = useState<LockMode | null>(null);
  const [pendingOpen, setPendingOpen] = useState<number | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmForever, setConfirmForever] = useState<Note | null>(null);
  const [editing, setEditing] = useState<Note | undefined>();
  const [dialog, setDialog] = useNewDialog();
  const lockEnabled = !!user?.notes_lock_enabled;

  const openNew = () => {
    setEditing(undefined);
    setDialog(true);
  };

  /** Abre una nota por su id (enlaces entre notas y "pedir contraseña cada vez"). */
  const openNoteById = async (id: number) => {
    try {
      const n = await api.get<Note>(`/api/notes/${id}`);
      if (n.locked && !n.title) {
        setPendingOpen(id);
        setLockMode("unlock");
        return;
      }
      setEditing(n);
      setDialog(true);
    } catch (e) {
      toast.error(errorMessage(e, t));
    }
  };

  // Enlaces desde la búsqueda global o desde una meta: /notes?open=ID abre esa nota.
  const [params, setParams] = useSearchParams();
  const openParam = Number(params.get("open"));
  useEffect(() => {
    if (!openParam) return;
    const id = setTimeout(() => {
      setParams(
        (p) => {
          p.delete("open");
          return p;
        },
        { replace: true },
      );
      void openNoteById(openParam);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam]);

  const onDialogChange = (o: boolean) => {
    setDialog(o);
    if (!o) clearOneNote(); // el desbloqueo "de una sola nota" termina al cerrarla
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
          <div className="flex items-center gap-2">
            {!user?.is_demo &&
              (lockEnabled ? (
                <>
                  {unlocked ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        lockNotes();
                        toast.success(t("notes.lock.locked"));
                      }}
                    >
                      <Lock /> {t("notes.lock.lockNow")}
                    </Button>
                  ) : (
                    !prefs.askEachTime && (
                      <Button
                        variant="outline"
                        onClick={() => setLockMode("unlock")}
                      >
                        <LockOpen /> {t("notes.lock.unlock")}
                      </Button>
                    )
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setLockMode("manage")}
                    aria-label={t("notes.lock.manageTitle")}
                    title={t("notes.lock.manageTitle")}
                  >
                    <KeyRound />
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setLockMode("setup")}>
                  <Lock /> {t("notes.lock.setupCta")}
                </Button>
              ))}
            <Button onClick={openNew}>
              <Plus /> {t("notes.new")}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label={t("notes.title")}
            className="inline-flex rounded-md bg-muted p-0.5 text-sm"
          >
            {(["notes", "trash"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "cursor-pointer rounded-[5px] px-3 py-1 font-medium transition-colors pointer-coarse:py-2",
                  view === v
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground",
                )}
              >
                {v === "notes"
                  ? t("notes.trash.tabNotes")
                  : t("notes.trash.tab")}
              </button>
            ))}
          </div>
          {inTrash ? (
            notes &&
            notes.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmEmpty(true)}
              >
                <Trash2 /> {t("notes.trash.empty")}
              </Button>
            )
          ) : (
            <div className="relative min-w-0 max-w-md flex-1">
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
          )}
        </div>
        {inTrash && (
          <p className="text-sm text-muted-foreground">
            {t("notes.trash.info")}
          </p>
        )}
        {!inTrash && tags.length > 0 && (
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
                    : "tag-chip hover:opacity-80",
                )}
                style={{ ["--tag-hue" as string]: tagHue(tg.tag) }}
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
          {notes.map((n) => {
            // El servidor no manda nada de una nota oculta mientras no se desbloquee: solo hay candado.
            const hidden = n.locked && !unlocked;
            const heading = (
              <h3 className="flex min-w-0 items-center gap-1.5 font-semibold tracking-tight">
                {n.locked && (
                  <Lock
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-label={t("notes.lock.hiddenNote")}
                  />
                )}
                <span className="line-clamp-1">
                  {hidden ? t("notes.lock.hiddenNote") : n.title}
                </span>
              </h3>
            );
            if (inTrash)
              return (
                <Card key={n.id} className="flex flex-col gap-2 p-4">
                  {heading}
                  <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">
                    {hidden
                      ? t("notes.lock.unlockToView")
                      : plain(n.content) || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("notes.trash.deletedOn", {
                      date: fmt(n.deleted_at ?? n.updated_at),
                    })}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restore.isPending}
                      onClick={() =>
                        restore.mutate(n.id, {
                          onSuccess: () =>
                            toast.success(t("notes.trash.restored")),
                        })
                      }
                    >
                      <RotateCcw /> {t("notes.trash.restore")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmForever(n)}
                    >
                      <Trash2 /> {t("notes.trash.forever")}
                    </Button>
                  </div>
                </Card>
              );
            return (
              <Card
                key={n.id}
                className="group relative flex cursor-pointer flex-col gap-2 p-4 transition-[color,background-color,border-color,box-shadow,transform,opacity] hover:-translate-y-0.5 hover:shadow-md"
                onClick={() => {
                  if (hidden) {
                    setPendingOpen(n.id);
                    return setLockMode("unlock");
                  }
                  setEditing(n);
                  setDialog(true);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  {heading}
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
                        : "text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100",
                    )}
                  >
                    <Pin className={cn("size-4", n.pinned && "fill-current")} />
                  </button>
                </div>
                <div className="flex flex-1 items-start gap-3">
                  <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">
                    {hidden
                      ? t("notes.lock.unlockToView")
                      : plain(n.content) || "—"}
                  </p>
                  {!hidden && firstImageId(n.content) !== null && (
                    <NoteThumb id={firstImageId(n.content)!} />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {n.tags.slice(0, 3).map((tg) => (
                      <span
                        key={tg}
                        className="tag-chip rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ ["--tag-hue" as string]: tagHue(tg) }}
                      >
                        #{tg}
                      </span>
                    ))}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmt(n.updated_at)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            art={inTrash ? "trash" : "notes"}
            icon={inTrash ? <Trash2 /> : <NotebookPen />}
            title={inTrash ? t("notes.trash.emptyTitle") : t("notes.empty")}
            description={
              inTrash
                ? t("notes.trash.emptyDesc")
                : q || tag
                  ? undefined
                  : t("notes.emptyDesc")
            }
            action={
              !inTrash && !q && !tag ? (
                <Button onClick={openNew}>
                  <Plus /> {t("notes.new")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      <NoteDialog
        note={editing}
        open={dialog}
        onOpenChange={onDialogChange}
        onOpenNote={(id) => void openNoteById(id)}
      />
      <NotesLockDialog
        mode={lockMode ?? "unlock"}
        open={lockMode !== null}
        onDone={() => {
          // "Pedir contraseña cada vez": tras escribirla se abre justo la nota que se tocó.
          if (lockMode === "unlock" && pendingOpen !== null)
            void openNoteById(pendingOpen);
        }}
        onOpenChange={(o) => {
          if (!o) {
            setLockMode(null);
            setPendingOpen(null);
          }
        }}
      />
      <ConfirmDialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        title={t("notes.trash.emptyConfirmTitle")}
        description={t("notes.trash.emptyConfirmDesc")}
        confirmLabel={t("notes.trash.empty")}
        pending={emptyTrash.isPending}
        onConfirm={() =>
          emptyTrash.mutate(undefined, {
            onSuccess: (r) => {
              setConfirmEmpty(false);
              if (r.skipped > 0)
                toast.info(t("notes.trash.skippedHidden", { n: r.skipped }));
              else toast.success(t("common.deleted"));
            },
            onError: (e) => toast.error(errorMessage(e, t)),
          })
        }
      />
      <ConfirmDialog
        open={confirmForever !== null}
        onOpenChange={(o) => !o && setConfirmForever(null)}
        title={t("notes.trash.foreverTitle")}
        description={t("notes.trash.foreverDesc")}
        confirmLabel={t("notes.trash.forever")}
        pending={forever.isPending}
        onConfirm={() =>
          confirmForever &&
          forever.mutate(confirmForever.id, {
            onSuccess: () => {
              setConfirmForever(null);
              toast.success(t("common.deleted"));
            },
            onError: (e) => {
              setConfirmForever(null);
              toast.error(errorMessage(e, t));
            },
          })
        }
      />
    </Page>
  );
}
