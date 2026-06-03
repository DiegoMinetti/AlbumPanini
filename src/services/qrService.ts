import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { db } from '@/db';
import {
  EXCHANGE_VERSION,
  exchangePayloadSchema,
  type ExchangeMatch,
  type ExchangePayload,
} from '@/types/exchange';
import { decodeCompact, encodeCompact } from '@/utils/compression';

/**
 * QR exchange service.
 *
 * The flow is fully offline: a user encodes their spare (duplicate) and missing
 * sticker ids into a gzipped, base64url-packed QR code. Another user scans it;
 * `computeMatch` intersects the two inventories to surface what each can give
 * and receive — no server involved.
 */

export interface OwnPosition {
  collectionId: string;
  collectionVersion: string;
  duplicates: string[];
  missing: string[];
}

/** Compute the current user's exchange position for a collection. */
export async function buildOwnPosition(
  collectionId: string
): Promise<OwnPosition> {
  const [collection, stickers, inventory] = await Promise.all([
    db.collections.get(collectionId),
    db.stickers.where('collectionId').equals(collectionId).toArray(),
    db.inventory.where('collectionId').equals(collectionId).toArray(),
  ]);
  const qty = new Map(inventory.map((i) => [i.stickerId, i.quantity]));

  const duplicates: string[] = [];
  const missing: string[] = [];
  for (const sticker of stickers) {
    const q = qty.get(sticker.id) ?? 0;
    if (q > 1) duplicates.push(sticker.id);
    else if (q === 0) missing.push(sticker.id);
  }

  return {
    collectionId,
    collectionVersion: collection?.version ?? '',
    duplicates,
    missing,
  };
}

export function positionToPayload(
  position: OwnPosition,
  name?: string
): ExchangePayload {
  return {
    v: EXCHANGE_VERSION,
    c: position.collectionId,
    cv: position.collectionVersion,
    n: name,
    d: position.duplicates,
    m: position.missing,
  };
}

/** Encode an exchange payload into a compact, QR-friendly string. */
export function encodeExchange(payload: ExchangePayload): string {
  return encodeCompact(payload);
}

/** Decode + validate a scanned exchange string. */
export function decodeExchange(text: string): ExchangePayload {
  const raw = decodeCompact(text.trim());
  return exchangePayloadSchema.parse(raw);
}

/** Render an exchange payload as a QR-code PNG data URL. */
export async function generateExchangeQr(
  payload: ExchangePayload,
  options: { size?: number } = {}
): Promise<string> {
  const text = encodeExchange(payload);
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: options.size ?? 320,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

/**
 * Intersect my position with another user's payload.
 * - iCanGive   = my duplicates ∩ their missing
 * - iCanReceive = their duplicates ∩ my missing
 */
export function computeMatch(
  mine: OwnPosition,
  theirs: ExchangePayload
): ExchangeMatch {
  const sameCollection = mine.collectionId === theirs.c;
  const myDup = new Set(mine.duplicates);
  const myMissing = new Set(mine.missing);
  const theirDup = new Set(theirs.d);
  const theirMissing = new Set(theirs.m);

  const iCanGive = [...myDup].filter((id) => theirMissing.has(id));
  const iCanReceive = [...theirDup].filter((id) => myMissing.has(id));

  return {
    sameCollection,
    versionMismatch:
      sameCollection && !!theirs.cv && theirs.cv !== mine.collectionVersion,
    iCanGive,
    iCanReceive,
    mutualCount: Math.min(iCanGive.length, iCanReceive.length),
  };
}

/**
 * Decode a QR code from raw RGBA image data (e.g. a video frame or an uploaded
 * image drawn to a canvas). Returns the decoded text, or null if none found.
 */
export function scanQrFromImageData(image: ImageData): string | null {
  const result = jsQR(image.data, image.width, image.height, {
    inversionAttempts: 'attemptBoth',
  });
  return result?.data ?? null;
}
