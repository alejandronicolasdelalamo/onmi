import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Heatmap } from "./heatmap";
import { MoodFace, MOODS } from "./mood-face";

describe("Heatmap", () => {
  const series = Array.from({ length: 21 }, (_, i) => ({
    date: `2025-03-${String(i + 1).padStart(2, "0")}`,
    count: i % 4,
  }));

  it("pinta una celda por día con su descripción accesible", () => {
    const { container } = render(<Heatmap series={series} />);
    expect(screen.getByRole("img", { name: /activity/i })).toBeInTheDocument();
    expect(container.querySelectorAll("[title^='2025-03-']")).toHaveLength(21);
  });

  it("alinea el primer día con su día de la semana (lunes primero)", () => {
    // 2025-03-01 fue sábado: debe haber 5 huecos vacíos antes (lun-vie)
    const { container } = render(<Heatmap series={series} />);
    const firstColumn = container.querySelector("[role=img] > div")!;
    const blanks = [...firstColumn.children].filter(
      (c) => !c.getAttribute("title"),
    );
    expect(blanks).toHaveLength(5);
  });

  it("funciona sin datos", () => {
    const { container } = render(<Heatmap series={[]} />);
    expect(container.querySelectorAll("[title^='20']")).toHaveLength(0);
  });
});

describe("MoodFace", () => {
  it("renderiza las cinco caritas", () => {
    for (const mood of MOODS) {
      const { container, unmount } = render(
        <MoodFace mood={mood} title={mood} />,
      );
      expect(container.querySelector("svg")).toHaveAttribute(
        "aria-label",
        mood,
      );
      unmount();
    }
  });

  it("es decorativa (aria-hidden) si no tiene título", () => {
    const { container } = render(<MoodFace mood="happy" />);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
