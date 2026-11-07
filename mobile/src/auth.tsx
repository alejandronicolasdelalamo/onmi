import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, setSignedOutHandler } from "./api";
import { clearTokens, loadTokens, saveTokens } from "./tokens";
import type { AuthResponse, User } from "./types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  demo: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signedOut = useCallback(() => {
    setUser(null);
    qc.clear();
  }, [qc]);

  // Al abrir la app: si hay tokens guardados, recupera el usuario (el cliente renueva el access token si caducó).
  useEffect(() => {
    setSignedOutHandler(signedOut);
    let cancelled = false;
    (async () => {
      try {
        const { access } = await loadTokens();
        if (access) {
          const { user } = await api.get<{ user: User }>("/api/auth/me");
          if (!cancelled) setUser(user);
        }
      } catch (e) {
        // Sin red al arrancar se conserva la sesión guardada; con 401 el cliente ya limpió los tokens.
        if (!(e instanceof ApiError) || e.status !== 401) return;
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setSignedOutHandler(null);
    };
  }, [signedOut]);

  const start = useCallback(
    async (path: string, body?: unknown) => {
      const res = await api.post<AuthResponse>(path, body);
      await saveTokens(res.access_token, res.refresh_token);
      qc.clear();
      setUser(res.user);
    },
    [qc],
  );

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      login: (email, password) => start("/api/auth/login", { email, password }),
      register: (name, email, password) => start("/api/auth/register", { name, email, password }),
      demo: () => start("/api/auth/demo"),
      logout: async () => {
        await clearTokens();
        signedOut();
      },
    }),
    [user, loading, start, signedOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
