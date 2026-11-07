/** Fecha local YYYY-MM-DD (la que el usuario ve en su calendario, no la de UTC). */
export function localISODate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function greetingKey(hour: number = new Date().getHours()): "morning" | "afternoon" | "evening" {
  return hour < 12 ? "morning" : hour < 19 ? "afternoon" : "evening";
}
