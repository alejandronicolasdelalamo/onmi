import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { API_URL } from "../api";
import { useAuth } from "../auth";
import { t } from "../i18n";
import { space, useTheme } from "../theme";
import { Button, Card } from "../ui";

export function SettingsScreen() {
  const c = useTheme();
  const { user, logout } = useAuth();
  const confirmSignOut = () =>
    Alert.alert(t("auth.signOut"), t("auth.signOutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("auth.signOut"), style: "destructive", onPress: () => void logout() },
    ]);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Card style={{ gap: space.xs }}>
        <Text style={[styles.section, { color: c.muted }]}>{t("settings.account")}</Text>
        <Text style={[styles.name, { color: c.text }]}>{user?.name}</Text>
        <Text style={{ color: c.muted, fontSize: 15 }}>{user?.email}</Text>
        {user?.is_demo ? <Text style={{ color: c.muted, fontSize: 13, marginTop: space.sm }}>{t("settings.demoNote")}</Text> : null}
      </Card>
      <Card style={{ gap: space.xs }}>
        <Text style={[styles.section, { color: c.muted }]}>{t("settings.server")}</Text>
        <Text selectable style={{ color: c.text, fontSize: 14 }}>
          {API_URL}
        </Text>
      </Card>
      <View>
        <Button label={t("auth.signOut")} variant="danger" onPress={confirmSignOut} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg },
  section: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  name: { fontSize: 20, fontWeight: "700" },
});
