import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useDeferredValue, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError } from "../api";
import { keys, useNotes } from "../hooks";
import { errorText, t } from "../i18n";
import type { NoteEditorProps, RootNav } from "../navigation-types";
import { space, TOUCH, useTheme } from "../theme";
import type { Note } from "../types";
import { Button, EmptyState, ErrorBanner, Field } from "../ui";

/** Texto plano de un fragmento Markdown para la vista previa de la lista. */
export const snippet = (md: string) => md.replace(/```[\s\S]*?```/g, " ").replace(/[#*`>_~[\]()-]/g, "").replace(/\s+/g, " ").trim();

const NoteRow = memo(function NoteRow({ note, onOpen }: { note: Note; onOpen: (id: number) => void }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(note.id)}
      style={({ pressed }) => [styles.row, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.rowHead}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: c.text }]}>
          {note.title}
        </Text>
        {note.pinned ? <Ionicons name="pin" size={16} color={c.primary} accessibilityLabel="Pinned" /> : null}
      </View>
      <Text numberOfLines={2} style={{ color: c.muted, fontSize: 14 }}>
        {snippet(note.content) || "—"}
      </Text>
    </Pressable>
  );
});

export function NotesScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<RootNav>();
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());
  const notes = useNotes(query);
  const onOpen = useCallback((id: number) => navigation.navigate("NoteEditor", { id }), [navigation]);
  const renderItem = useCallback(({ item }: { item: Note }) => <NoteRow note={item} onOpen={onOpen} />, [onOpen]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Field label={t("notes.search")} value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" returnKeyType="search" />
      </View>
      {notes.isPending ? (
        <ActivityIndicator style={styles.center} color={c.primary} accessibilityLabel={t("common.loading")} />
      ) : notes.isError ? (
        <View style={styles.center}>
          <ErrorBanner message={errorText(notes.error instanceof ApiError ? notes.error.code : undefined)} />
          <Button label={t("common.retry")} onPress={() => void notes.refetch()} style={{ marginTop: space.lg }} />
        </View>
      ) : (
        <FlashList
          data={notes.data}
          renderItem={renderItem}
          keyExtractor={(n) => String(n.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + TOUCH * 2 }}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          ListEmptyComponent={<EmptyState text={t("notes.empty")} />}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("notes.new")}
        onPress={() => navigation.navigate("NoteEditor")}
        style={[styles.fab, { backgroundColor: c.primary, bottom: insets.bottom + space.lg }]}
      >
        <Ionicons name="add" size={28} color={c.onPrimary} />
      </Pressable>
    </View>
  );
}

export function NoteEditorScreen({ route, navigation }: NoteEditorProps) {
  const c = useTheme();
  const qc = useQueryClient();
  const id = route.params?.id;
  const existing = useQuery({ queryKey: ["note", id], queryFn: () => api.get<Note>(`/api/notes/${id}`), enabled: id !== undefined });
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Rellena el formulario cuando llega la nota guardada (solo una vez).
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (existing.data && !loaded) {
      setTitle(existing.data.title);
      setContent(existing.data.content);
      setLoaded(true);
    }
  }, [existing.data, loaded]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["notes"] });
    void qc.invalidateQueries({ queryKey: keys.dashboard });
  };
  const save = useMutation({
    mutationFn: () =>
      id === undefined
        ? api.post("/api/notes", { title: title.trim(), content })
        : api.patch(`/api/notes/${id}`, { title: title.trim(), content }),
    onSuccess: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: ["note", id] });
      navigation.goBack();
    },
    onError: (e) => setError(errorText(e instanceof ApiError ? e.code : undefined)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/notes/${id}`),
    onSuccess: () => {
      refresh();
      navigation.goBack();
    },
  });
  const confirmDelete = () =>
    Alert.alert(t("notes.deleteTitle"), t("notes.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => remove.mutate() },
    ]);

  return (
    <View style={[styles.editor, { backgroundColor: c.background }]}>
      {error ? <ErrorBanner message={error} /> : null}
      <Field label={t("notes.title")} value={title} onChangeText={setTitle} maxLength={150} autoFocus={id === undefined} />
      <Field
        label={t("notes.content")}
        value={content}
        onChangeText={setContent}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 220, paddingTop: space.md }}
      />
      <Button label={t("common.save")} loading={save.isPending} disabled={title.trim() === ""} onPress={() => save.mutate()} />
      {id !== undefined ? <Button label={t("common.delete")} variant="danger" loading={remove.isPending} onPress={confirmDelete} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: space.xl },
  row: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: space.lg, gap: space.xs, minHeight: TOUCH },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: "600" },
  fab: { position: "absolute", right: space.lg, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  editor: { flex: 1, padding: space.lg, gap: space.lg },
});
