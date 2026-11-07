import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface GoogleId {
  initialize: (cfg: {
    client_id: string;
    callback: (r: { credential: string }) => void;
  }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SRC = "https://accounts.google.com/gsi/client";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SRC}"]`,
    );
    const el =
      existing ??
      Object.assign(document.createElement("script"), {
        src: SRC,
        async: true,
        defer: true,
      });
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () => reject(new Error("google script")));
    if (!existing) document.head.appendChild(el);
  });
}

/** Botón oficial de Google Identity Services. Solo se monta si el backend tiene GOOGLE_CLIENT_ID. */
export function GoogleButton({
  clientId,
  onCredential,
}: {
  clientId: string;
  onCredential: (credential: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { i18n } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => onCredential(r.credential),
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: "outline",
          size: "large",
          width: 320,
          text: "continue_with",
          locale: i18n.language?.startsWith("es") ? "es" : "en",
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential, i18n.language]);

  return <div ref={ref} className="flex min-h-10 justify-center" />;
}
