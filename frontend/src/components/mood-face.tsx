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

/** Caritas SVG propias (ligeras, sin dependencias, escalan a cualquier tamaño). */
export function MoodFace({
  mood,
  className,
  title,
}: {
  mood: MoodKind;
  className?: string;
  title?: string;
}) {
  const c = MOOD_COLORS[mood];
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-8", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle cx="24" cy="24" r="21" fill={c} />
      <g
        fill="#1f2937"
        stroke="#1f2937"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {mood === "love" ? (
          <>
            <path
              d="M15 19c0-2 3-3 4-1 1-2 4-1 4 1 0 2-4 5-4 5s-4-3-4-5z"
              fill="#be123c"
              stroke="none"
            />
            <path
              d="M25 19c0-2 3-3 4-1 1-2 4-1 4 1 0 2-4 5-4 5s-4-3-4-5z"
              fill="#be123c"
              stroke="none"
            />
          </>
        ) : (
          <>
            <circle cx="17" cy="20" r="2.4" stroke="none" />
            <circle cx="31" cy="20" r="2.4" stroke="none" />
          </>
        )}
        {mood === "happy" && (
          <path d="M15 28c2 6 16 6 18 0" fill="none" strokeWidth="2.6" />
        )}
        {mood === "love" && (
          <path d="M16 29c3 5 13 5 16 0" fill="none" strokeWidth="2.6" />
        )}
        {mood === "neutral" && (
          <path d="M17 32h14" fill="none" strokeWidth="2.6" />
        )}
        {mood === "mad" && (
          <>
            <path d="M13 14l8 4M35 14l-8 4" fill="none" strokeWidth="2.6" />
            <path d="M17 33c3-3 11-3 14 0" fill="none" strokeWidth="2.6" />
          </>
        )}
        {mood === "sad" && (
          <>
            <path d="M14 15l7-2M34 15l-7-2" fill="none" strokeWidth="2" />
            <path d="M17 34c3-4 11-4 14 0" fill="none" strokeWidth="2.6" />
          </>
        )}
      </g>
    </svg>
  );
}
