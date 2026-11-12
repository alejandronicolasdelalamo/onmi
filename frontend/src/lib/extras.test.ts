import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { quickTitle } from "@/components/quick-capture";
import { shouldWelcome } from "@/components/welcome";
import { nextAction } from "@/features/dashboard/today-card";
import { weekStats, type ShareLabels } from "@/features/insights/share-week";
import { lastBackupDays } from "@/features/profile/backup-sessions";
import { enqueueNote, flushOutbox, outboxCount, resetOutbox } from "./outbox";
import { isIOS, needsIOSInstall } from "./platform";
import { firstImageId, tagHue } from "./tag-color";
import type { Dashboard, Habit } from "./types";

const habit = (over: Partial<Habit> = {}): Habit =>
  ({
    id: 1,
    name: "Leer",
    dates: [],
    color: "#000",
    ...over,
  }) as Habit;

const dash = (over: Partial<Dashboard> = {}): Dashboard => ({
  habits: {
    total: 1,
    done_today: 0,
    best_streak: 0,
    today: [habit()],
    week: [],
  },
  projects: { counts: { todo: 0, in_progress: 0, done: 0 }, active: [] },
  notes: [],
  goals: [],
  mood_today: {
    id: 1,
    date: "2026-11-12",
    mood: "happy",
    note: "",
    tags: [],
    updated_at: null,
  },
  focus_minutes_today: 60,
  ...over,
});

describe("nextAction", () => {
  const today = "2026-11-12";
  const noon = new Date("2026-11-12T12:00:00");

  it("primero el hábito pendiente", () => {
    expect(nextAction(dash(), today, noon)).toEqual({
      kind: "habit",
      id: 1,
      name: "Leer",
    });
  });
  it("si no hay hábitos pendientes, el ánimo", () => {
    const d = dash({ mood_today: null });
    d.habits.today = [habit({ dates: [today] })];
    expect(nextAction(d, today, noon).kind).toBe("mood");
  });
  it("después el enfoque (pero no a última hora de la noche)", () => {
    const d = dash({ focus_minutes_today: 10 });
    d.habits.today = [habit({ dates: [today] })];
    expect(nextAction(d, today, noon).kind).toBe("focus");
    expect(nextAction(d, today, new Date("2026-11-12T22:30:00")).kind).toBe(
      "done",
    );
  });
  it("una meta que vence pronto, y si no, todo hecho", () => {
    const d = dash();
    d.habits.today = [habit({ dates: [today] })];
    d.goals = [{ id: 3, title: "Entregar", due_date: "2026-11-13" } as never];
    expect(nextAction(d, today, noon)).toMatchObject({
      kind: "goal",
      title: "Entregar",
    });
    d.goals = [];
    expect(nextAction(d, today, noon).kind).toBe("done");
  });
});

describe("bandeja de salida sin conexión", () => {
  beforeEach(() => {
    localStorage.clear();
    resetOutbox();
  });

  it("guarda notas, las envía en orden y vacía la bandeja", async () => {
    enqueueNote("A", "uno");
    enqueueNote("B", "dos");
    expect(outboxCount()).toBe(2);
    const sent: string[] = [];
    const n = await flushOutbox(async (note) => {
      sent.push(note.title);
    });
    expect(n).toBe(2);
    expect(sent).toEqual(["A", "B"]);
    expect(outboxCount()).toBe(0);
  });

  it("si falla una, se detiene y conserva las pendientes", async () => {
    enqueueNote("A", "uno");
    enqueueNote("B", "dos");
    enqueueNote("C", "tres");
    let calls = 0;
    const n = await flushOutbox(async () => {
      calls += 1;
      if (calls === 2) throw new Error("sin red");
    });
    expect(n).toBe(1);
    expect(outboxCount()).toBe(2);
    expect(
      JSON.parse(localStorage.getItem("onmi.outbox")!).map(
        (x: { title: string }) => x.title,
      ),
    ).toEqual(["B", "C"]);
  });

  it("limita la cola y recorta lo que guarda", () => {
    for (let i = 0; i < 50; i++) expect(enqueueNote(`n${i}`, "x")).toBe(true);
    expect(enqueueNote("de más", "x")).toBe(false);
  });
});

describe("quickTitle", () => {
  it("usa el título, o la primera línea limpia, o el de respaldo", () => {
    expect(quickTitle("  Mío ", "texto", "Rápida")).toBe("Mío");
    expect(quickTitle("", "# Comprar pan\nmás cosas", "Rápida")).toBe(
      "Comprar pan",
    );
    expect(quickTitle("", "   ", "Rápida")).toBe("Rápida");
    expect(quickTitle("", "x".repeat(200), "R")).toHaveLength(60);
  });
});

describe("bienvenida", () => {
  beforeEach(() => localStorage.clear());
  const now = Date.parse("2026-11-12T12:00:00Z");
  it("solo a cuentas recién creadas, una vez, y nunca en la demo", () => {
    expect(shouldWelcome("2026-11-12T11:55:00", false, now)).toBe(true);
    expect(shouldWelcome("2026-11-10T11:55:00", false, now)).toBe(false);
    expect(shouldWelcome("2026-11-12T11:55:00", true, now)).toBe(false);
    localStorage.setItem("onmi.welcomed", "1");
    expect(shouldWelcome("2026-11-12T11:55:00", false, now)).toBe(false);
  });
});

describe("etiquetas e imágenes", () => {
  it("el color de una etiqueta es estable y no distingue mayúsculas", () => {
    expect(tagHue("Trabajo")).toBe(tagHue("trabajo"));
    expect(tagHue("a")).not.toBe(tagHue("b"));
    expect(tagHue("x")).toBeGreaterThanOrEqual(0);
    expect(tagHue("x")).toBeLessThan(360);
  });
  it("encuentra la primera imagen de una nota", () => {
    expect(firstImageId("hola ![](onmi-image:12) y ![](onmi-image:3)")).toBe(
      12,
    );
    expect(firstImageId("sin imágenes")).toBeNull();
  });
});

describe("copia de seguridad", () => {
  afterEach(() => localStorage.clear());
  it("calcula los días desde la última copia", () => {
    expect(lastBackupDays()).toBeNull();
    localStorage.setItem("onmi.last-backup", "2026-11-01T00:00:00Z");
    expect(lastBackupDays(Date.parse("2026-11-12T00:00:00Z"))).toBe(11);
  });
});

describe("tarjeta de la semana", () => {
  it("resume los datos sin inventar los que faltan", () => {
    const labels = {
      habits: "H",
      focus: "F",
      goals: "G",
      mood: "M",
    } as ShareLabels;
    const stats = weekStats(
      {
        habit_completions: 3,
        habit_rate: 0.5,
        goals_done: 2,
        focus_minutes: 90,
        avg_mood: null,
        mood_days: 0,
      },
      labels,
      (n) => `${n} min`,
    );
    expect(stats).toEqual([
      { label: "H", value: "50%" },
      { label: "F", value: "90 min" },
      { label: "G", value: "2" },
      { label: "M", value: "—" },
    ]);
  });
});

describe("plataforma", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("detecta iPhone en Safari (sin instalar) frente a la app instalada", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    expect(isIOS()).toBe(true);
    expect(needsIOSInstall()).toBe(true);
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
      standalone: true,
    });
    expect(needsIOSInstall()).toBe(false);
    vi.stubGlobal("navigator", {
      userAgent: "Windows",
      platform: "Win32",
      maxTouchPoints: 0,
    });
    expect(isIOS()).toBe(false);
  });
});
