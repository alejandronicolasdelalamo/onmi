export type Role = "user" | "admin";
export type MoodKind = "happy" | "love" | "neutral" | "mad" | "sad";
export type ProjectStatus = "todo" | "in_progress" | "done";
export type Priority = "low" | "medium" | "high";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  avatar: string | null;
  bio: string;
  locale: "en" | "es";
  email_verified: boolean;
  is_demo: boolean;
  ai_coach_enabled: boolean;
  has_password: boolean;
  /** ¿Tiene configurada una contraseña para las notas ocultas? */
  notes_lock_enabled: boolean;
  created_at: string;
}

export interface AdminUser extends User {
  is_active: boolean;
  last_login_at: string | null;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  /** Nota oculta: sin título ni contenido hasta desbloquearla con la contraseña de notas. */
  locked: boolean;
  /** Si está en la papelera, cuándo se borró (se elimina de verdad a los 30 días). */
  deleted_at: string | null;
  project_id: number | null;
  goal_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  category: string | null;
  status: ProjectStatus;
  priority: Priority;
  due_date: string | null;
  position: number;
  goals_total: number;
  goals_done: number;
  progress: number;
  created_at: string;
}

export interface Goal {
  id: number;
  title: string;
  description: string;
  done: boolean;
  shared: boolean;
  due_date: string | null;
  project_id: number | null;
  habit_ids: number[];
  milestones: {
    id: number;
    title: string;
    done: boolean;
    position: number;
  }[];
  milestones_done: number;
  /** Lo que alimenta la meta: hábitos y notas vinculados. */
  linked: {
    habits: { id: number; name: string }[];
    notes: { id: number; title: string }[];
  };
  completed_at: string | null;
  created_at: string;
}

export interface SessionInfo {
  id: number;
  device: string;
  created_at: string;
  last_used_at: string;
  current: boolean;
}

export interface SearchResults {
  notes: { id: number; title: string }[];
  habits: { id: number; name: string }[];
  projects: { id: number; name: string }[];
  goals: { id: number; title: string }[];
  events: { id: number; title: string }[];
}

export interface ProjectActivityItem {
  kind: "goal_created" | "goal_done" | "note";
  id: number;
  title: string;
  at: string;
}

export interface Habit {
  id: number;
  name: string;
  description: string;
  category: string | null;
  color: string;
  archived: boolean;
  goal_id: number | null;
  target_per_week: number;
  shared: boolean;
  reminder_time: string | null;
  dates: string[];
  count: number;
  week_count: number;
  streak_unit: "day" | "week";
  current_streak: number;
  longest_streak: number;
  done_today: boolean;
  created_at: string;
}

export interface HeatmapData {
  series: { date: string; count: number }[];
  habits: { id: number; name: string; color: string; rate_30d: number }[];
  total_habits: number;
}

export interface MoodEntry {
  id: number;
  date: string;
  mood: MoodKind;
  note: string;
  tags: string[];
  /** Última vez que se guardó o cambió (UTC). */
  updated_at: string | null;
}

export interface MoodHistory {
  items: MoodEntry[];
  counts: Record<MoodKind, number>;
  today: MoodEntry | null;
  stats: {
    logged_days: number;
    /** Días seguidos con ánimo registrado. */
    streak: number;
    /** Media de 1 (triste) a 5 (enamorado). */
    average: number | null;
    /** Media de ánimo de los días con cada etiqueta, de mejor a peor. */
    by_tag: { tag: string; count: number; average: number }[];
  };
}

export interface PomodoroStats {
  today_sessions: number;
  today_minutes: number;
  week_minutes: number;
  total_sessions: number;
  total_minutes: number;
  series: { date: string; minutes: number }[];
}

export interface Dashboard {
  habits: {
    total: number;
    done_today: number;
    best_streak: number;
    today: Habit[];
    week: { date: string; count: number }[];
  };
  projects: { counts: Record<ProjectStatus, number>; active: Project[] };
  notes: Note[];
  goals: Goal[];
  mood_today: MoodEntry | null;
  focus_minutes_today: number;
}

