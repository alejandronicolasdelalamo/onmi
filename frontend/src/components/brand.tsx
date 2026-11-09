import { useId } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  // Id único por instancia: si el primer logo está dentro de un contenedor `display: none`
  // (la barra lateral en móvil), un degradado compartido no se pinta en los demás.
  const gradient = `onmi-g-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradient})`} />
      <circle
        cx="32"
        cy="32"
        r="14"
        fill="none"
        stroke="#fff"
        strokeWidth="6"
      />
      <circle cx="32" cy="32" r="4.5" fill="#fff" />
    </svg>
  );
}

export function Logo({
  className,
  iconOnly,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-semibold tracking-tight",
        className,
      )}
    >
      <LogoMark />
      {!iconOnly && <span className="text-lg">ONMi</span>}
    </span>
  );
}
