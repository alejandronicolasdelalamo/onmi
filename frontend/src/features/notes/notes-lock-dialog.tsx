import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { NativeSelect } from "@/components/ui/form";
import {
  loadPrefs,
  lockNotes,
  savePrefs,
  unlockNotes,
  unlockOneNote,
  useLockPrefs,
} from "@/lib/notes-lock";
import type { User } from "@/lib/types";

export type LockMode = "setup" | "unlock" | "manage" | "change" | "remove";

interface Session {
  token: string;
  expires_in: number;
  user?: User;
}

const MIN_LENGTH = 4;

/** Una sola ventana para todo el ciclo de la contraseña de notas: crearla, desbloquear, cambiarla y quitarla. */
export function NotesLockDialog({
  mode: initialMode,
  open,
  onOpenChange,
  onDone,
}: {
  mode: LockMode;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Se llama cuando la acción principal termina bien (p. ej. para marcar la nota como oculta). */
  onDone?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <LockContent
          key={initialMode}
          initialMode={initialMode}
          close={() => onOpenChange(false)}
          onDone={onDone}
        />
      )}
    </Dialog>
  );
}

function LockContent({
  initialMode,
  close,
  onDone,
}: {
  initialMode: LockMode;
  close: () => void;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const qc = useQueryClient();
  const [mode, setMode] = useState<LockMode>(initialMode);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const go = (m: LockMode) => {
    setMode(m);
    setCurrent("");
    setPassword("");
    setRepeat("");
    setError(undefined);
  };

  const needsNew = mode === "setup" || mode === "change";
  const prefs = useLockPrefs();
  // "Pedir contraseña cada vez": el desbloqueo solo sirve para la nota que se abre, no para todo el listado.
  const apply = (token: string, expires: number) =>
    loadPrefs().askEachTime
      ? unlockOneNote(token, expires)
      : unlockNotes(token, expires);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // este diálogo puede estar dentro del formulario de una nota (los eventos suben por el portal)
    setError(undefined);
    if (needsNew) {
      if (password.length < MIN_LENGTH)
        return setError(t("notes.lock.tooShort", { n: MIN_LENGTH }));
      if (mode === "setup" && password !== repeat)
        return setError(t("notes.lock.mismatch"));
    }
    setPending(true);
    try {
      if (mode === "setup") {
        const r = await api.post<Session>("/api/notes/lock/password", {
          password,
        });
        if (r.user) setUser(r.user);
        apply(r.token, r.expires_in);
        toast.success(t("notes.lock.setupDone"));
      } else if (mode === "unlock") {
        const r = await api.post<Session>("/api/notes/unlock", {
          password: current,
        });
        apply(r.token, r.expires_in);
        if (!loadPrefs().askEachTime) toast.success(t("notes.lock.unlocked"));
      } else if (mode === "change") {
        const r = await api.put<Session>("/api/notes/lock/password", {
          current_password: current,
          new_password: password,
        });
        if (r.user) setUser(r.user);
        apply(r.token, r.expires_in);
        toast.success(t("notes.lock.changed"));
      } else if (mode === "remove") {
        const r = await api.delete<{ user: User }>("/api/notes/lock/password", {
          current_password: current,
        });
        setUser(r.user);
        lockNotes();
        void qc.invalidateQueries({ queryKey: ["notes"] });
        toast.success(t("notes.lock.removed"));
      }
      onDone?.();
      close();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? t("notes.lock.wrong")
          : errorMessage(err, t),
      );
    } finally {
      setPending(false);
    }
  };

  if (mode === "manage") {
    return (
      <DialogContent title={t("notes.lock.manageTitle")}>
        <div className="mb-5 space-y-3 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">{t("notes.lock.prefsTitle")}</p>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
              checked={prefs.lockOnLeave}
              onChange={(e) => savePrefs({ lockOnLeave: e.target.checked })}
            />
            <span>
              {t("notes.lock.lockOnLeave")}
              <span className="block text-xs text-muted-foreground">
                {t("notes.lock.lockOnLeaveHint")}
              </span>
            </span>
          </label>
          <Field label={t("notes.lock.idle")} hint={t("notes.lock.maxHint")}>
            {(p) => (
              <NativeSelect
                {...p}
                value={prefs.idleMinutes}
                onChange={(e) =>
                  savePrefs({
                    idleMinutes: Number(
                      e.target.value,
                    ) as typeof prefs.idleMinutes,
                  })
                }
              >
                {[1, 2, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {t("notes.lock.idleOption", { n })}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
              checked={prefs.askEachTime}
              onChange={(e) => {
                lockNotes();
                savePrefs({ askEachTime: e.target.checked });
              }}
            />
            <span>
              {t("notes.lock.askEachTime")}
              <span className="block text-xs text-muted-foreground">
                {t("notes.lock.askEachTimeHint")}
              </span>
            </span>
          </label>
        </div>
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => go("change")}
          >
            <KeyRound /> {t("notes.lock.changeTitle")}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start text-destructive hover:bg-destructive/10"
            onClick={() => go("remove")}
          >
            <Trash2 /> {t("notes.lock.removeTitle")}
          </Button>
        </div>
      </DialogContent>
    );
  }

  return (
    <DialogContent
      title={t(`notes.lock.${mode}Title`)}
      description={t(`notes.lock.${mode}Desc`)}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {mode !== "setup" && (
          <Field
            label={
              mode === "unlock"
                ? t("notes.lock.password")
                : t("notes.lock.current")
            }
            hint={mode === "unlock" ? undefined : t("notes.lock.currentHint")}
          >
            {(p) => (
              <PasswordInput
                {...p}
                autoFocus
                autoComplete="off"
                maxLength={128}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            )}
          </Field>
        )}
        {needsNew && (
          <Field
            label={
              mode === "change"
                ? t("notes.lock.newPassword")
                : t("notes.lock.password")
            }
          >
            {(p) => (
              <PasswordInput
                {...p}
                autoFocus={mode === "setup"}
                autoComplete="off"
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
        )}
        {mode === "setup" && (
          <Field label={t("notes.lock.repeat")}>
            {(p) => (
              <PasswordInput
                {...p}
                autoComplete="off"
                maxLength={128}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            )}
          </Field>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant={mode === "remove" ? "destructive" : "default"}
            disabled={pending}
          >
            {t(`notes.lock.${mode}Submit`)}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