export interface AdminMetrics {
  users: {
    total: number;
    active: number;
    admins: number;
    verified: number;
    new_7d: number;
    active_7d: number;
  };
  content: {
    notes: number;
    projects: number;
    habits: number;
    moods: number;
    pomodoros: number;
  };
  signups: { date: string; count: number }[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface PublicConfig {
  google_client_id: string | null;
  demo_enabled: boolean;
  /** false = el servidor no envía correos: se ocultan los avisos de verificación. */
  mail_enabled: boolean;
}

export interface WeekWindow {
  habit_completions: number;
  habit_rate: number | null;
  goals_done: number;
  focus_minutes: number;
  avg_mood: number | null;
  mood_days: number;
}

export interface HabitEffect {
  habit_id: number;
  name: string;
  color: string;
  avg_with: number;
  avg_without: number;
  diff: number;
  days_with: number;
  days_without: number;
}

export interface Insights {
  week: {
    current: WeekWindow;
    previous: WeekWindow;
    deltas: {
      habit_rate: number | null;
      focus_minutes: number | null;
      avg_mood: number | null;
      goals_done: number;
    };
  };
  habit_effects: HabitEffect[];
  best_weekday: { weekday: number; completions: number; share: number } | null;
  top_streak: { name: string; count: number; unit: "day" | "week" } | null;
  unlock: { mood_days: number; target: number };
}

export interface PushStatus {
  public_key: string | null;
  subscriptions: number;
  timezone: string;
}

export interface CoachReview {
  text: string;
  source: "claude" | "local";
  model: string | null;
  locale: string;
  week_start: string;
  created_at: string;
}

export interface CoachStatus {
  ai_available: boolean;
  ai_enabled: boolean;
  can_enable: boolean;
  model: string | null;
  review: CoachReview | null;
}

export interface BuddyUser {
  id: number;
  name: string;
  avatar: string | null;
}

export interface BuddyRelation {
  friendship_id: number;
  user: BuddyUser;
  created_at: string;
}

export interface BuddyHabit {
  id: number;
  name: string;
  color: string;
  target_per_week: number;
  streak: number;
  streak_unit: "day" | "week";
  done_today: boolean;
  week_count: number;
  last7: boolean[];
}

export interface BuddyFriend extends BuddyRelation {
  habits: BuddyHabit[];
  cheered_today: boolean;
}

export interface BuddyCheer {
  id: number;
  from: BuddyUser;
  habit: string | null;
  created_at: string;
}

export interface BuddiesData {
  /** Código personal; null en la cuenta demo. */
  code: string | null;
  friends: BuddyFriend[];
  incoming: BuddyRelation[];
  outgoing: BuddyRelation[];
  cheers: BuddyCheer[];
}

export interface BuddyProfileGoal {
  id: number;
  title: string;
  done: boolean;
  due_date: string | null;
  completed_at: string | null;
}

export interface BuddyProfile {
  user: BuddyUser & { bio: string };
  member_since: string;
  goals: BuddyProfileGoal[];
  habits: BuddyHabit[];
  cheered_today: boolean;
}

export type Repeat = "none" | "daily" | "weekdays" | "weekly_count";

export interface CalendarEventDef {
  id: number;
  title: string;
  notes: string;
  color: string;
  start_date: string;
  start_time: string | null;
  duration_min: number | null;
  repeat: Repeat;
  /** 0 = lunes … 6 = domingo */
  weekdays: number[];
  per_week: number | null;
  every_weeks: number;
  until: string | null;
  /** Calendario al que pertenece (null = el Personal). */
  calendar_id: number | null;
  /** Solo lectura: se deduce de si su calendario se comparte con alguien. */
  shared: boolean;
}

export interface Occurrence {
  event_id: number;
  calendar_id?: number | null;
  day: string;
  title: string;
  color: string;
  start_time: string | null;
  duration_min: number | null;
  done: boolean;
  shared: boolean;
  repeat: Repeat;
  flexible: boolean;
  per_week: number | null;
  week_done?: number;
  notes?: string;
}

export interface CalendarInfo {
  id: number;
  name: string;
  color: string;
  /** El calendario Personal: siempre privado, no se puede borrar ni compartir. */
  is_default: boolean;
  events: number;
  /** Personas con las que se comparte. */
  viewers: BuddyUser[];
}

export interface CalendarData {
  events: CalendarEventDef[];
  occurrences: Occurrence[];
  calendars: CalendarInfo[];
}

export interface SharedCalendar {
  calendar: { id: number; name: string; color: string };
  user: BuddyUser;
  occurrences: Occurrence[];
}

export interface SharedCalendars {
  calendars: SharedCalendar[];
}

export interface CalendarsOverview {
  mine: CalendarInfo[];
  shared_with_me: {
    id: number;
    name: string;
    color: string;
    owner: BuddyUser;
  }[];
  buddies: BuddyUser[];
}

/** Datos de ONMi que se ven sobre el calendario (siempre privados). */
export type ActivityKind =
  "habit" | "goal_due" | "goal_done" | "project_due" | "mood" | "focus";
export interface ActivityItem {
  kind: ActivityKind;
  day: string;
  id?: number;
  title: string;
  color?: string;
  note?: string;
  minutes?: number;
}
