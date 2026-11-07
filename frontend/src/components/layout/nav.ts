import {
  BookOpen,
  CalendarCheck,
  FolderKanban,
  Home,
  Smile,
  Target,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";

export const NAV = [
  { to: "/", key: "dashboard", icon: Home, end: true },
  { to: "/notes", key: "notes", icon: BookOpen },
  { to: "/habits", key: "habits", icon: CalendarCheck },
  { to: "/projects", key: "projects", icon: FolderKanban },
  { to: "/goals", key: "goals", icon: Target },
  { to: "/mood", key: "mood", icon: Smile },
  { to: "/focus", key: "focus", icon: Timer },
  { to: "/insights", key: "insights", icon: TrendingUp },
  { to: "/buddies", key: "buddies", icon: Users },
] as const;
