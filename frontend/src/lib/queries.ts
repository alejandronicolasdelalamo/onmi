import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, qs } from "./api";
import { celebrate, milestoneFor } from "./celebrate";
import { useNotesUnlocked } from "./notes-lock";
import { localISODate } from "./utils";
import type {
  AdminMetrics,
  AdminUser,
  Dashboard,
  Goal,
  Habit,
  HeatmapData,
  Insights,
  MoodEntry,
  MoodHistory,
  MoodKind,
  Note,
  BuddyProfile,
  CalendarData,
  CalendarEventDef,
  CalendarInfo,
  CalendarsOverview,
  ActivityItem,
  Paginated,
  PomodoroStats,
  SharedCalendars,
  Project,
  ProjectActivityItem,
  ProjectStatus,
  SearchResults,
  SessionInfo,
} from "./types";

type List<T> = { items: T[] };

export const keys = {
  dashboard: ["dashboard"] as const,
  insights: ["insights"] as const,
  // `unlocked` forma parte de la clave: al desbloquear o bloquear se piden de nuevo y no se mezclan cachés.
  notes: (f: object | undefined, unlocked: boolean) =>
    ["notes", f ?? {}, unlocked] as const,
  tags: (unlocked: boolean) => ["notes", "tags", unlocked] as const,
  projects: ["projects"] as const,
  goals: ["goals"] as const,
  habits: ["habits"] as const,
  heatmap: (days: number) => ["habits", "heatmap", days] as const,
  moods: ["moods"] as const,
  pomodoro: ["pomodoro"] as const,
  adminMetrics: ["admin", "metrics"] as const,
  adminUsers: (p: object) => ["admin", "users", p] as const,
};

/** Crea una mutación que invalida las claves indicadas al terminar. */
function useInvalidatingMutation<TVars, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  invalidate: readonly (readonly unknown[])[],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidate)
        void qc.invalidateQueries({ queryKey: key });
    },
  });
}

// ---- insights ----------------------------------------------------------------
export const useInsights = () => {
  const today = localISODate();
  return useQuery({
    queryKey: [...keys.insights, today],
    queryFn: () => api.get<Insights>(`/api/insights?today=${today}`),
  });
};

// ---- dashboard ---------------------------------------------------------------
export const useDashboard = () =>
  useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api.get<Dashboard>("/api/dashboard"),
  });

// ---- notes ---------------------------------------------------------------------
export interface NoteFilters {
  q?: string;
  tag?: string;
  pinned?: boolean;
  project_id?: number;
  /** true = notas de la papelera. */
  trash?: boolean;
}
export const useNotes = (filters: NoteFilters) => {
  const unlocked = useNotesUnlocked();
  return useQuery({
    queryKey: keys.notes(filters, unlocked),
    queryFn: async () =>
      (await api.get<List<Note>>(`/api/notes${qs({ ...filters })}`)).items,
    placeholderData: keepPreviousData,
  });
};
export const useTags = () => {
  const unlocked = useNotesUnlocked();
  return useQuery({
    queryKey: keys.tags(unlocked),
    queryFn: async () =>
      (await api.get<List<{ tag: string; count: number }>>("/api/notes/tags"))
        .items,
  });
};

export type NoteInput = Partial<
  Pick<
    Note,
    | "title"
    | "content"
    | "tags"
    | "pinned"
    | "locked"
    | "project_id"
    | "goal_id"
  >
>;
const noteKeys = [["notes"], keys.dashboard] as const;
export const useCreateNote = () =>
  useInvalidatingMutation(
    (b: NoteInput) => api.post<Note>("/api/notes", b),
    noteKeys,
  );
export const useUpdateNote = () =>
  useInvalidatingMutation(
    ({ id, ...b }: NoteInput & { id: number }) =>
      api.patch<Note>(`/api/notes/${id}`, b),
    noteKeys,
  );
/** Borra: una nota viva va a la papelera; una nota que ya está en la papelera se elimina para siempre. */
export const useDeleteNote = () =>
  useInvalidatingMutation(
    (id: number) => api.delete(`/api/notes/${id}`),
    noteKeys,
  );
