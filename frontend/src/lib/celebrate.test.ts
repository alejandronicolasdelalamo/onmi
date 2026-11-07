import { describe, expect, it } from "vitest";
import { MILESTONES, milestoneFor } from "./celebrate";

describe("milestoneFor", () => {
  it("celebra solo los hitos de racha al completar el día", () => {
    for (const m of MILESTONES) expect(milestoneFor(m, true)).toBe(m);
    expect(milestoneFor(8, true)).toBeNull();
    expect(milestoneFor(0, true)).toBeNull();
  });

  it("no celebra al deshacer un día", () => {
    expect(milestoneFor(7, false)).toBeNull();
  });
});
