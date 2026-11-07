import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { greetingKey, localISODate } from "../dates";
import { useDashboard, useSetMood, useToggleHabit } from "../hooks";
import { errorText, t, type Key } from "../i18n";
import { MOOD_COLORS, space, TOUCH, useTheme } from "../theme";
import type { MoodKind } from "../types";
import { Button, Card, EmptyState, ErrorBanner } from "../ui";
import { HabitRow } from "./HabitRow";

const MOODS: { kind: MoodKind; icon: keyof typeof Ionicons.glyphMap }[] = [
  { kind: "happy", icon: "happy-outline" },
  { kind: "love", icon: "heart-outline" },
  { kind: "neutral", icon: "remove-circle-outline" },
  { kind: "mad", icon: "flame-outline" },
  { kind: "sad", icon: "sad-outline" },
];

export function TodayScreen() {
  const c = useTheme();
  const { user } = useAuth();
  const dashboard = useDashboard();
  const toggle = useToggleHabit();
  const setMood = useSetMood();
  const today = localISODate();
  const onToggle = useCallback((id: number) => toggle.mutate({ id }), [toggle]);

  if (dashboard.isPending) return <ActivityIndicator style={styles.center} color={c.primary} accessibilityLabel={t("common.loading")} />;
  if (dashboard.isError || !dashboard.data) {
    return (
      <View style={styles.center}>
        <ErrorBanner message={errorText(dashboard.error instanceof ApiError ? dashboard.error.code : undefined)} />
        <Button label={t("common.retry")} onPress={() => void dashboard.refetch()} style={{ marginTop: space.lg }} />
      </View>
    );
  }

  const { habits, mood_today: mood, focus_minutes_today: focus } = dashboard.data;
  const firstName = user?.name.split(" ")[0] ?? "";

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={dashboard.isRefetching} onRefresh={() => void dashboard.refetch()} tintColor={c.primary} />}
    >
      <Text accessibilityRole="header" style={[styles.greeting, { color: c.text }]}>
        {t(`today.${greetingKey()}` as Key)}, {firstName}
      </Text>

      <View style={styles.stats}>
        <Card style={styles.stat}>
          <Text style={[styles.statLabel, { color: c.muted }]}>{t("today.habits")}</Text>
          <Text style={[styles.statValue, { color: c.text }]}>
            {habits.today.filter((h) => h.dates.includes(today)).length}/{habits.total}
          </Text>
        </Card>
        <Card style={styles.stat}>
          <Text style={[styles.statLabel, { color: c.muted }]}>{t("today.focus")}</Text>
          <Text style={[styles.statValue, { color: c.text }]}>{t("today.minutes", { count: focus })}</Text>
        </Card>
      </View>

      <Card style={{ gap: space.md }}>
        <Text style={[styles.section, { color: c.text }]}>{t("today.mood")}</Text>
        <View style={styles.moods} accessibilityRole="radiogroup">
          {MOODS.map(({ kind, icon }) => {
            const selected = mood?.mood === kind;
            return (
              <Pressable
                key={kind}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t(`mood.${kind}` as Key)}
                onPress={() => setMood.mutate(kind)}
                style={[styles.mood, { borderColor: selected ? c.primary : "transparent", backgroundColor: selected ? c.accent : "transparent" }]}
              >
                <Ionicons name={icon} size={28} color={MOOD_COLORS[kind]} />
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Text style={[styles.section, { color: c.text }]}>{t("today.habits")}</Text>
      {habits.today.length === 0 ? (
        <EmptyState text={t("today.noHabits")} />
      ) : (
        <View style={{ gap: space.sm }}>
          {habits.today.map((h) => (
            <HabitRow key={h.id} habit={h} today={today} onToggle={onToggle} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: space.xl },
  content: { padding: space.lg, gap: space.lg },
  greeting: { fontSize: 26, fontWeight: "700" },
  stats: { flexDirection: "row", gap: space.md },
  stat: { flex: 1, gap: space.xs },
  statLabel: { fontSize: 13, fontWeight: "500" },
  statValue: { fontSize: 24, fontWeight: "700", fontVariant: ["tabular-nums"] },
  section: { fontSize: 16, fontWeight: "600" },
  moods: { flexDirection: "row", justifyContent: "space-between" },
  mood: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
