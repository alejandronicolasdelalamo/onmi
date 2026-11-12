import {
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";
import { api } from "./api";
import type { User } from "./types";

export const passkeysSupported = () => {
  try {
    return typeof window !== "undefined" && browserSupportsWebAuthn();
  } catch {
    return false;
  }
};

/** Inicia sesión con una passkey: el dispositivo pide Face ID / huella y el servidor verifica la firma. */
export async function signInWithPasskey(): Promise<User> {
  const { options, challenge_token } = await api.post<{
    options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
    challenge_token: string;
  }>("/api/auth/passkeys/login/options");
  const credential = await startAuthentication({ optionsJSON: options });
  const { user } = await api.post<{ user: User }>(
    "/api/auth/passkeys/login/verify",
    { credential, challenge_token },
  );
  return user;
}
