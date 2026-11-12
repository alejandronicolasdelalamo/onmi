import { MOOD_COLORS } from "@/components/mood-face";
import type { ActivityItem, MoodKind, Occurrence } from "@/lib/types";

/** Capas de datos de ONMi que se pueden ver sobre tu calendario privado. */
export const LAYERS = ["habits", "goals", "projects", "mood", "focus"] as const;
export type LayerKey = (typeof LAYERS)[number];

export const LAYER_COLORS: Record<LayerKey, string> = {
  habits: "#22c55e",
  goals: "#f59e0b",
  projects: "#0ea5e9",
  mood: "#f472b6",
  focus: "#14b8a6",
};

export interface LayerItem {
  layer: LayerKey;
  occ: Occurrence;
  mood?: MoodKind;
}

const synth = (
  day: string,
  title: string,
  color: string,
  done = false,
): Occurrence => ({
  event_id: 0,
  day,
  title,
  color,
  start_time: null,
  duration_min: null,
  done,
  shared: false,
  repeat: "none",
  flexible: false,
  per_week: null,
});

export interface LayerLabels {
  /** «3 hábitos hechos» */
  habits: (count: number, names: string) => string;
  /** «50 min de enfoque» */
  focus: (minutes: number) => string;
  mood: (mood: MoodKind) => string;
}

/**
 * Convierte los datos privados de un rango en elementos del calendario. Los hábitos de un mismo día se agrupan en
 * uno solo para no llenar la cuadrícula.
 */
export function buildLayerItems(
  items: ActivityItem[],
  enabled: readonly LayerKey[],
  labels: LayerLabels,
): LayerItem[] {
  const on = new Set(enabled);
  const out: LayerItem[] = [];
  const habitsByDay = new Map<string, string[]>();

  for (const it of items) {
    switch (it.kind) {
      case "habit":
        if (on.has("habits"))
          habitsByDay.set(it.day, [
            ...(habitsByDay.get(it.day) ?? []),
            it.title,
          ]);
        break;
      case "goal_due":
      case "goal_done":
        if (on.has("goals"))
          out.push({
            layer: "goals",
            occ: synth(
              it.day,
              it.title,
              LAYER_COLORS.goals,
              it.kind === "goal_done",
            ),
          });
        break;
      case "project_due":
        if (on.has("projects"))
          out.push({
            layer: "projects",
            occ: synth(it.day, it.title, LAYER_COLORS.projects),
          });
        break;
      case "mood":
        if (on.has("mood")) {
          const mood = it.title as MoodKind;
          out.push({
            layer: "mood",
            mood,
            occ: synth(it.day, labels.mood(mood), MOOD_COLORS[mood]),
          });
        }
        break;
      case "focus":
        if (on.has("focus") && it.minutes)
          out.push({
            layer: "focus",
            occ: synth(it.day, labels.focus(it.minutes), LAYER_COLORS.focus),
          });
        break;
    }
  }
  for (const [day, names] of habitsByDay)
    out.push({
      layer: "habits",
      occ: synth(
        day,
        labels.habits(names.length, names.join(", ")),
        LAYER_COLORS.habits,
        true,
      ),
    });
  return out;
}
