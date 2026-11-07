/// <reference lib="webworker" />
/**
 * Service worker de ONMi: precaché de la app (vite-plugin-pwa, modo injectManifest) y notificaciones push.
 * Las llamadas a la API nunca se cachean.
 */
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api/, /^\/docs/, /^\/db-admin/],
  }),
);

interface PushPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  const data: PushPayload = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "ONMi", {
      body: data.body,
      tag: data.tag, // una notificación por hábito: no se acumulan
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const open = clients.find((c) => "focus" in c);
        if (open) {
          void open.navigate(url);
          return open.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
