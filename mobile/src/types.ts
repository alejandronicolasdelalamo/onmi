export type MoodKind = "happy" | "love" | "neutral" | "mad" | "sad";

export interface User {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  locale: "en" | "es";
  is_demo: boolean;
}

export interface Habit {
  id: number;
  name: string;
  color: string;
  target_per_week: number;
  dates: string[];
  count: number;
  week_count: number;
  streak_unit: "day" | "week";
  current_streak: number;
  longest_streak: number;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  /** Nota oculta con contraseña (se gestiona desde la web): el servidor no envía su contenido. */
  locked?: boolean;
  updated_at: string;
}

export interface Dashboard {
  habits: { total: number; done_today: number; best_streak: number; today: Habit[] };
  notes: Note[];
  mood_today: { mood: MoodKind } | null;
  focus_minutes_today: number;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}
