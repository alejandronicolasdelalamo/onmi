import { cn, initials } from "@/lib/utils";

/** Círculo con las iniciales (decorativo: el nombre siempre aparece como texto al lado). */
export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
