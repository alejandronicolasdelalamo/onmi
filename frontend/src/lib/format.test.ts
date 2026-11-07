import { describe, expect, it } from "vitest";
import { formatDate } from "./format";

describe("formatDate", () => {
  it("formatea con Intl según el idioma, sin desplazar el día por la zona horaria", () => {
    expect(formatDate("2026-11-14", undefined, "en")).toBe("Nov 14, 2026");
    expect(formatDate("2026-11-14", undefined, "es")).toMatch(
      /^14 nov\.? 2026$/,
    );
    expect(formatDate("2026-01-01", { day: "numeric" }, "en")).toBe("1");
  });

  it("acepta fechas con hora", () => {
    expect(formatDate("2026-03-05T10:30:00", { month: "short" }, "en")).toBe(
      "Mar",
    );
  });
});