export const useRestoreNote = () =>
  useInvalidatingMutation(
    (id: number) => api.post<Note>(`/api/notes/${id}/restore`),
    noteKeys,
  );
export const useEmptyTrash = () =>
  useInvalidatingMutation(
    () => api.delete<{ removed: number; skipped: number }>("/api/notes/trash"),
    noteKeys,
  );

export interface NoteLinks {
  outgoing: { title: string; id: number | null }[];
  backlinks: { id: number; title: string }[];
}
/** Notas citadas con [[título]] y notas que citan a esta. */
export const useNoteLinks = (id: number | undefined) => {
  const unlocked = useNotesUnlocked();
  return useQuery({
    queryKey: ["notes", "links", id, unlocked] as const,
    queryFn: () => api.get<NoteLinks>(`/api/notes/${id}/links`),
    enabled: id !== undefined,
    retry: false,
  });
};

// ---- projects ------------------------------------------------------------------
export const useProjects = () =>
  useQuery({
    queryKey: keys.projects,
    queryFn: async () => (await api.get<List<Project>>("/api/projects")).items,
  });

export type ProjectInput = Partial<
  Pick<
    Project,
    "name" | "description" | "category" | "status" | "priority" | "due_date"
  >
>;
const projectKeys = [keys.projects, keys.dashboard, keys.goals] as const;
export const useCreateProject = () =>
  useInvalidatingMutation(
    (b: ProjectInput) => api.post<Project>("/api/projects", b),
    projectKeys,
  );
export const useUpdateProject = () =>
  useInvalidatingMutation(
    ({ id, ...b }: ProjectInput & { id: number; position?: number }) =>
      api.patch<Project>(`/api/projects/${id}`, b),
    projectKeys,
  );
export const useDeleteProject = () =>
  useInvalidatingMutation(
    (id: number) => api.delete(`/api/projects/${id}`),
    [...projectKeys, ["notes"]],
  );

/** Mueve una tarjeta del Kanban con actualización optimista. */
export function useMoveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      position,
    }: {
      id: number;
      status: ProjectStatus;
      position: number;
    }) => api.patch<Project>(`/api/projects/${id}`, { status, position }),
    onMutate: async ({ id, status, position }) => {
      await qc.cancelQueries({ queryKey: keys.projects });
      const prev = qc.getQueryData<Project[]>(keys.projects);
      if (prev) {
        const moving = prev.find((p) => p.id === id);
        if (moving) {
          const reindexed = (list: Project[]) =>
            list.map((p, i) => ({ ...p, position: i }));
          const rest = prev.filter((p) => p.id !== id);
          const target = rest
            .filter((p) => p.status === status)
            .sort((a, b) => a.position - b.position);
          target.splice(Math.min(position, target.length), 0, {
            ...moving,
            status,
          });
          const others = rest.filter((p) => p.status !== status);
          const oldCol = reindexed(
            others
              .filter((p) => p.status === moving.status)
              .sort((a, b) => a.position - b.position),
          );
          const untouched = others.filter((p) => p.status !== moving.status);
          qc.setQueryData<Project[]>(keys.projects, [
            ...untouched,
            ...oldCol,
            ...reindexed(target),
          ]);
        }
      }
      return { prev };
    },
    onError: (_e, _v, ctx) =>
      ctx?.prev && qc.setQueryData(keys.projects, ctx.prev),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.projects });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

// ---- goals ---------------------------------------------------------------------
export const useGoals = () =>
  useQuery({
    queryKey: keys.goals,
    queryFn: async () => (await api.get<List<Goal>>("/api/goals")).items,
  });

export type GoalInput = Partial<
  Pick<
    Goal,
    "title" | "description" | "due_date" | "project_id" | "done" | "shared"
  >
>;
const goalKeys = [
  keys.goals,
  keys.projects,
  keys.dashboard,
  keys.insights,
] as const;
export const useCreateGoal = () =>
  useInvalidatingMutation(
    (b: GoalInput) => api.post<Goal>("/api/goals", b),
    goalKeys,
  );
export const useUpdateGoal = () =>
  useInvalidatingMutation(
    ({ id, ...b }: GoalInput & { id: number }) =>
      api.patch<Goal>(`/api/goals/${id}`, b),
    goalKeys,
  );
