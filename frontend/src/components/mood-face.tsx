import { useId } from "react";
import type { MoodKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export const MOODS: MoodKind[] = ["happy", "love", "neutral", "mad", "sad"];

export const MOOD_COLORS: Record<MoodKind, string> = {
  happy: "#facc15",
  love: "#f472b6",
  neutral: "#94a3b8",
  mad: "#f87171",
  sad: "#60a5fa",
};

/** Tono más claro y más oscuro de cada color, para el degradado del rostro. */
const SHADES: Record<MoodKind, [string, string]> = {
  happy: ["#fde68a", "#f59e0b"],
  love: ["#fbcfe8", "#ec4899"],
  neutral: ["#e2e8f0", "#64748b"],
  mad: ["#fecaca", "#dc2626"],
  sad: ["#bfdbfe", "#2563eb"],
};

const INK = "#1f2937";

function Eyes({ mood }: { mood: MoodKind }) {
  if (mood === "love")
    return (
      <g className="mf-eyes mf-heartbeat">
        <path
          d="M12.5 19.5c0-2.6 3.8-3.8 5-1 1.2-2.8 5-1.6 5 1 0 2.8-5 6-5 6s-5-3.2-5-6z"
          fill="#be123c"
        />
        <path
          d="M25.5 19.5c0-2.6 3.8-3.8 5-1 1.2-2.8 5-1.6 5 1 0 2.8-5 6-5 6s-5-3.2-5-6z"
          fill="#be123c"
        />
        <circle cx="15.2" cy="18.6" r="1" fill="#fff" opacity=".85" />
        <circle cx="28.2" cy="18.6" r="1" fill="#fff" opacity=".85" />
      </g>
    );
  if (mood === "happy")
    // Ojos felices: arcos que se cierran hacia arriba.
    return (
      <g
        className="mf-eyes"
        fill="none"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinecap="round"
      >
        <path d="M13.5 21c1.2-3 5.8-3 7 0" />
        <path d="M27.5 21c1.2-3 5.8-3 7 0" />
      </g>
    );
  const droop = mood === "sad" ? 0.6 : 0;
  return (
    <g className={cn("mf-eyes", mood === "neutral" && "mf-look")}>
      <ellipse cx="17" cy={20.5 + droop} rx="2.7" ry="3.1" fill={INK} />
      <ellipse cx="31" cy={20.5 + droop} rx="2.7" ry="3.1" fill={INK} />
      <circle cx="18" cy={19.4 + droop} r="1" fill="#fff" />
      <circle cx="32" cy={19.4 + droop} r="1" fill="#fff" />
    </g>
  );
}

function Mouth({ mood }: { mood: MoodKind }) {
  const common = {
    fill: "none",
    stroke: INK,
    strokeWidth: 2.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (mood) {
    case "happy":
      return (
        <g className="mf-mouth">
          <path
            d="M14 28c1 7 19 7 20 0z"
            fill="#7f1d1d"
            stroke={INK}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path d="M18 32.6c3-2 9-2 12 0-2 3-10 3-12 0z" fill="#fb7185" />
        </g>
      );
    case "love":
      return (
        <path className="mf-mouth" d="M16 29.5c3 5 13 5 16 0" {...common} />
      );
    case "neutral":
      return <path className="mf-mouth" d="M17 32h14" {...common} />;
    case "mad":
      return (
        <path className="mf-mouth" d="M16.5 34c3-4 12-4 15 0" {...common} />
      );
    case "sad":
      return (
        <path className="mf-mouth" d="M17 35c3-4.5 11-4.5 14 0" {...common} />
      );
  }
}

function Brows({ mood }: { mood: MoodKind }) {
  const p = {
    fill: "none",
    stroke: INK,
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
  };
  if (mood === "mad")
    return (
      <g className="mf-brows">
        <path d="M11.5 13.5l9 4.2" {...p} />
        <path d="M36.5 13.5l-9 4.2" {...p} />
      </g>
    );
  if (mood === "sad")
    return (
      <g className="mf-brows">
        <path d="M12 16.5l8-3" {...p} strokeWidth="2" />
        <path d="M36 16.5l-8-3" {...p} strokeWidth="2" />
      </g>
    );
  if (mood === "neutral")
    return (
      <g className="mf-brows">
        <path d="M13 14.5h8M27 14.5h8" {...p} strokeWidth="2" opacity=".7" />
      </g>
    );
  return null;
}

/** Detalles que solo existen en una emoción (lágrima, vapor, corazones, destellos). */
function Extras({ mood, uid }: { mood: MoodKind; uid: string }) {
  switch (mood) {
    case "sad":
      return (
        <path
          className="mf-tear"
          d="M31.5 25.5c-1.6 2.6-2.4 3.7-2.4 5a2.4 2.4 0 004.8 0c0-1.3-.8-2.4-2.4-5z"
          fill="#93c5fd"
          stroke="#2563eb"
          strokeWidth=".6"
        />
      );
    case "mad":
      return (
        <g
          className="mf-steam"
          fill="none"
          stroke="#fca5a5"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M8 8c-2-2 1-3-1-5" />
          <path d="M40 8c2-2-1-3 1-5" />
        </g>
      );
    case "love":
      return (
        <g className="mf-hearts" fill="#fb7185">
          <path
            className="mf-h1"
            d="M40 12c0-1.6 2.3-2.2 3-.6.7-1.6 3-1 3 .6 0 1.7-3 3.6-3 3.6s-3-1.9-3-3.6z"
          />
          <path
            className="mf-h2"
            d="M2 14c0-1.2 1.7-1.7 2.2-.4.5-1.3 2.2-.8 2.2.4 0 1.3-2.2 2.7-2.2 2.7S2 15.3 2 14z"
          />
        </g>
      );
    case "happy":
      return (
        <g className="mf-sparkles" fill="#fff" opacity=".95">
          <path
            className="mf-s1"
            d="M39 9l1 2.6L42.6 12.6 40 13.6 39 16.2 38 13.6 35.4 12.6 38 11.6z"
          />
          <path
            className="mf-s2"
            d="M8 6l.7 1.8L10.5 8.5 8.7 9.2 8 11 7.3 9.2 5.5 8.5 7.3 7.8z"
          />
        </g>
      );
    default:
      return <g data-uid={uid} />;
  }
}

/**
 * Caritas SVG propias: degradado, mejillas, brillos, cejas y detalles por emoción (lágrima, vapor, corazones,
 * destellos). Con `animated` respiran, parpadean y reaccionan; en listas se dejan quietas. Sin dependencias.
 */
export function MoodFace({
  mood,
  className,
  title,
  animated = false,
}: {
  mood: MoodKind;
  className?: string;
  title?: string;
  animated?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const [light, dark] = SHADES[mood];
  return (
    <svg
      viewBox="-4 -4 56 56"
      className={cn("mf size-8 overflow-visible", className)}
      data-mood={mood}
      data-animated={animated ? "true" : "false"}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <radialGradient id={`g${uid}`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={MOOD_COLORS[mood]} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
      </defs>
      <g className="mf-body">
        <circle cx="24" cy="24" r="21" fill={`url(#g${uid})`} />
        <ellipse
          cx="16"
          cy="11"
          rx="8"
          ry="4"
          fill="#fff"
          opacity=".28"
          transform="rotate(-25 16 11)"
        />
        {mood !== "mad" && (
          <>
            <ellipse
              cx="10.5"
              cy="28.5"
              rx="3.4"
              ry="2.2"
              fill="#fb7185"
              opacity=".42"
            />
            <ellipse
              cx="37.5"
              cy="28.5"
              rx="3.4"
              ry="2.2"
              fill="#fb7185"
              opacity=".42"
            />
          </>
        )}
        <Brows mood={mood} />
        <Eyes mood={mood} />
        <Mouth mood={mood} />
      </g>
      <Extras mood={mood} uid={uid} />
    </svg>
  );
}

const BURST_COUNT = 10;

/** Pequeña explosión de partículas propias de cada emoción; se relanza cambiando `nonce`. */
export function MoodBurst({
  mood,
  nonce,
  className,
}: {
  mood: MoodKind;
  nonce: number;
  className?: string;
}) {
  if (nonce === 0) return null;
  return (
    <span
      key={`${mood}-${nonce}`}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      {Array.from({ length: BURST_COUNT }, (_, i) => {
        const angle = (360 / BURST_COUNT) * i + (i % 2 ? 12 : -8);
        return (
          <span
            key={i}
            className="mf-particle absolute left-1/2 top-1/2 block"
            data-mood={mood}
            style={
              {
                "--a": `${angle}deg`,
                "--d": `${46 + (i % 3) * 14}px`,
                "--delay": `${(i % 4) * 35}ms`,
                background: mood === "love" ? "transparent" : MOOD_COLORS[mood],
              } as React.CSSProperties
            }
          >
            {mood === "love" ? "♥" : null}
          </span>
        );
      })}
    </span>
  );
}
