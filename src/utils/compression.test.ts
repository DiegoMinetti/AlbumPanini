import { describe, it, expect } from 'vitest';
import {
  gzipJson,
  gunzipJson,
  encodeCompact,
  decodeCompact,
  bytesToBase64Url,
  base64UrlToBytes,
} from './compression';

describe('gzip round-trip', () => {
  it('preserves objects', () => {
    const value = { a: 1, b: ['x', 'y'], c: { nested: true } };
    expect(gunzipJson(gzipJson(value))).toEqual(value);
  });
});

describe('base64url', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64]);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect([...base64UrlToBytes(encoded)]).toEqual([...bytes]);
  });
});

describe('encodeCompact/decodeCompact', () => {
  it('round-trips a payload through gzip + base64url', () => {
    const payload = { v: 1, c: 'wc', d: ['ARG-1', 'BRA-1'], m: ['ARG-2'] };
    const text = encodeCompact(payload);
    expect(typeof text).toBe('string');
    expect(decodeCompact(text)).toEqual(payload);
  });
});