export const useDeleteGoal = () =>
  useInvalidatingMutation(
    (id: number) => api.delete(`/api/goals/${id}`),
    goalKeys,
  );

// ---- habits --------------------------------------------------------------------
export const useHabits = (archived = false) =>
  useQuery({
    queryKey: [...keys.habits, { archived }],
    queryFn: async () =>
      (
        await api.get<List<Habit>>(
          `/api/habits${qs({ archived: archived ? 1 : undefined })}`,
        )
      ).items,
  });
export const useHeatmap = (days = 120) =>
  useQuery({
    queryKey: keys.heatmap(days),
    queryFn: () => api.get<HeatmapData>(`/api/habits/heatmap?days=${days}`),
  });

export type HabitInput = Partial<
  Pick<
    Habit,
    | "name"
    | "description"
    | "category"
    | "color"
    | "goal_id"
    | "archived"
    | "target_per_week"
    | "reminder_time"
  >
>;
const habitKeys = [keys.habits, keys.dashboard, keys.insights] as const;
export const useCreateHabit = () =>
  useInvalidatingMutation(
    (b: HabitInput) => api.post<Habit>("/api/habits", b),
    habitKeys,
  );
export const useUpdateHabit = () =>
  useInvalidatingMutation(
    ({ id, ...b }: HabitInput & { id: number }) =>
      api.patch<Habit>(`/api/habits/${id}`, b),
    habitKeys,
  );
export const useDeleteHabit = () =>
  useInvalidatingMutation(
    (id: number) => api.delete(`/api/habits/${id}`),
    habitKeys,
  );
export function useToggleHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: number; date?: string }) =>
      api.post<Habit>(`/api/habits/${id}/toggle`, {
        date: date ?? localISODate(),
      }),
    // Actualización optimista: el check cambia al instante; el servidor confirma y recalcula las rachas.
    onMutate: async ({ id, date }) => {
      const day = date ?? localISODate();
      await Promise.all([
        qc.cancelQueries({ queryKey: keys.habits }),
        qc.cancelQueries({ queryKey: keys.dashboard }),
      ]);
      const prevHabits = qc.getQueriesData<Habit[]>({ queryKey: keys.habits });
      const prevDash = qc.getQueryData<Dashboard>(keys.dashboard);
      const flip = (h: Habit): Habit => {
        if (h.id !== id) return h;
        const dates = h.dates.includes(day)
          ? h.dates.filter((d) => d !== day)
          : [...h.dates, day].sort();
        return {
          ...h,
          dates,
          count: dates.length,
          done_today: dates.includes(localISODate()),
        };
      };
      qc.setQueriesData<Habit[]>({ queryKey: keys.habits }, (old) =>
        Array.isArray(old) ? old.map(flip) : old,
      );
      qc.setQueryData<Dashboard>(keys.dashboard, (old) =>
        old
          ? {
              ...old,
              habits: { ...old.habits, today: old.habits.today.map(flip) },
            }
          : old,
      );
      return { prevHabits, prevDash };
    },
    onSuccess: (habit, { date }) => {
      const today = localISODate();
      const completedToday =
        (date ?? today) === today && habit.dates.includes(today);
      // Hábito semanal: solo se celebra el día que se alcanza el objetivo de la semana (no cada check posterior).
      const reachedGoal =
        habit.streak_unit === "day" ||
        habit.week_count === habit.target_per_week;
      const milestone = milestoneFor(
        habit.current_streak,
        completedToday && reachedGoal,
        habit.streak_unit,
      );
      if (milestone) celebrate(milestone, habit.name, habit.streak_unit);
    },
    onError: (_e, _v, ctx) => {
      ctx?.prevHabits.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.prevDash) qc.setQueryData(keys.dashboard, ctx.prevDash);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.habits });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.insights });
    },
  });
}

// ---- mood ----------------------------------------------------------------------
export const useMoods = (days = 30) =>
  useQuery({
    queryKey: [...keys.moods, days],
    queryFn: () => api.get<MoodHistory>(`/api/moods?days=${days}`),
  });
