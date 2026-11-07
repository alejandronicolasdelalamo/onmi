import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { space, TOUCH, useTheme } from "../theme";
import type { Habit } from "../types";

interface Props {
  habit: Habit;
  today: string;
  onToggle: (id: number) => void;
  onLongPress?: (habit: Habit) => void;
}

/** Fila de hábito: se memoiza para que marcar uno no vuelva a pintar toda la lista. */
export const HabitRow = memo(function HabitRow({ habit, today, onToggle, onLongPress }: Props) {
  const c = useTheme();
  const done = habit.dates.includes(today);
  const weekly = habit.target_per_week < 7;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={t(done ? "habits.markUndone" : "habits.markDone", { name: habit.name })}
      onPress={() => onToggle(habit.id)}
      onLongPress={onLongPress ? () => onLongPress(habit) : undefined}
      style={({ pressed }) => [styles.row, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.check, { borderColor: habit.color, backgroundColor: done ? habit.color : "transparent" }]}>
        {done ? <Ionicons name="checkmark" size={18} color="#ffffff" /> : null}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={1} style={[styles.name, { color: done ? c.muted : c.text, textDecorationLine: done ? "line-through" : "none" }]}>
          {habit.name}
        </Text>
        {weekly ? (
          <Text style={[styles.meta, { color: c.muted }]}>
            {t("habits.weekProgress", { done: habit.week_count, target: habit.target_per_week })}
          </Text>
        ) : null}
      </View>
      {habit.current_streak > 0 ? (
        <View style={[styles.streak, { backgroundColor: c.accent }]}>
          <Ionicons name="flame" size={14} color="#f59e0b" />
          <Text style={[styles.streakText, { color: c.accentText }]}>
            {habit.current_streak}
            {habit.streak_unit === "week" ? "w" : "d"}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { minHeight: TOUCH + 8, flexDirection: "row", alignItems: "center", gap: space.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: space.md, paddingVertical: space.sm },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: "600" },
  meta: { fontSize: 12 },
  streak: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: 999 },
  streakText: { fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
