import { afterEach, describe, expect, it, vi } from "vitest";
import {
  lockNotes,
  notesUnlockToken,
  onNotesLocked,
  unlockNotes,
} from "./notes-lock";

afterEach(() => {
  lockNotes();
  vi.useRealTimers();
});

describe("notes-lock", () => {
  it("guarda el token en memoria y lo borra al bloquear", () => {
    expect(notesUnlockToken()).toBeNull();
    unlockNotes("abc", 60);
    expect(notesUnlockToken()).toBe("abc");
    lockNotes();
    expect(notesUnlockToken()).toBeNull();
  });

  it("se vuelve a bloquear solo cuando caduca y avisa", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const off = onNotesLocked(cb);
    unlockNotes("abc", 10);
    vi.advanceTimersByTime(9_000);
    expect(notesUnlockToken()).toBe("abc");
    vi.advanceTimersByTime(2_000);
    expect(notesUnlockToken()).toBeNull();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it("no avisa si ya estaba bloqueado", () => {
    const cb = vi.fn();
    const off = onNotesLocked(cb);
    lockNotes();
    expect(cb).not.toHaveBeenCalled();
    off();
  });
});
