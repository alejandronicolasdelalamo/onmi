/** Tono (0-360) estable para una etiqueta: la misma etiqueta siempre sale del mismo color. */
export function tagHue(tag: string): number {
  let h = 0;
  for (const ch of tag.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Primera imagen propia citada en el contenido de una nota (o null). */
export function firstImageId(content: string): number | null {
  const m = /onmi-image:(\d+)/.exec(content);
  return m ? Number(m[1]) : null;
}
