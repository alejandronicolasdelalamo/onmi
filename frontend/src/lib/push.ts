/** Utilidades de Web Push en el navegador (suscripción al servicio push con la clave VAPID del servidor). */

export type PushFailure = "unsupported" | "denied";
export class PushError extends Error {
  constructor(public reason: PushFailure) {
    super(reason);
  }
}

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/** La clave pública VAPID viaja en base64url; `subscribe` la necesita como bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Registro del service worker; si no llega a activarse (p. ej. en desarrollo) falla en vez de quedarse esperando. */
async function readyRegistration(
  timeoutMs = 4000,
): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new PushError("unsupported")), timeoutMs),
    ),
  ]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Pide permiso y suscribe este navegador. Devuelve la suscripción lista para enviarla al servidor. */
export async function enablePush(
  publicKey: string,
): Promise<PushSubscriptionJSON> {
  if (!pushSupported()) throw new PushError("unsupported");
  if ((await Notification.requestPermission()) !== "granted")
    throw new PushError("denied");
  const reg = await readyRegistration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  return sub.toJSON();
}

/** Da de baja este navegador y devuelve su endpoint (para borrarlo también en el servidor). */
export async function disablePush(): Promise<string | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

export const browserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
