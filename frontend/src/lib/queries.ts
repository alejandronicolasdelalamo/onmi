import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, qs } from "./api";
import { localISODate } from "./utils";
import type {
  AdminMetrics,
  AdminUser,
  Dashboard,
  Goal,
  Habit,
  HeatmapData,
  MoodHistory,
  MoodKind,
  Note,
  Paginated,
  PomodoroStats,
  Project,
  ProjectStatus,
} from "./types";

type List<T> = { items: T[] };

export const keys = {
  dashboard: ["dashboard"] as const,
  notes: (f?: object) => ["notes", f ?? {}] as const,
  tags: ["notes", "tags"] as const,
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
}
export const useNotes = (filters: NoteFilters) =>
  useQuery({
    queryKey: keys.notes(filters),
    queryFn: async () =>
      (await api.get<List<Note>>(`/api/notes${qs({ ...filters })}`)).items,
    placeholderData: keepPreviousData,
  });
export const useTags = () =>
  useQuery({
    queryKey: keys.tags,
    queryFn: async () =>
      (await api.get<List<{ tag: string; count: number }>>("/api/notes/tags"))
        .items,
  });

export type NoteInput = Partial<
  Pick<Note, "title" | "content" | "tags" | "pinned" | "project_id" | "goal_id">
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
export const useDeleteNote = () =>
  useInvalidatingMutation(
    (id: number) => api.delete(`/api/notes/${id}`),
    noteKeys,
  );

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
  Pick<Goal, "title" | "description" | "due_date" | "project_id" | "done">
>;
const goalKeys = [keys.goals, keys.projects, keys.dashboard] as const;
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
    "name" | "description" | "category" | "color" | "goal_id" | "archived"
  >
>;
const habitKeys = [keys.habits, keys.dashboard] as const;
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
    onError: (_e, _v, ctx) => {
      ctx?.prevHabits.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.prevDash) qc.setQueryData(keys.dashboard, ctx.prevDash);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.habits });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
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
    (b: { mood: MoodKind; note?: string; date?: string }) =>
      api.put("/api/moods", { ...b, date: b.date ?? localISODate() }),
    [keys.moods, keys.dashboard],
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
    [keys.pomodoro, keys.dashboard],
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
