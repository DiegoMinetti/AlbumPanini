import { CONFIG } from '../config.js';

// Cliente HTTP con timeout, reintentos y backoff exponencial.
// User-Agent identificable, exigido por las APIs de Wikimedia.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchOptions {
  accept?: string;
  searchParams?: Record<string, string>;
}

async function fetchOnce(url: string, opts: FetchOptions): Promise<Response> {
  const u = new URL(url);
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      u.searchParams.set(k, v);
    }
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.requestTimeoutMs);
  try {
    return await fetch(u, {
      headers: {
        'User-Agent': CONFIG.userAgent,
        Accept: opts.accept ?? 'application/json',
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** GET con reintentos. Devuelve JSON parseado como T. */
export async function fetchJson<T>(
  url: string,
  opts: FetchOptions = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const res = await fetchOnce(url, opts);
      if (res.status === 429 || res.status >= 500) {
        // rate limit / error servidor: reintentar con backoff
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < CONFIG.maxRetries) {
        const wait = CONFIG.retryBaseMs * 2 ** attempt + Math.random() * 300;
        await sleep(wait);
      }
    }
  }
  throw new Error(
    `fetchJson agotó reintentos para ${url}: ${String(lastErr)}`,
  );
}
