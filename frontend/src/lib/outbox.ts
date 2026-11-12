/**
 * Bandeja de salida sin conexión: las notas que se escriben sin red se guardan en este dispositivo y se envían
 * solas al volver la conexión. Solo se encolan notas nuevas (nunca ediciones, para no pisar cambios de otro
 * dispositivo). Mientras esperan, están en el almacenamiento local de este dispositivo.
 */
import { useSyncExternalStore } from "react";

const KEY = "onmi.outbox";
const listeners = new Set<() => void>();

export interface QueuedNote {
  id: string;
  title: string;
  content: string;
  at: string;
}

function read(): QueuedNote[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(items: QueuedNote[]) {
  try {
    if (items.length) localStorage.setItem(KEY, JSON.stringify(items));
    else localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento: no se puede encolar */
  }
  cachedCount = items.length;
  listeners.forEach((l) => l());
}

let cachedCount = read().length;

export function outboxCount(): number {
  return cachedCount;
}

export function enqueueNote(title: string, content: string): boolean {
  const items = read();
  if (items.length >= 50) return false;
  items.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: title.trim().slice(0, 150) || "—",
    content: content.slice(0, 20000),
    at: new Date().toISOString(),
  });
  write(items);
  return true;
}

let flushing = false;

/** Envía las notas pendientes de una en una; se detiene en el primer fallo y devuelve cuántas se enviaron. */
export async function flushOutbox(
  send: (n: Pick<QueuedNote, "title" | "content">) => Promise<unknown>,
): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const n of read()) {
      try {
        await send({ title: n.title, content: n.content });
      } catch {
        break;
      }
      write(read().filter((x) => x.id !== n.id));
      sent += 1;
    }
  } finally {
    flushing = false;
  }
  return sent;
}

export function useOutboxCount(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    outboxCount,
    () => 0,
  );
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Solo para pruebas. */
export function resetOutbox() {
  write([]);
}
