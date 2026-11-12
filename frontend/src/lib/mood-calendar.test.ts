import { describe, expect, it } from "vitest";
import {
  buildLayerItems,
  LAYERS,
  type LayerLabels,
} from "@/features/calendar/calendar-layers";
import { monthCells, moodFromScore, sameTags, shiftMonth } from "./mood";
import type { ActivityItem } from "./types";

const labels: LayerLabels = {
  habits: (n, names) => `${n} hábitos: ${names}`,
  focus: (m) => `${m} min`,
  mood: (m) => m,
};

describe("ánimo: utilidades", () => {
  it("la media se traduce a la emoción más cercana", () => {
    expect(moodFromScore(5)).toBe("love");
    expect(moodFromScore(4)).toBe("happy");
    expect(moodFromScore(3)).toBe("neutral");
    expect(moodFromScore(2)).toBe("mad");
    expect(moodFromScore(1)).toBe("sad");
  });

  it("el mes empieza en lunes y tiene todos sus días", () => {
    // Noviembre 2026 empieza en domingo: seis huecos antes del día 1.
    const cells = monthCells("2026-11");
    expect(cells.filter((c) => c.date === null)).toHaveLength(6);
    expect(cells.filter((c) => c.date)).toHaveLength(30);
    expect(cells.find((c) => c.date)?.date).toBe("2026-11-01");
    // Marzo 2026 empieza en domingo también; febrero 2027 en lunes (sin huecos).
    expect(monthCells("2027-02").filter((c) => c.date === null)).toHaveLength(
      0,
    );
  });

  it("cambia de mes cruzando el año", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("compara etiquetas sin importar el orden", () => {
    expect(sameTags(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameTags(["a"], ["a", "b"])).toBe(false);
  });
});

describe("capas de datos privados del calendario", () => {
  const items: ActivityItem[] = [
    { kind: "habit", day: "2026-11-12", title: "Leer" },
    { kind: "habit", day: "2026-11-12", title: "Correr" },
    { kind: "habit", day: "2026-11-13", title: "Leer" },
    { kind: "goal_due", day: "2026-11-14", title: "Entregar" },
    { kind: "goal_done", day: "2026-11-15", title: "Terminado" },
    { kind: "project_due", day: "2026-11-16", title: "Web" },
    { kind: "mood", day: "2026-11-12", title: "happy" },
    { kind: "focus", day: "2026-11-12", title: "50", minutes: 50 },
  ];

  it("agrupa los hábitos de cada día en un solo elemento", () => {
    const out = buildLayerItems(items, ["habits"], labels);
    expect(out.map((i) => [i.occ.day, i.occ.title])).toEqual([
      ["2026-11-12", "2 hábitos: Leer, Correr"],
      ["2026-11-13", "1 hábitos: Leer"],
    ]);
  });

  it("solo incluye las capas activadas", () => {
    expect(buildLayerItems(items, [], labels)).toEqual([]);
    const all = buildLayerItems(items, LAYERS, labels);
    expect(new Set(all.map((i) => i.layer))).toEqual(new Set(LAYERS));
    const goals = buildLayerItems(items, ["goals"], labels);
    expect(goals.map((g) => [g.occ.title, g.occ.done])).toEqual([
      ["Entregar", false],
      ["Terminado", true],
    ]);
  });

  it("el ánimo lleva su emoción y el enfoque sus minutos", () => {
    const [m] = buildLayerItems(items, ["mood"], labels);
    expect(m?.mood).toBe("happy");
    expect(buildLayerItems(items, ["focus"], labels)[0]?.occ.title).toBe(
      "50 min",
    );
  });

  it("nunca son eventos reales (no se pueden editar ni compartir)", () => {
    for (const i of buildLayerItems(items, LAYERS, labels)) {
      expect(i.occ.event_id).toBe(0);
      expect(i.occ.shared).toBe(false);
    }
  });
});
