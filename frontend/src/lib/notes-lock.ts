/**
 * Desbloqueo temporal de las notas ocultas. El token vive SOLO en memoria: recargar la página, cerrar sesión o
 * que pase el tiempo vuelve a ocultarlas. El servidor valida firma, usuario y caducidad en cada petición.
 *
 * Además hay dos modos:
 *  - global: se ven todas las notas ocultas mientras dure el desbloqueo;
 *  - puntual ("pedir contraseña cada vez"): el token solo sirve para UNA nota abierta (nunca para el listado).
 * Las preferencias (bloqueo al salir de la app, por inactividad, pedir cada vez) son de cada dispositivo.
 */
import { useSyncExternalStore } from "react";

let token: string | null = null;
let expiresAt = 0;
let scoped: { token: string; expiresAt: number } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const lockListeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function validGlobal(): string | null {
  return token && Date.now() < expiresAt ? token : null;
}

/** Cabecera de desbloqueo que le corresponde a una ruta de la API (o null). */
export function unlockHeaderFor(path: string): string | null {
  if (!path.startsWith("/api/notes")) return null;
  const global = validGlobal();
  if (global) return global;
  // El desbloqueo puntual solo vale para una nota concreta (o sus imágenes), jamás para el listado.
  if (
    scoped &&
    Date.now() < scoped.expiresAt &&
    /^\/api\/notes\/(\d+|images\/\d+)/.test(path)
  )
    return scoped.token;
  return null;
}

export const notesUnlockToken = validGlobal;

export function unlockNotes(newToken: string, expiresInSeconds: number) {
  token = newToken;
  expiresAt = Date.now() + expiresInSeconds * 1000;
  clearTimeout(timer);
  timer = setTimeout(lockNotes, expiresInSeconds * 1000);
  emit();
}

export function unlockOneNote(newToken: string, expiresInSeconds: number) {
  scoped = { token: newToken, expiresAt: Date.now() + expiresInSeconds * 1000 };
}

export function clearOneNote() {
  if (!scoped) return;
  scoped = null;
  lockListeners.forEach((l) => l());
}

export function lockNotes() {
  const wasUnlocked = token !== null || scoped !== null;
  token = null;
  scoped = null;
  expiresAt = 0;
  clearTimeout(timer);
  emit();
  if (wasUnlocked) lockListeners.forEach((l) => l());
}

/** Avisa cuando las notas vuelven a ocultarse (para descartar de la caché el contenido ya visible). */
export function onNotesLocked(cb: () => void) {
  lockListeners.add(cb);
  return () => {
    lockListeners.delete(cb);
  };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useNotesUnlocked(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => token !== null,
    () => false,
  );
}

// ---- preferencias de este dispositivo -------------------------------------------------------------
export interface LockPrefs {
  /** Bloquear al salir de la app o de la pestaña (en iPhone: al cambiar de app o apagar la pantalla). */
  lockOnLeave: boolean;
  /** Minutos sin tocar nada antes de bloquear. */
  idleMinutes: 1 | 2 | 5 | 10;
  /** Pedir la contraseña cada vez que se abre una nota oculta. */
  askEachTime: boolean;
}

export const DEFAULT_PREFS: LockPrefs = {
  lockOnLeave: true,
  idleMinutes: 5,
  askEachTime: false,
};
const PREFS_KEY = "onmi.notes.lock-prefs";
const prefListeners = new Set<() => void>();
let prefsCache: LockPrefs | null = null;

export function loadPrefs(): LockPrefs {
  if (prefsCache) return prefsCache;
  let stored: Partial<LockPrefs> = {};
  try {
    stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    /* sin almacenamiento: se usan los valores por defecto */
  }
  const idle = [1, 2, 5, 10].includes(stored.idleMinutes as number)
    ? (stored.idleMinutes as LockPrefs["idleMinutes"])
    : DEFAULT_PREFS.idleMinutes;
  prefsCache = {
    lockOnLeave:
      typeof stored.lockOnLeave === "boolean"
        ? stored.lockOnLeave
        : DEFAULT_PREFS.lockOnLeave,
    idleMinutes: idle,
    askEachTime:
      typeof stored.askEachTime === "boolean"
        ? stored.askEachTime
        : DEFAULT_PREFS.askEachTime,
  };
  return prefsCache;
}

export function savePrefs(patch: Partial<LockPrefs>) {
  prefsCache = { ...loadPrefs(), ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefsCache));
  } catch {
    /* modo privado: la preferencia solo dura mientras la página está abierta */
  }
  prefListeners.forEach((l) => l());
}

export function resetPrefsCache() {
  prefsCache = null;
}

export function useLockPrefs(): LockPrefs {
  return useSyncExternalStore(
    (cb) => {
      prefListeners.add(cb);
      return () => {
        prefListeners.delete(cb);
      };
    },
    loadPrefs,
    () => DEFAULT_PREFS,
  );
}

// ---- bloqueo automático ---------------------------------------------------------------------------
let lastActivity = Date.now();
let holdUntil = 0;

/** Pausa el bloqueo por salir de la app (p. ej. mientras el iPhone enseña el selector de fotos). */
export function holdAutoLock(seconds: number) {
  holdUntil = Date.now() + seconds * 1000;
}

export function startNotesAutoLock(): () => void {
  const touch = () => {
    lastActivity = Date.now();
  };
  const onHidden = () => {
    if (
      document.visibilityState === "hidden" &&
      loadPrefs().lockOnLeave &&
      Date.now() > holdUntil
    )
      lockNotes();
  };
  const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
  events.forEach((e) =>
    window.addEventListener(e, touch, { passive: true, capture: true }),
  );
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", onHidden);
  const id = setInterval(() => {
    if (token === null && scoped === null) return;
    if (Date.now() - lastActivity > loadPrefs().idleMinutes * 60_000)
      lockNotes();
  }, 10_000);
  return () => {
    events.forEach((e) => window.removeEventListener(e, touch, true));
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", onHidden);
    clearInterval(id);
  };
}
