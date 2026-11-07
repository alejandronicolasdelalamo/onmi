import { memo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { space, TOUCH, useTheme } from "./theme";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export const Button = memo(function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const bg = { primary: c.primary, secondary: c.accent, danger: c.danger, ghost: "transparent" }[variant];
  const fg = { primary: c.onPrimary, secondary: c.accentText, danger: "#ffffff", ghost: c.primary }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
});

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const c = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...props}
        style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: error ? c.danger : c.border }, props.style]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: c.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  const c = useTheme();
  return (
    <View accessibilityRole="alert" style={[styles.banner, { borderColor: c.danger }]}>
      <Text style={{ color: c.danger, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  const c = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={{ color: c.muted, fontSize: 15, textAlign: "center" }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: TOUCH, borderRadius: 12, paddingHorizontal: space.xl, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 16, fontWeight: "600" },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: space.lg },
  field: { gap: space.xs },
  label: { fontSize: 14, fontWeight: "600" },
  input: { minHeight: TOUCH, borderWidth: 1, borderRadius: 10, paddingHorizontal: space.md, fontSize: 16 },
  error: { fontSize: 13 },
  banner: { borderWidth: 1, borderRadius: 10, padding: space.md },
  empty: { padding: space.xl * 2, alignItems: "center" },
});
