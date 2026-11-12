/** Preparación de imágenes para las notas: se reducen y comprimen en el dispositivo antes de subirlas. */
export const MAX_SIDE = 1600;
export const MAX_BYTES = 1_400_000;

/** Tamaño final manteniendo la proporción y sin pasar de `max` en el lado mayor (nunca amplía). */
export function fitWithin(width: number, height: number, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // `from-image` respeta la orientación EXIF (las fotos del iPhone vienen "giradas" en los metadatos).
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* se prueba con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Devuelve un JPEG de como mucho 1600 px y ~1,4 MB (los PNG con transparencia quedan sobre fondo blanco). */
export async function prepareImage(file: Blob): Promise<Blob> {
  const src = await decode(file);
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  const { width, height } = fitWithin(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(src, 0, 0, width, height);
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", quality),
    );
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("image too large");
}
