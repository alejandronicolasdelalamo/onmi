import { toast } from "sonner";
import i18n from "./i18n";

export const MILESTONES = [7, 14, 30, 60, 100, 200, 365] as const;

/** Devuelve el hito alcanzado, o null. Solo se celebra al completar el día, no al deshacer. */
export function milestoneFor(
  streak: number,
  justCompleted: boolean,
): number | null {
  return justCompleted && (MILESTONES as readonly number[]).includes(streak)
    ? streak
    : null;
}

const COLORS = [
  "#6366f1",
  "#f97316",
  "#14b8a6",
  "#ec4899",
  "#eab308",
  "#3b82f6",
];

/** Confeti con canvas (sin dependencias). Un único momento breve; se omite con `prefers-reduced-motion`. */
function confetti() {
  if (
    typeof window === "undefined" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  )
    return;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "100",
  });
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const parts = Array.from({ length: 110 }, () => ({
    x: window.innerWidth / 2 + (Math.random() - 0.5) * 140,
    y: window.innerHeight * 0.4,
    vx: (Math.random() - 0.5) * 15,
    vy: -Math.random() * 13 - 4,
    w: Math.random() * 7 + 4,
    h: Math.random() * 4 + 3,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
  }));

  const start = performance.now();
  let last = start;
  const tick = (now: number) => {
    const dt = Math.min(32, now - last) / 16;
    last = now;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const fade = Math.max(0, 1 - (now - start - 1400) / 800);
    for (const p of parts) {
      p.vy += 0.38 * dt;
      p.vx *= 0.995;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (now - start < 2200) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}

export function celebrate(streak: number, habitName: string) {
  toast.success(i18n.t("celebrate.title", { count: streak }), {
    description: i18n.t("celebrate.description", { name: habitName }),
    duration: 5000,
  });
  confetti();
}
