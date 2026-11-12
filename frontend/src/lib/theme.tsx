import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "midnight" | "system";
export const ACCENTS = [
  "indigo",
  "blue",
  "teal",
  "green",
  "amber",
  "rose",
  "pink",
] as const;
export type Accent = (typeof ACCENTS)[number];
const KEY = "onmi-theme";
const ACCENT_KEY = "onmi-accent";

function systemDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function readStored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "midnight" ? v : "system";
  } catch {
    return "system";
  }
}

function readAccent(): Accent {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    return ACCENTS.includes(v as Accent) ? (v as Accent) : "indigo";
  } catch {
    return "indigo";
  }
}

interface ThemeCtx {
  theme: Theme;
  accent: Accent;
  setAccent: (a: Accent) => void;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored);
  const [sysDark, setSysDark] = useState(systemDark);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => setSysDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" =
    theme === "system"
      ? sysDark
        ? "dark"
        : "light"
      : theme === "light"
        ? "light"
        : "dark";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.classList.toggle("midnight", theme === "midnight");
    document.documentElement.style.colorScheme = resolved;
  }, [resolved, theme]);

  const [accent, setAccentState] = useState<Accent>(readAccent);
  useEffect(() => {
    if (accent === "indigo") delete document.documentElement.dataset.accent;
    else document.documentElement.dataset.accent = accent;
  }, [accent]);
  const setAccent = useCallback((a: Accent) => {
    setAccentState(a);
    try {
      if (a === "indigo") localStorage.removeItem(ACCENT_KEY);
      else localStorage.setItem(ACCENT_KEY, a);
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      if (t === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  const toggle = useCallback(
    () => setTheme(resolved === "dark" ? "light" : "dark"),
    [resolved, setTheme],
  );

  const value = useMemo(
    () => ({ theme, accent, setAccent, resolved, setTheme, toggle }),
    [theme, accent, setAccent, resolved, setTheme, toggle],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
