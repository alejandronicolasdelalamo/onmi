import { describe, expect, it } from "vitest";
import { formatDate, timeAgo } from "./format";

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

describe("timeAgo", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");

  it("usa la unidad más natural y el idioma pedido", () => {
    expect(timeAgo("2026-11-07T11:58:00Z", "en", now)).toBe("2 minutes ago");
    expect(timeAgo("2026-11-07T09:00:00Z", "en", now)).toBe("3 hours ago");
    expect(timeAgo("2026-11-05T12:00:00Z", "en", now)).toBe("2 days ago");
    expect(timeAgo("2026-11-07T09:00:00Z", "es", now)).toBe("hace 3 horas");
  });

  it("interpreta como UTC las fechas del servidor sin zona", () => {
    expect(timeAgo("2026-11-07T09:00:00", "en", now)).toBe("3 hours ago");
  });

  it("es 'ahora' para instantes de hace segundos", () => {
    expect(timeAgo("2026-11-07T11:59:50Z", "en", now)).toBe("now");
  });
});
