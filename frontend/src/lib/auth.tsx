import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import i18n from "./i18n";
import { api, ApiError } from "./api";
import type { PublicConfig, User } from "./types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  google: (credential: string) => Promise<User>;
  demo: () => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthCtx | null>(null);
export const ME_KEY = ["me"] as const;

/** Borra los datos del usuario anterior pero conserva la query de sesión (`me`) y su observador. */
function resetUserData(qc: QueryClient) {
  qc.removeQueries({
    predicate: (q) =>
      q.queryKey[0] !== ME_KEY[0] && q.queryKey[0] !== "public-config",
  });
}

/** Cambia el idioma y, si hay sesión, lo guarda en el perfil para que sobreviva a recargas. */
export function useSetLanguage() {
  const { user, setUser } = useAuth();
  return useCallback(
    (locale: "en" | "es") => {
      void i18n.changeLanguage(locale);
      if (user && user.locale !== locale) {
        setUser({ ...user, locale });
        api
          .patch<{ user: User }>("/api/auth/me", { locale })
          .catch(() => undefined);
      }
    },
    [user, setUser],
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const { data: user = null, isPending } = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>("/api/auth/me")).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  // El idioma guardado en el perfil manda al iniciar sesión.
  useEffect(() => {
    if (user?.locale && !i18n.language?.startsWith(user.locale))
      void i18n.changeLanguage(user.locale);
  }, [user?.locale]);

  const setUser = useCallback((u: User) => qc.setQueryData(ME_KEY, u), [qc]);

  const session = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      api.post<{ user: User }>(path, body),
    onSuccess: ({ user }) => {
      resetUserData(qc);
      qc.setQueryData(ME_KEY, user);
    },
  });

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading: isPending,
      login: async (email, password) =>
        (
          await session.mutateAsync({
            path: "/api/auth/login",
            body: { email, password },
          })
        ).user,
      register: async (name, email, password) =>
        (
          await session.mutateAsync({
            path: "/api/auth/register",
            body: { name, email, password },
          })
        ).user,
      google: async (credential) =>
        (
          await session.mutateAsync({
            path: "/api/auth/google",
            body: { credential },
          })
        ).user,
      demo: async () =>
        (await session.mutateAsync({ path: "/api/auth/demo" })).user,
      logout: async () => {
        await api.post("/api/auth/logout").catch(() => undefined);
        resetUserData(qc);
        qc.setQueryData(ME_KEY, null);
      },
      setUser,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, isPending, session.mutateAsync, qc, setUser],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function usePublicConfig() {
  return useQuery({
    queryKey: ["public-config"],
    queryFn: () => api.get<PublicConfig>("/api/auth/config"),
    staleTime: Infinity,
    retry: false,
  });
}
