import * as SecureStore from "expo-secure-store";

/**
 * Tokens de sesión en el almacén seguro del sistema (Keychain en iOS, Keystore en Android),
 * nunca en AsyncStorage. Se mantiene una copia en memoria para no leer del disco en cada petición.
 */
const ACCESS = "onmi.access";
const REFRESH = "onmi.refresh";

export interface Tokens {
  access: string | null;
  refresh: string | null;
}

let memory: Tokens = { access: null, refresh: null };

export async function loadTokens(): Promise<Tokens> {
  const [access, refresh] = await Promise.all([SecureStore.getItemAsync(ACCESS), SecureStore.getItemAsync(REFRESH)]);
  memory = { access, refresh };
  return memory;
}

export const getTokens = (): Tokens => memory;

export async function saveTokens(access: string, refresh?: string): Promise<void> {
  memory = { access, refresh: refresh ?? memory.refresh };
  await SecureStore.setItemAsync(ACCESS, access);
  if (refresh) await SecureStore.setItemAsync(REFRESH, refresh);
}

export async function clearTokens(): Promise<void> {
  memory = { access: null, refresh: null };
  await Promise.all([SecureStore.deleteItemAsync(ACCESS), SecureStore.deleteItemAsync(REFRESH)]);
}
