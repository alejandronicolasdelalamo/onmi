import { describe, expect, it } from "vitest";
import {
  addMonths,
  endTime,
  monthGrid,
  startOfWeek,
  weekDays,
  weekdayIndex,
  weekdayOrder,
} from "./calendar-utils";

describe("calendar-utils", () => {
  it("numera los días con el lunes como 0", () => {
    expect(weekdayIndex("2026-03-02")).toBe(0); // lunes
    expect(weekdayIndex("2026-03-08")).toBe(6); // domingo
  });

  it("encuentra el inicio de semana con lunes o domingo como primer día", () => {
    expect(startOfWeek("2026-03-05", 0)).toBe("2026-03-02");
    expect(startOfWeek("2026-03-05", 6)).toBe("2026-03-01");
    expect(startOfWeek("2026-03-08", 0)).toBe("2026-03-02"); // domingo pertenece a la semana que empieza el lunes
    expect(startOfWeek("2026-03-08", 6)).toBe("2026-03-08");
  });

  it("la cuadrícula del mes son semanas completas y contiene todo el mes", () => {
    for (const ws of [0, 6] as const) {
      const grid = monthGrid("2026-03-15", ws);
      expect(grid.length % 7).toBe(0);
      expect(grid).toContain("2026-03-01");
      expect(grid).toContain("2026-03-31");
      expect(weekdayIndex(grid[0]!)).toBe(ws === 0 ? 0 : 6);
    }
  });

  it("suma meses sin saltarse ninguno (31 de enero + 1 mes)", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-12-10", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-10", -1)).toBe("2025-12-01");
  });

  it("la semana tiene siete días consecutivos", () => {
    const days = weekDays("2026-03-04", 0);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-03-02");
    expect(days[6]).toBe("2026-03-08");
  });

  it("ordena los días según el primer día de la semana", () => {
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayOrder(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });

  it("calcula la hora de fin, también pasando de medianoche", () => {
    expect(endTime("09:00", 60)).toBe("10:00");
    expect(endTime("23:30", 90)).toBe("01:00");
  });
});
