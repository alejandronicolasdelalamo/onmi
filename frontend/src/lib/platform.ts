/** Detección de plataforma para adaptar guías y funciones a iPhone/iPad. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS se presenta como Mac, pero con pantalla táctil.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** ¿Está abierta desde el icono de la pantalla de inicio (PWA instalada) y no desde Safari? */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

/** iPhone o iPad usando Safari sin haber instalado la app: aquí no hay notificaciones ni insignia. */
export function needsIOSInstall(): boolean {
  return isIOS() && !isStandalone();
}
