import pako from 'pako';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Gzip a JSON-serializable value into raw bytes. */
export function gzipJson(value: unknown): Uint8Array {
  const json = JSON.stringify(value);
  return pako.gzip(encoder.encode(json));
}

/** Inverse of {@link gzipJson}. Throws on malformed input. */
export function gunzipJson<T = unknown>(bytes: Uint8Array): T {
  const json = decoder.decode(pako.ungzip(bytes));
  return JSON.parse(json) as T;
}

/** Encode bytes as URL-safe base64 (no padding). */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Decode URL-safe base64 back into bytes. */
export function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Gzip a value and return a compact URL-safe base64 string (for QR codes). */
export function encodeCompact(value: unknown): string {
  return bytesToBase64Url(gzipJson(value));
}

/** Inverse of {@link encodeCompact}. */
export function decodeCompact<T = unknown>(text: string): T {
  return gunzipJson<T>(base64UrlToBytes(text));
}
