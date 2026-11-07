import { lazy, Suspense, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "@/features/auth/pages";

import { RouteEffects } from "@/components/route-effects";
// Las vistas pesadas (gráficas, drag & drop, markdown) se cargan bajo demanda.
const HabitsPage = lazy(() =>
  import("@/features/habits/habits-page").then((m) => ({
    default: m.HabitsPage,
  })),
);
const NotesPage = lazy(() =>
  import("@/features/notes/notes-page").then((m) => ({ default: m.NotesPage })),
);
const ProjectsPage = lazy(() =>
  import("@/features/projects/projects-page").then((m) => ({
    default: m.ProjectsPage,
  })),
);
const GoalsPage = lazy(() =>
  import("@/features/goals/goals-page").then((m) => ({ default: m.GoalsPage })),
);
const MoodPage = lazy(() =>
  import("@/features/mood/mood-page").then((m) => ({ default: m.MoodPage })),
);
const PomodoroPage = lazy(() =>
  import("@/features/pomodoro/pomodoro-page").then((m) => ({
    default: m.PomodoroPage,
  })),
);
const ProfilePage = lazy(() =>
  import("@/features/profile/profile-page").then((m) => ({
    default: m.ProfilePage,
  })),
);
const AdminPage = lazy(() =>
  import("@/features/admin/admin-page").then((m) => ({ default: m.AdminPage })),
);

function FullScreenLoader() {
  return (
    <div
      className="grid min-h-dvh place-items-center"
      role="status"
      aria-label="Loading"
    >
      <Skeleton className="size-10 rounded-xl" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return user ? children : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === "admin" ? children : <Navigate to="/" replace />;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return user ? <Navigate to="/" replace /> : children;
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[60dvh] place-items-center text-center">
      <div className="space-y-3">
        <p className="text-6xl font-bold text-primary">404</p>
        <h1 className="text-xl font-semibold">{t("notFound.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("notFound.desc")}</p>
        <Button asChild>
          <Link to="/">{t("notFound.home")}</Link>
        </Button>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <LoginPage />
            </GuestOnly>
          }
        />
        <Route
          path="/register"
          element={
            <GuestOnly>
              <RegisterPage />
            </GuestOnly>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestOnly>
              <ForgotPasswordPage />
            </GuestOnly>
          }
        />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="habits" element={<HabitsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="mood" element={<MoodPage />} />
          <Route path="focus" element={<PomodoroPage />} />
          <Route path="settings" element={<ProfilePage />} />
          <Route
            path="admin"
            element={
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteEffects />
      <AppRoutes />
    </BrowserRouter>
  );
}
