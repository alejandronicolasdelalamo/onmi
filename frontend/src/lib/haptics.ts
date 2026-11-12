/**
 * Respuesta háptica ligera. Android/Chrome usan `vibrate`; Safari de iPhone no lo tiene, pero (iOS 18+) un
 * interruptor nativo `<input type="checkbox" switch>` produce un toque háptico al activarse. Donde no hay nada
 * disponible no hace nada. Se respeta "reducir movimiento".
 */
let probe: HTMLInputElement | null = null;

export function haptic() {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
      return;
    }
    if (!probe) {
      probe = document.createElement("input");
      probe.type = "checkbox";
      probe.setAttribute("switch", "");
      probe.setAttribute("aria-hidden", "true");
      probe.tabIndex = -1;
      probe.style.cssText =
        "position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none";
      document.body.appendChild(probe);
    }
    probe.click();
  } catch {
    /* sin háptica */
  }
}
