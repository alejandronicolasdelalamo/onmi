import { cn } from "@/lib/utils";

export interface Ring {
  key: string;
  label: string;
  /** 0-1 */
  value: number;
  /** Clase de Tailwind `stroke-*` del anillo. */
  stroke: string;
  /** Texto corto junto a la leyenda (p. ej. "3/5"). */
  detail: string;
}

const WIDTH = 9;
const GAP = 3;
const OUTER = 56;

/** Anillos concéntricos de progreso (como los de Actividad de Apple). Se animan al llenarse. */
export function ProgressRings({
  rings,
  label,
  className,
}: {
  rings: Ring[];
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-5", className)}>
      <svg
        viewBox="0 0 120 120"
        className="size-32 shrink-0 -rotate-90"
        role="img"
        aria-label={`${label}: ${rings.map((r) => `${r.label} ${r.detail}`).join(", ")}`}
      >
        {rings.map((r, i) => {
          const radius = OUTER - i * (WIDTH + GAP);
          const len = 2 * Math.PI * radius;
          const value = Math.max(0, Math.min(1, r.value));
          return (
            <g key={r.key}>
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                strokeWidth={WIDTH}
                className={cn(r.stroke, "opacity-20")}
              />
              {value > 0 && (
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  strokeWidth={WIDTH}
                  strokeLinecap="round"
                  className={cn(r.stroke, "animate-ring")}
                  strokeDasharray={len}
                  strokeDashoffset={len * (1 - value)}
                  style={{ ["--ring-len" as string]: len }}
                />
              )}
            </g>
          );
        })}
      </svg>
      <ul className="min-w-0 space-y-2 text-sm">
        {rings.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                r.stroke.replace("stroke-", "bg-"),
              )}
            />
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium tabular-nums">{r.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
