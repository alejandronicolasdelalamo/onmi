import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { localISODate } from "./dates";
import type { Dashboard, Habit, MoodKind, Note } from "./types";

export const keys = {
  dashboard: ["dashboard"] as const,
  habits: ["habits"] as const,
  notes: (q: string) => ["notes", q] as const,
};

export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: () => api.get<Dashboard>("/api/dashboard") });

export const useHabits = () =>
  useQuery({ queryKey: keys.habits, queryFn: async () => (await api.get<{ items: Habit[] }>("/api/habits")).items });

export const useNotes = (q: string) =>
  useQuery({
    queryKey: keys.notes(q),
    queryFn: async () => (await api.get<{ items: Note[] }>(`/api/notes?q=${encodeURIComponent(q)}`)).items,
  });

/** Invierte el día de hoy en un hábito (sin tocar su racha: la recalcula el servidor al confirmar). */
export function flipToday(habit: Habit, today: string): Habit {
  const dates = habit.dates.includes(today) ? habit.dates.filter((d) => d !== today) : [...habit.dates, today].sort();
  return { ...habit, dates, count: dates.length };
}

/** Marcar o desmarcar hoy: el cambio se ve al instante y se revierte si el servidor falla. */
export function useToggleHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) => api.post<Habit>(`/api/habits/${id}/toggle`, { date: localISODate() }),
    onMutate: async ({ id }) => {
      const today = localISODate();
      await Promise.all([qc.cancelQueries({ queryKey: keys.dashboard }), qc.cancelQueries({ queryKey: keys.habits })]);
      const prevDash = qc.getQueryData<Dashboard>(keys.dashboard);
      const prevHabits = qc.getQueryData<Habit[]>(keys.habits);
      const flip = (h: Habit) => (h.id === id ? flipToday(h, today) : h);
      qc.setQueryData<Dashboard>(keys.dashboard, (old) =>
        old ? { ...old, habits: { ...old.habits, today: old.habits.today.map(flip) } } : old,
      );
      qc.setQueryData<Habit[]>(keys.habits, (old) => old?.map(flip));
      return { prevDash, prevHabits };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevDash) qc.setQueryData(keys.dashboard, ctx.prevDash);
      if (ctx?.prevHabits) qc.setQueryData(keys.habits, ctx.prevHabits);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.habits });
    },
  });
}

export function useSetMood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mood: MoodKind) => api.put("/api/moods", { mood, date: localISODate() }),
    onMutate: async (mood) => {
      await qc.cancelQueries({ queryKey: keys.dashboard });
      const prev = qc.getQueryData<Dashboard>(keys.dashboard);
      qc.setQueryData<Dashboard>(keys.dashboard, (old) => (old ? { ...old, mood_today: { mood } } : old));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.dashboard, ctx.prev),
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.dashboard }),
  });
}
