import { describe, expect, it } from "vitest";
import { addDays, cn, formatDuration, initials, localISODate } from "./utils";

describe("utils", () => {
  it("cn fusiona clases de Tailwind sin duplicados", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    const off = false as boolean;
    expect(cn("a", off && "b", undefined, "c")).toBe("a c");
  });

  it("localISODate usa la fecha local, no UTC", () => {
    expect(localISODate(new Date(2025, 0, 5, 23, 59))).toBe("2025-01-05");
    expect(localISODate(new Date(2025, 11, 31, 0, 1))).toBe("2025-12-31");
  });

  it("addDays cruza meses y años", () => {
    expect(addDays("2025-01-31", 1)).toBe("2025-02-01");
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("formatDuration da mm:ss", () => {
    expect(formatDuration(1500)).toBe("25:00");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(0)).toBe("00:00");
  });

  it("initials toma como mucho dos letras", () => {
    expect(initials("ana maria lopez")).toBe("AM");
    expect(initials("  bob ")).toBe("B");
    expect(initials("")).toBe("");
  });
});
