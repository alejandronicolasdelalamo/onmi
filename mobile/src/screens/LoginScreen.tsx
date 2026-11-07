import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { errorText, t } from "../i18n";
import { space, useTheme } from "../theme";
import { Button, ErrorBanner, Field } from "../ui";

export function LoginScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { login, register, demo } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"form" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "form" | "demo", action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e instanceof ApiError ? e.code : undefined));
    } finally {
      setBusy(null);
    }
  }

  const canSubmit = email.trim() !== "" && password !== "" && (mode === "login" || name.trim() !== "");

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl * 2, paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.logo, { backgroundColor: c.primary }]} accessibilityElementsHidden importantForAccessibility="no">
          <View style={[styles.logoRing, { borderColor: c.onPrimary }]} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>
          {t("auth.title")}
        </Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>{t("auth.subtitle")}</Text>

        <View style={styles.form}>
          {error ? <ErrorBanner message={error} /> : null}
          {mode === "register" ? (
            <Field label={t("auth.name")} value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
          ) : null}
          <Field
            label={t("auth.email")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <Field
            label={t("auth.password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            textContentType={mode === "login" ? "password" : "newPassword"}
            onSubmitEditing={() => canSubmit && run("form", () => (mode === "login" ? login(email.trim(), password) : register(name.trim(), email.trim(), password)))}
          />
          <Button
            label={mode === "login" ? t("auth.signIn") : t("auth.signUp")}
            loading={busy === "form"}
            disabled={!canSubmit || busy === "demo"}
            onPress={() =>
              run("form", () => (mode === "login" ? login(email.trim(), password) : register(name.trim(), email.trim(), password)))
            }
          />
          <Button label={t("auth.demo")} variant="secondary" loading={busy === "demo"} disabled={busy === "form"} onPress={() => run("demo", demo)} />
          <Button
            label={mode === "login" ? t("auth.toRegister") : t("auth.toLogin")}
            variant="ghost"
            onPress={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, gap: space.sm, alignItems: "stretch" },
  logo: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: space.lg },
  logoRing: { width: 28, height: 28, borderRadius: 14, borderWidth: 6 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 16, marginBottom: space.lg },
  form: { gap: space.lg },
});
