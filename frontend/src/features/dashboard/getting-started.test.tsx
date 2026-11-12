import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "@/lib/i18n";
import type { Dashboard } from "@/lib/types";
import { GettingStarted } from "./getting-started";

const empty: Dashboard = {
  habits: { total: 0, done_today: 0, best_streak: 0, today: [], week: [] },
  projects: { counts: { todo: 0, in_progress: 0, done: 0 }, active: [] },
  notes: [],
  goals: [],
  mood_today: null,
  focus_minutes_today: 0,
};

const renderIt = (data: Dashboard) =>
  render(
    <MemoryRouter>
      <GettingStarted data={data} />
    </MemoryRouter>,
  );

describe("GettingStarted", () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage("en");
  });

  it("muestra los cuatro pasos y el progreso real de una cuenta vacía", () => {
    renderIt(empty);
    expect(screen.getByText("Get started with ONMi")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });

  it("marca como hechos los pasos que ya se han completado", () => {
    renderIt({
      ...empty,
      habits: { ...empty.habits, total: 2 },
      mood_today: {
        id: 1,
        date: "2025-01-01",
        mood: "happy",
        note: "",
        tags: [],
        updated_at: null,
      },
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "2",
    );
    expect(screen.getByText("2 of 4 done")).toBeInTheDocument();
  });

  it("desaparece cuando todo está hecho", () => {
    const { container } = renderIt({
      habits: { ...empty.habits, total: 1 },
      projects: { counts: { todo: 1, in_progress: 0, done: 0 }, active: [] },
      notes: [
        {
          id: 1,
          title: "n",
          content: "",
          tags: [],
          pinned: false,
          locked: false,
          deleted_at: null,
          project_id: null,
          goal_id: null,
          created_at: "",
          updated_at: "",
        },
      ],
      goals: [],
      mood_today: {
        id: 1,
        date: "2025-01-01",
        mood: "happy",
        note: "",
        tags: [],
        updated_at: null,
      },
      focus_minutes_today: 0,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("se puede ocultar y recuerda la decisión", async () => {
    const { unmount } = renderIt(empty);
    await userEvent.click(
      screen.getByRole("button", { name: "Hide checklist" }),
    );
    expect(screen.queryByText("Get started with ONMi")).not.toBeInTheDocument();
    unmount();
    const { container } = renderIt(empty);
    expect(container).toBeEmptyDOMElement();
  });
});
