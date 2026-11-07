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
  locale: "en" | "es";
  email_verified: boolean;
  is_demo: boolean;
  ai_coach_enabled: boolean;
  has_password: boolean;
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
  due_date: string | null;
  project_id: number | null;
  habit_ids: number[];
  completed_at: string | null;
  created_at: string;
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
}

export interface MoodHistory {
  items: MoodEntry[];
  counts: Record<MoodKind, number>;
  today: MoodEntry | null;
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