export const useSetMood = () =>
  useInvalidatingMutation(
    (b: { mood: MoodKind; note?: string; tags?: string[]; date?: string }) =>
      api.put<MoodEntry>("/api/moods", {
        ...b,
        date: b.date ?? localISODate(),
      }),
    [keys.moods, keys.dashboard, keys.insights, ["calendar"]],
  );
export const useDeleteMood = () =>
  useInvalidatingMutation(
    (date: string) => api.delete(`/api/moods/${date}`),
    [keys.moods, keys.dashboard, keys.insights, ["calendar"]],
  );

// ---- pomodoro ------------------------------------------------------------------
export const usePomodoroStats = () =>
  useQuery({
    queryKey: [...keys.pomodoro, "stats"],
    queryFn: () => api.get<PomodoroStats>("/api/pomodoro/stats"),
  });
export const useSaveSession = () =>
  useInvalidatingMutation(
    (b: {
      kind: "work" | "break";
      duration_seconds: number;
      completed?: boolean;
      project_id?: number | null;
    }) => api.post("/api/pomodoro", b),
    [keys.pomodoro, keys.dashboard, keys.insights],
  );

// ---- admin ---------------------------------------------------------------------
export const useAdminMetrics = () =>
  useQuery({
    queryKey: keys.adminMetrics,
    queryFn: () => api.get<AdminMetrics>("/api/admin/metrics"),
  });
export const useAdminUsers = (params: { q?: string; page: number }) =>
  useQuery({
    queryKey: keys.adminUsers(params),
    queryFn: () =>
      api.get<Paginated<AdminUser>>(
        `/api/admin/users${qs({ ...params, page_size: 10 })}`,
      ),
    placeholderData: keepPreviousData,
  });
export const useUpdateAdminUser = () =>
  useInvalidatingMutation(
    ({
      id,
      ...b
    }: {
      id: number;
      role?: "user" | "admin";
      is_active?: boolean;
    }) => api.patch(`/api/admin/users/${id}`, b),
    [["admin"]],
  );
export const useDeleteAdminUser = () =>
  useInvalidatingMutation(
    (id: number) => api.delete(`/api/admin/users/${id}`),
    [["admin"]],
  );

// ---- mini perfil de un compañero ---------------------------------------------------
export const useBuddyProfile = (id: number) =>
  useQuery({
    queryKey: ["buddies", "profile", id],
    queryFn: () => api.get<BuddyProfile>(`/api/buddies/${id}/profile`),
    enabled: Number.isFinite(id),
  });

// ---- calendario ----------------------------------------------------------------------
export type EventInput = Omit<CalendarEventDef, "id" | "shared">;
const calendarKey = ["calendar"] as const;

export const useCalendar = (from: string, to: string) =>
  useQuery({
    queryKey: [...calendarKey, "mine", from, to],
    queryFn: () => api.get<CalendarData>(`/api/calendar${qs({ from, to })}`),
    placeholderData: keepPreviousData,
  });

export const useSharedCalendars = (from: string, to: string) =>
  useQuery({
    queryKey: [...calendarKey, "shared", from, to],
    queryFn: () =>
      api.get<SharedCalendars>(`/api/calendar/shared${qs({ from, to })}`),
    placeholderData: keepPreviousData,
  });

export const useCalendars = () =>
  useQuery({
    queryKey: [...calendarKey, "calendars"],
    queryFn: () => api.get<CalendarsOverview>("/api/calendar/calendars"),
  });

/** Datos de ONMi sobre el calendario (hábitos, metas, ánimo, enfoque…): privados, solo para quien los ve. */
export const useCalendarActivity = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: [...calendarKey, "activity", from, to],
    queryFn: async () =>
      (
        await api.get<{ items: ActivityItem[] }>(
          `/api/calendar/activity${qs({ from, to })}`,
        )
      ).items,
    enabled,
    placeholderData: keepPreviousData,
  });

export const useCreateEvent = () =>
  useInvalidatingMutation(
    (b: EventInput) => api.post<CalendarEventDef>("/api/calendar/events", b),
    [calendarKey],
  );
export const useUpdateEvent = () =>
  useInvalidatingMutation(
    ({ id, ...b }: Partial<EventInput> & { id: number }) =>
      api.patch<CalendarEventDef>(`/api/calendar/events/${id}`, b),
    [calendarKey],
  );
