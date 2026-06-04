/** Trigger a browser download for a Blob with the given filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a File/Blob into a Uint8Array. */
export async function readFileAsBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }
  // Fallback for environments whose Blob lacks arrayBuffer (e.g. jsdom).
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/** Read a File/Blob into a text string (UTF-8). */
export async function readFileAsText(file: Blob): Promise<string> {
  return file.text();
}

/**
 * Draw an image source onto a canvas and return its ImageData, downscaled to a
 * max dimension to keep QR/OCR processing fast. Returns null if the image has
 * no dimensions.
 */
export async function imageToImageData(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  maxDimension = 1024
): Promise<ImageData | null> {
  const srcW = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const srcH = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!srcW || !srcH) return null;

  const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Load a File/Blob into an HTMLImageElement. */
export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}
