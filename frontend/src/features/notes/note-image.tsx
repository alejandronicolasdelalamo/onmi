import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fetchBlob } from "@/lib/api";
import { useNotesUnlocked } from "@/lib/notes-lock";

/** Miniatura cuadrada para las tarjetas de la lista. */
export function NoteThumb({ id }: { id: number }) {
  const unlocked = useNotesUnlocked();
  const { data } = useQuery({
    queryKey: ["notes", "image", id, unlocked],
    queryFn: async () =>
      URL.createObjectURL(await fetchBlob(`/api/notes/images/${id}`)),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
  });
  return data ? (
    <img
      src={data}
      alt=""
      loading="lazy"
      className="size-16 shrink-0 rounded-md border border-border object-cover"
    />
  ) : (
    <span
      className="size-16 shrink-0 animate-pulse rounded-md bg-muted"
      aria-hidden
    />
  );
}

/**
 * Imagen de una nota. Se descarga con la sesión (y el desbloqueo si la nota está oculta) y se muestra desde
 * memoria; la clave empieza por "notes" para que al volver a bloquear se descarte de la caché.
 */
export function NoteImage({ id, alt }: { id: number; alt?: string }) {
  const { t } = useTranslation();
  const unlocked = useNotesUnlocked();
  const { data, isError } = useQuery({
    queryKey: ["notes", "image", id, unlocked],
    queryFn: async () =>
      URL.createObjectURL(await fetchBlob(`/api/notes/images/${id}`)),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
  });
  if (isError)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
        <ImageOff className="size-3.5" aria-hidden />{" "}
        {t("notes.image.unavailable")}
      </span>
    );
  if (!data)
    return (
      <span
        className="block h-32 w-full max-w-sm animate-pulse rounded-md bg-muted"
        aria-hidden
      />
    );
  return (
    <img
      src={data}
      alt={alt ?? ""}
      loading="lazy"
      className="my-2 max-h-96 max-w-full rounded-md border border-border"
    />
  );
}