export const useDeleteEvent = () =>
  useInvalidatingMutation(
    (id: number) => api.delete(`/api/calendar/events/${id}`),
    [calendarKey],
  );
export const useMarkDay = () =>
  useInvalidatingMutation(
    (v: { id: number; day: string; status: "done" | "skipped" | null }) =>
      api.put(`/api/calendar/events/${v.id}/days/${v.day}`, {
        status: v.status,
      }),
    [calendarKey],
  );
export interface CalendarBody {
  name: string;
  color: string;
  user_ids: number[];
}
export const useCreateCalendar = () =>
  useInvalidatingMutation(
    (b: CalendarBody) => api.post<CalendarInfo>("/api/calendar/calendars", b),
    [calendarKey],
  );
export const useUpdateCalendar = () =>
  useInvalidatingMutation(
    ({ id, ...b }: Partial<CalendarBody> & { id: number }) =>
      api.patch<CalendarInfo>(`/api/calendar/calendars/${id}`, b),
    [calendarKey],
  );
export const useDeleteCalendar = () =>
  useInvalidatingMutation(
    (id: number) =>
      api.delete<{ ok: true; moved_events: number }>(
        `/api/calendar/calendars/${id}`,
      ),
    [calendarKey],
  );

// ---- hitos de metas ------------------------------------------------------------------
const milestoneKeys = [keys.goals, keys.dashboard] as const;
export const useAddMilestone = () =>
  useInvalidatingMutation(
    ({ goalId, title }: { goalId: number; title: string }) =>
      api.post<Goal>(`/api/goals/${goalId}/milestones`, { title }),
    milestoneKeys,
  );
/** Marcar un hito responde al instante (actualización optimista); el servidor confirma después. */
export function useUpdateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...b
    }: {
      id: number;
      done?: boolean;
      title?: string;
    }) => api.patch<Goal>(`/api/goals/milestones/${id}`, b),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: keys.goals });
      const previous = qc.getQueriesData<Goal[]>({ queryKey: keys.goals });
      if (done !== undefined)
        qc.setQueriesData<Goal[]>({ queryKey: keys.goals }, (old) =>
          old?.map((g) => {
            if (!g.milestones.some((m) => m.id === id)) return g;
            const milestones = g.milestones.map((m) =>
              m.id === id ? { ...m, done } : m,
            );
            return {
              ...g,
              milestones,
              milestones_done: milestones.filter((m) => m.done).length,
            };
          }),
        );
      return { previous };
    },
    onError: (_e, _v, ctx) =>
      ctx?.previous.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => {
      for (const key of milestoneKeys)
        void qc.invalidateQueries({ queryKey: key });
    },
  });
}
export const useDeleteMilestone = () =>
  useInvalidatingMutation(
    (id: number) => api.delete<Goal>(`/api/goals/milestones/${id}`),
    milestoneKeys,
  );

// ---- actividad de proyectos ----------------------------------------------------------
export const useProjectActivity = (id: number) =>
  useQuery({
    queryKey: [...keys.projects, "activity", id] as const,
    queryFn: async () =>
      (await api.get<List<ProjectActivityItem>>(`/api/projects/${id}/activity`))
        .items,
  });

// ---- sesiones activas -----------------------------------------------------------------
const sessionsKey = ["sessions"] as const;
export const useSessions = () =>
  useQuery({
    queryKey: sessionsKey,
    queryFn: async () =>
      (await api.get<List<SessionInfo>>("/api/auth/sessions")).items,
  });
export const useRevokeSession = () =>
  useInvalidatingMutation(
    (id: number) => api.delete(`/api/auth/sessions/${id}`),
    [sessionsKey],
  );
export const useRevokeOtherSessions = () =>
  useInvalidatingMutation(
    () => api.delete<{ revoked: number }>("/api/auth/sessions"),
    [sessionsKey],
  );

// ---- búsqueda global ------------------------------------------------------------------
export const useSearch = (q: string) =>
  useQuery({
    queryKey: ["search", q] as const,
    queryFn: () => api.get<SearchResults>(`/api/search${qs({ q })}`),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
