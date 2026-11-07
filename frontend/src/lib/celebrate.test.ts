import { describe, expect, it } from "vitest";
import { MILESTONES, WEEK_MILESTONES, milestoneFor } from "./celebrate";

describe("milestoneFor", () => {
  it("celebra solo los hitos de racha al completar el día", () => {
    for (const m of MILESTONES) expect(milestoneFor(m, true)).toBe(m);
    expect(milestoneFor(8, true)).toBeNull();
    expect(milestoneFor(0, true)).toBeNull();
  });

  it("no celebra al deshacer un día", () => {
    expect(milestoneFor(7, false)).toBeNull();
  });

  it("los hábitos semanales celebran en semanas, con sus propios hitos", () => {
    for (const m of WEEK_MILESTONES)
      expect(milestoneFor(m, true, "week")).toBe(m);
    expect(milestoneFor(7, true, "week")).toBeNull(); // 7 semanas no es un hito; 7 días sí
    expect(milestoneFor(4, true, "day")).toBeNull(); // 4 días no es un hito; 4 semanas sí
  });
});
