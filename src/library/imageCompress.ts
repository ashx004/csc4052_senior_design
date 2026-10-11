// Client-side image downscaling and recompression, so phone photos (often
// 4000px / 5MB+) become pictures that are quick to upload, store and OCR.

export interface CompressOptions {
  /** Longest edge after resizing, in pixels. */
  maxEdge?: number;
  /** JPEG quality, 0-1. */
  quality?: number;
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  /** False when the original was already small enough and was kept as is. */
  recompressed: boolean;
}

/** Scales (w, h) down to fit `maxEdge` on the longest side; never upscales. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest <= 0) return { width, height };
  const k = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

const KEEP_AS_IS_BYTES = 350 * 1024;

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" applies the camera's EXIF rotation, so portrait phone
      // photos don't come out sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

/** Resizes and re-encodes an image as JPEG. GIFs are left alone (they may be
 *  animated); images already small and JPEG/WebP are kept as is. */
export async function compressImage(file: Blob, options: CompressOptions = {}): Promise<CompressedImage> {
  const maxEdge = options.maxEdge ?? 1600;
  const quality = options.quality ?? 0.82;
  const decoded = await decode(file);
  try {
    const { width, height } = fitWithin(decoded.width, decoded.height, maxEdge);
    const untouchedType = file.type === "image/jpeg" || file.type === "image/webp" || file.type === "image/gif";
    if (file.type === "image/gif" || (untouchedType && file.size <= KEEP_AS_IS_BYTES && width === decoded.width && height === decoded.height)) {
      return { blob: file, width: decoded.width, height: decoded.height, recompressed: false };
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't process images.");
    // JPEG has no transparency: paint white first so transparent PNGs
    // don't turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("Couldn't compress the image.");
    // Never make a small file bigger.
    if (blob.size >= file.size && width === decoded.width && height === decoded.height) {
      return { blob: file, width, height, recompressed: false };
    }
    return { blob, width, height, recompressed: true };
  } finally {
    decoded.release();
  }
}
