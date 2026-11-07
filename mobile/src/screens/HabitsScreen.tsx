import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError } from "../api";
import { localISODate } from "../dates";
import { keys, useHabits, useToggleHabit } from "../hooks";
import { errorText, t } from "../i18n";
import type { RootNav } from "../navigation-types";
import { space, TOUCH, useTheme } from "../theme";
import type { Habit } from "../types";
import { Button, EmptyState, ErrorBanner, Field } from "../ui";
import { HabitRow } from "./HabitRow";

export function HabitsScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<RootNav>();
  const qc = useQueryClient();
  const habits = useHabits();
  const toggle = useToggleHabit();
  const today = localISODate();

  const onToggle = useCallback((id: number) => toggle.mutate({ id }), [toggle]);
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/habits/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.habits });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
  // Mantener pulsado un hábito ofrece borrarlo (con confirmación que nombra lo que se borra).
  const onLongPress = useCallback(
    (habit: Habit) =>
      Alert.alert(t("habits.deleteTitle", { name: habit.name }), t("habits.deleteBody"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: () => remove.mutate(habit.id) },
      ]),
    [remove],
  );
  const renderItem = useCallback(
    ({ item }: { item: Habit }) => <HabitRow habit={item} today={today} onToggle={onToggle} onLongPress={onLongPress} />,
    [today, onToggle, onLongPress],
  );

  if (habits.isPending) return <ActivityIndicator style={styles.center} color={c.primary} accessibilityLabel={t("common.loading")} />;
  if (habits.isError) {
    return (
      <View style={styles.center}>
        <ErrorBanner message={errorText(habits.error instanceof ApiError ? habits.error.code : undefined)} />
        <Button label={t("common.retry")} onPress={() => void habits.refetch()} style={{ marginTop: space.lg }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <FlashList
        data={habits.data}
        renderItem={renderItem}
        keyExtractor={(h) => String(h.id)}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + TOUCH * 2 }}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={<EmptyState text={t("habits.empty")} />}
        refreshing={habits.isRefetching}
        onRefresh={() => void habits.refetch()}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("habits.add")}
        onPress={() => navigation.navigate("HabitEditor")}
        style={[styles.fab, { backgroundColor: c.primary, bottom: insets.bottom + space.lg }]}
      >
        <Ionicons name="add" size={28} color={c.onPrimary} />
      </Pressable>
    </View>
  );
}

const FREQUENCIES = [7, 6, 5, 4, 3, 2, 1];

export function HabitEditorScreen() {
  const navigation = useNavigation<RootNav>();
  const qc = useQueryClient();
  const c = useTheme();
  const [name, setName] = useState("");
  const [target, setTarget] = useState(7);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post("/api/habits", { name: name.trim(), target_per_week: target }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.habits });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      navigation.goBack();
    },
    onError: (e) => setError(errorText(e instanceof ApiError ? e.code : undefined)),
  });

  return (
    <View style={[styles.editor, { backgroundColor: c.background }]}>
      {error ? <ErrorBanner message={error} /> : null}
      <Field label={t("habits.name")} value={name} onChangeText={setName} maxLength={100} autoFocus returnKeyType="done" />
      <View style={{ gap: space.sm }}>
        <Text style={[styles.label, { color: c.text }]}>{t("habits.frequency")}</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {FREQUENCIES.map((n) => {
            const selected = n === target;
            return (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setTarget(n)}
                style={[styles.chip, { backgroundColor: selected ? c.primary : c.card, borderColor: selected ? c.primary : c.border }]}
              >
                <Text style={{ color: selected ? c.onPrimary : c.text, fontWeight: "600" }}>
                  {n === 7 ? t("habits.daily") : t("habits.weekly", { count: n })}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Button label={t("common.save")} loading={create.isPending} disabled={name.trim() === ""} onPress={() => create.mutate()} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: space.xl },
  fab: { position: "absolute", right: space.lg, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  editor: { flex: 1, padding: space.lg, gap: space.lg },
  label: { fontSize: 14, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
