import { useColorScheme } from "react-native";
import type { MoodKind } from "./types";

/** Misma paleta índigo que la web, con modo claro y oscuro (sigue el ajuste del sistema). */
const light = {
  background: "#fafaff",
  card: "#ffffff",
  border: "#e7e7f0",
  text: "#1e1b3a",
  muted: "#6b6b85",
  primary: "#5b5bd6",
  onPrimary: "#ffffff",
  accent: "#eeeeff",
  accentText: "#3b3ba8",
  danger: "#d92d20",
  success: "#16794a",
};
const dark: typeof light = {
  background: "#11111c",
  card: "#1b1b2b",
  border: "#2e2e44",
  text: "#f1f1f8",
  muted: "#a3a3bd",
  primary: "#8b8bf0",
  onPrimary: "#11111c",
  accent: "#2a2a4a",
  accentText: "#d6d6ff",
  danger: "#f97066",
  success: "#4ade80",
};

export type Palette = typeof light;
export const useTheme = (): Palette & { isDark: boolean } => {
  const isDark = useColorScheme() === "dark";
  return { ...(isDark ? dark : light), isDark };
};

export const MOOD_COLORS: Record<MoodKind, string> = {
  happy: "#facc15",
  love: "#f472b6",
  neutral: "#94a3b8",
  mad: "#f87171",
  sad: "#60a5fa",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
/** Tamaño mínimo táctil recomendado por iOS (44 pt) y Android (48 dp). */
export const TOUCH = 48;
