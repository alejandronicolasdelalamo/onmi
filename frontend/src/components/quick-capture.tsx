import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Check, NotebookPen, Plus, SmilePlus, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { MoodFace, MOODS } from "@/components/mood-face";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/form";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { enqueueNote } from "@/lib/outbox";
import {
  useCreateNote,
  useHabits,
  useSetMood,
  useToggleHabit,
} from "@/lib/queries";
import { cn, localISODate } from "@/lib/utils";

/** Título razonable para una nota rápida escrita sin título. */
export function quickTitle(title: string, text: string, fallback: string) {
  const t = title.trim();
  if (t) return t.slice(0, 150);
  const first =
    text
      .trim()
      .split("\n")[0]
      ?.replace(/^[#>\-*\s]+/, "") ?? "";
  return first.slice(0, 60) || fallback;
}

function NoteTab({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const create = useCreateNote();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  const save = async () => {
    if (!text.trim() && !title.trim()) return;
    const finalTitle = quickTitle(title, text, t("capture.untitled"));
    if (!navigator.onLine && enqueueNote(finalTitle, text)) {
      toast.info(t("capture.savedOffline"));
      onDone();
      return;
    }
    try {
      await create.mutateAsync({
        title: finalTitle,
        content: text,
        tags: [],
        pinned: false,
        locked: false,
        project_id: null,
        goal_id: null,
      });
      toast.success(t("common.saved"));
      onDone();
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status === 0 &&
        enqueueNote(finalTitle, text)
      ) {
        toast.info(t("capture.savedOffline"));
        onDone();
      } else toast.error(errorMessage(e, t));
    }
  };

  return (
    <div className="space-y-3">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("capture.titlePlaceholder")}
        aria-label={t("notes.titleLabel")}
        maxLength={150}
      />
      <Textarea
        autoFocus
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("capture.notePlaceholder")}
        aria-label={t("notes.content")}
        maxLength={20000}
      />
      <Button
        className="w-full"
        disabled={create.isPending || (!text.trim() && !title.trim())}
        onClick={() => void save()}
      >
        {t("capture.saveNote")}
      </Button>
    </div>
  );
}

function HabitTab() {
  const { t } = useTranslation();
  const { data: habits = [], isPending } = useHabits();
  const toggle = useToggleHabit();
  const today = localISODate();
  if (isPending) return <p className="text-sm text-muted-foreground">…</p>;
  if (!habits.length)
    return (
      <p className="text-sm text-muted-foreground">{t("capture.noHabits")}</p>
    );
  return (
    <ul className="space-y-2">
      {habits.map((h) => {
        const done = h.dates.includes(today);
        return (
          <li key={h.id}>
            <button
              type="button"
              aria-pressed={done}
              onClick={() => {
                haptic();
                toggle.mutate({ id: h.id });
              }}
              className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg border border-border px-3 text-left transition-colors hover:bg-muted active:scale-[0.99]"
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border-2",
                  done && "animate-pop",
                )}
                style={{
                  borderColor: h.color,
                  background: done ? h.color : "transparent",
                }}
              >
                {done && <Check className="size-3.5 text-white" aria-hidden />}
              </span>
              <span
                className={cn(
                  "flex-1 text-sm font-medium",
                  done && "text-muted-foreground line-through",
                )}
              >
                {h.name}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MoodTab({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const setMood = useSetMood();
  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        {t("dashboard.moodTitle")}
      </p>
      <div className="flex justify-between gap-2">
        {MOODS.map((m) => (
          <button
            key={m}
            type="button"
            aria-label={t(`mood.kinds.${m}`)}
            onClick={() => {
              haptic();
              setMood.mutate(
                { mood: m },
                {
                  onSuccess: () => {
                    toast.success(t("mood.saved"));
                    onDone();
                  },
                  onError: (e) => toast.error(errorMessage(e, t)),
                },
              );
            }}
            className="grid size-14 cursor-pointer place-items-center rounded-full transition-transform hover:scale-110 active:scale-90"
          >
            <MoodFace mood={m} className="size-12" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Botón flotante «+»: apuntar una nota, marcar un hábito o registrar el ánimo en dos toques desde cualquier pantalla. */
export function QuickCapture() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  // En el modo enfoque no debe haber nada que distraiga.
  if (pathname === "/focus") return null;
  const close = () => setOpen(false);
  const tabs = [
    { value: "note", icon: NotebookPen },
    { value: "habit", icon: Sparkles },
    { value: "mood", icon: SmilePlus },
  ] as const;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("capture.open")}
        title={t("capture.open")}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-30 grid size-14 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-90 lg:bottom-6 lg:right-6"
      >
        <Plus className="size-7" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("capture.title")}>
          <TabsPrimitive.Root defaultValue="note">
            <TabsPrimitive.List className="mb-4 grid grid-cols-3 rounded-lg bg-muted p-0.5 text-sm">
              {tabs.map(({ value, icon: Icon }) => (
                <TabsPrimitive.Trigger
                  key={value}
                  value={value}
                  className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-2 font-medium text-muted-foreground transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
                >
                  <Icon className="size-4" aria-hidden />
                  {t(`capture.tabs.${value}`)}
                </TabsPrimitive.Trigger>
              ))}
            </TabsPrimitive.List>
            <TabsPrimitive.Content value="note">
              <NoteTab onDone={close} />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="habit">
              <HabitTab />
            </TabsPrimitive.Content>
            <TabsPrimitive.Content value="mood">
              <MoodTab onDone={close} />
            </TabsPrimitive.Content>
          </TabsPrimitive.Root>
        </DialogContent>
      </Dialog>
    </>
  );
}
