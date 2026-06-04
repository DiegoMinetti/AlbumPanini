import { createWorker, type Worker } from 'tesseract.js';
import { extractCodes, normalizeCode } from '@/utils/code';

/**
 * Local OCR via tesseract.js. Runs entirely in the browser (a Web Worker +
 * WASM). The core + language data are cached by the service worker so OCR keeps
 * working offline after the first successful load.
 *
 * Primary objective: read printed sticker codes such as "ARG 1", "BRA 12",
 * "JOR 14" and feed them to inventory resolution.
 */

let workerPromise: Promise<Worker> | null = null;

/** Lazily create (and reuse) a single Tesseract worker. */
async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      // Restrict the character set to the alphabet/digits/space used by codes,
      // which improves accuracy and speed for short uppercase tokens.
      await worker.setParameters({
        tessedit_char_whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ',
      });
      return worker;
    })();
  }
  return workerPromise;
}

export type OcrImage =
  | string
  | File
  | Blob
  | HTMLCanvasElement
  | HTMLImageElement
  | ImageData;

export interface OcrResult {
  /** Raw recognized text. */
  text: string;
  /** Overall confidence 0..100. */
  confidence: number;
  /** Candidate codes extracted + normalized from the text. */
  codes: string[];
  normalizedCodes: string[];
}

/** Recognize text from an image source and extract candidate sticker codes. */
export async function recognizeCodes(image: OcrImage): Promise<OcrResult> {
  const worker = await getWorker();
  const { data } = await worker.recognize(
    image as Parameters<Worker['recognize']>[0]
  );
  const text = data.text ?? '';
  const codes = extractCodes(text);
  return {
    text,
    confidence: data.confidence ?? 0,
    codes,
    normalizedCodes: codes.map(normalizeCode),
  };
}

/** Tear down the worker (e.g. when leaving the scan screen) to free memory. */
export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
