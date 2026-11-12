import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWikiLinks } from "@/features/notes/markdown";
import { fitWithin } from "./image";
import {
  clearOneNote,
  DEFAULT_PREFS,
  holdAutoLock,
  loadPrefs,
  lockNotes,
  resetPrefsCache,
  savePrefs,
  startNotesAutoLock,
  unlockHeaderFor,
  unlockNotes,
  unlockOneNote,
} from "./notes-lock";

describe("fitWithin", () => {
  it("reduce manteniendo la proporción y nunca amplía", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1, 1)).toEqual({ width: 1, height: 1 });
  });
});

describe("resolveWikiLinks", () => {
  const links = [
    { title: "Proyecto X", id: 7 },
    { title: "Fantasma", id: null },
  ];
  it("enlaza las notas que existen sin distinguir mayúsculas", () => {
    expect(resolveWikiLinks("ver [[proyecto x]]", links)).toBe(
      "ver [proyecto x](#note:7)",
    );
  });
  it("deja como texto lo que no existe (sin romper el Markdown)", () => {
    expect(resolveWikiLinks("ver [[Fantasma]] y [[Otra]]", links)).toBe(
      "ver \\[\\[Fantasma\\]\\] y \\[\\[Otra\\]\\]",
    );
  });
});

describe("desbloqueo global y de una sola nota", () => {
  afterEach(() => lockNotes());

  it("el desbloqueo global sirve para todo /api/notes y nada más", () => {
    unlockNotes("g", 60);
    expect(unlockHeaderFor("/api/notes")).toBe("g");
    expect(unlockHeaderFor("/api/notes/images/3")).toBe("g");
    expect(unlockHeaderFor("/api/habits")).toBeNull();
  });

  it("el desbloqueo de una nota NO sirve para el listado ni las etiquetas", () => {
    unlockOneNote("s", 60);
    expect(unlockHeaderFor("/api/notes")).toBeNull();
    expect(unlockHeaderFor("/api/notes?q=x")).toBeNull();
    expect(unlockHeaderFor("/api/notes/tags")).toBeNull();
    expect(unlockHeaderFor("/api/notes/12")).toBe("s");
    expect(unlockHeaderFor("/api/notes/12/links")).toBe("s");
    expect(unlockHeaderFor("/api/notes/images/5")).toBe("s");
    clearOneNote();
    expect(unlockHeaderFor("/api/notes/12")).toBeNull();
  });
});

describe("preferencias y bloqueo automático", () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
  });
  afterEach(() => {
    lockNotes();
    vi.useRealTimers();
  });

  it("valores por defecto y persistencia por dispositivo", () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    savePrefs({ askEachTime: true, idleMinutes: 2 });
    resetPrefsCache();
    expect(loadPrefs()).toMatchObject({ askEachTime: true, idleMinutes: 2 });
  });

  it("ignora valores corruptos del almacenamiento", () => {
    localStorage.setItem(
      "onmi.notes.lock-prefs",
      JSON.stringify({ idleMinutes: 999, lockOnLeave: "sí" }),
    );
    resetPrefsCache();
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  const hide = (state: "hidden" | "visible") => {
    Object.defineProperty(document, "visibilityState", {
      value: state,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("bloquea al salir de la app, salvo que se haya pausado (selector de fotos)", () => {
    const stop = startNotesAutoLock();
    unlockNotes("g", 600);
    hide("hidden");
    expect(unlockHeaderFor("/api/notes")).toBeNull();

    unlockNotes("g", 600);
    holdAutoLock(60);
    hide("hidden");
    expect(unlockHeaderFor("/api/notes")).toBe("g");
    hide("visible");
    stop();
  });

  it("no bloquea al salir si el usuario lo desactivó", () => {
    savePrefs({ lockOnLeave: false });
    const stop = startNotesAutoLock();
    unlockNotes("g", 600);
    hide("hidden");
    expect(unlockHeaderFor("/api/notes")).toBe("g");
    hide("visible");
    stop();
  });

  it("bloquea tras el tiempo de inactividad elegido", () => {
    vi.useFakeTimers();
    savePrefs({ idleMinutes: 1 });
    const stop = startNotesAutoLock();
    unlockNotes("g", 600);
    vi.advanceTimersByTime(50_000);
    expect(unlockHeaderFor("/api/notes")).toBe("g");
    vi.advanceTimersByTime(30_000);
    expect(unlockHeaderFor("/api/notes")).toBeNull();
    stop();
  });
});
