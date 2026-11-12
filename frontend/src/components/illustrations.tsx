import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

/**
 * Ilustraciones propias para los estados vacíos. Usan solo los colores del tema (acento, tarjeta y bordes),
 * así que siguen cualquier tema y color de acento. Son decorativas (aria-hidden).
 */
export type ArtName =
  | "notes"
  | "habits"
  | "projects"
  | "goals"
  | "calendar"
  | "trash"
  | "buddies"
  | "mood"
  | "lock"
  | "phone"
  | "generic";

const P = "fill-primary";
const PS = "fill-primary/20";
const C = "fill-card stroke-border";
const L = "stroke-muted-foreground/40";

const ARTS: Record<ArtName, ReactElement> = {
  notes: (
    <>
      <rect
        x="34"
        y="14"
        width="52"
        height="68"
        rx="7"
        className={C}
        strokeWidth="2"
      />
      <rect x="42" y="26" width="30" height="5" rx="2.5" className={P} />
      <rect x="42" y="38" width="36" height="3.5" rx="1.75" className={PS} />
      <rect x="42" y="47" width="32" height="3.5" rx="1.75" className={PS} />
      <rect x="42" y="56" width="22" height="3.5" rx="1.75" className={PS} />
      <path d="M84 52l9-9 6 6-9 9-8 2z" className={P} />
      <circle cx="26" cy="30" r="3" className={PS} />
      <circle cx="100" cy="22" r="2.5" className={PS} />
    </>
  ),
  habits: (
    <>
      <circle cx="60" cy="48" r="30" className={C} strokeWidth="2" />
      <circle cx="60" cy="48" r="22" className={PS} />
      <path
        d="M48 49l9 9 16-18"
        fill="none"
        className="stroke-primary"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M96 24c-4 5-1 8-1 8s6-1 6-7c3 2 5 6 4 10-1 5-5 7-9 7s-8-3-8-8c0-4 3-6 4-9 2 1 3 2 4-1z"
        className="fill-warning"
      />
      <circle cx="22" cy="70" r="3" className={PS} />
    </>
  ),
  projects: (
    <>
      <rect
        x="14"
        y="16"
        width="28"
        height="64"
        rx="6"
        className={C}
        strokeWidth="2"
      />
      <rect
        x="46"
        y="16"
        width="28"
        height="64"
        rx="6"
        className={C}
        strokeWidth="2"
      />
      <rect
        x="78"
        y="16"
        width="28"
        height="64"
        rx="6"
        className={C}
        strokeWidth="2"
      />
      <rect x="19" y="23" width="18" height="12" rx="3" className={P} />
      <rect x="19" y="39" width="18" height="12" rx="3" className={PS} />
      <rect x="51" y="23" width="18" height="12" rx="3" className={PS} />
      <rect
        x="83"
        y="23"
        width="18"
        height="12"
        rx="3"
        className="fill-success/40"
      />
    </>
  ),
  goals: (
    <>
      <circle cx="56" cy="50" r="34" className={C} strokeWidth="2" />
      <circle cx="56" cy="50" r="23" className={PS} />
      <circle cx="56" cy="50" r="12" className={C} strokeWidth="2" />
      <circle cx="56" cy="50" r="5" className={P} />
      <path
        d="M56 50L88 18"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M88 10v16l14-8z" className="fill-warning" />
    </>
  ),
  calendar: (
    <>
      <rect
        x="22"
        y="20"
        width="76"
        height="62"
        rx="8"
        className={C}
        strokeWidth="2"
      />
      <path d="M22 36h76v-8a8 8 0 00-8-8H30a8 8 0 00-8 8z" className={P} />
      <rect
        x="40"
        y="12"
        width="5"
        height="14"
        rx="2.5"
        className="fill-foreground/60"
      />
      <rect
        x="75"
        y="12"
        width="5"
        height="14"
        rx="2.5"
        className="fill-foreground/60"
      />
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect
            key={`${r}-${c}`}
            x={31 + c * 16}
            y={44 + r * 12}
            width="9"
            height="7"
            rx="2"
            className={r === 1 && c === 2 ? P : PS}
          />
        )),
      )}
    </>
  ),
  trash: (
    <>
      <path
        d="M36 32h48l-4 46a6 6 0 01-6 5H46a6 6 0 01-6-5z"
        className={C}
        strokeWidth="2"
      />
      <rect x="30" y="24" width="60" height="8" rx="4" className={P} />
      <rect x="50" y="17" width="20" height="8" rx="4" className={PS} />
      <path
        d="M50 44v28M60 44v28M70 44v28"
        className={L}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </>
  ),
  buddies: (
    <>
      <circle cx="42" cy="34" r="13" className={P} />
      <path d="M18 78c0-14 10-22 24-22s24 8 24 22z" className={PS} />
      <circle cx="80" cy="38" r="11" className="fill-warning/80" />
      <path
        d="M58 80c0-12 9-19 22-19s22 7 22 19z"
        className="fill-success/30"
      />
      <path
        d="M56 22c2-5 8-5 10 0 2-5 8-5 10 0 0 5-10 11-10 11s-10-6-10-11z"
        className="fill-destructive/70"
        transform="translate(-6 -8) scale(.7)"
      />
    </>
  ),
  mood: (
    <>
      <circle cx="60" cy="48" r="32" className="fill-warning/70" />
      <circle cx="49" cy="42" r="4" className="fill-foreground/80" />
      <circle cx="71" cy="42" r="4" className="fill-foreground/80" />
      <path
        d="M46 56c4 9 24 9 28 0"
        fill="none"
        className="stroke-foreground/80"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="96" cy="24" r="3" className={PS} />
      <circle cx="22" cy="68" r="4" className={PS} />
    </>
  ),
  lock: (
    <>
      <path
        d="M42 44V34a18 18 0 0136 0v10"
        fill="none"
        className="stroke-primary"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <rect x="32" y="44" width="56" height="40" rx="10" className={P} />
      <circle cx="60" cy="62" r="6" className="fill-card" />
      <rect x="57" y="64" width="6" height="12" rx="3" className="fill-card" />
      <circle cx="20" cy="30" r="3" className={PS} />
      <circle cx="102" cy="68" r="4" className={PS} />
    </>
  ),
  phone: (
    <>
      <rect
        x="38"
        y="8"
        width="44"
        height="80"
        rx="9"
        className={C}
        strokeWidth="2"
      />
      <rect x="44" y="18" width="32" height="56" rx="4" className={PS} />
      <rect x="49" y="26" width="22" height="5" rx="2.5" className={P} />
      <rect
        x="49"
        y="36"
        width="16"
        height="4"
        rx="2"
        className={P}
        opacity="0.5"
      />
      <circle cx="60" cy="82" r="2.5" className="fill-muted-foreground/50" />
      <path
        d="M92 30v-12m0 0l-5 5m5-5l5 5"
        fill="none"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  generic: (
    <>
      <rect
        x="30"
        y="22"
        width="60"
        height="56"
        rx="10"
        className={C}
        strokeWidth="2"
      />
      <path d="M60 36l4 9 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" className={P} />
      <circle cx="24" cy="30" r="3" className={PS} />
      <circle cx="98" cy="70" r="3" className={PS} />
    </>
  ),
};

export function Illustration({
  name,
  className,
}: {
  name: ArtName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 96"
      aria-hidden
      className={cn("h-28 w-auto", className)}
    >
      {ARTS[name]}
    </svg>
  );
}
