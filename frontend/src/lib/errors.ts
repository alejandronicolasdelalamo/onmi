import type { TFunction } from "i18next";
import { ApiError } from "./api";

/** Mensaje traducido para un error de la API usando su `code` estable. */
export function errorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    const translated = t(key, { defaultValue: "" });
    if (translated) return translated;
  }
  return t("errors.generic");
}

/** Errores de validación por campo: { email: "..." } */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError && err.details) {
    return Object.fromEntries(err.details.map((d) => [d.field, d.message]));
  }
  return {};
}
