import { useId } from "react";
import { Switch } from "./switch";

/** Interruptor con título y explicación (privacidad: «compartir con mis compañeros»). */
export function ShareToggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
      <div className="space-y-0.5">
        <label
          htmlFor={id}
          className="block cursor-pointer text-sm font-medium"
        >
          {label}
        </label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-hint`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}
