import QRCode from 'qrcode';
import { db } from '@/db';
import {
  SYNC_CHUNK_MAX_BYTES,
  SYNC_VERSION,
  syncPayloadSchema,
  type SyncCollection,
  type SyncPayload,
  type SyncSessionInfo,
} from '@/types/sync';
import type { Settings } from '@/types/settings';
import type { StoredInventoryItem } from '@/types/inventory';
import type {
  StoredKnockoutPick,
  StoredMatchResult,
  StoredScenario,
} from '@/types/scenario';
import { encodeCompact, decodeCompact } from '@/utils/compression';
import { makeUid } from '@/utils/ids';

/**
 * Device-to-device sync over QR codes.
 *
 * The flow is offline-only:
 *  1. Device A (sender) builds a {@link SyncPayload} from its DB + settings,
 *     gzip + base64url-encodes it, and renders the resulting string as one
 *     or more QR codes (a URL pointing back into the app).
 *  2. Device B (receiver) scans the QR(s) with its camera, the app opens
 *     on the Backup page, decodes the payload and applies it with the
 *     user's chosen mode (merge or replace).
 *
 * To keep the payload small enough for QR codes we deliberately omit the
 * per-sticker/team metadata (both devices install the same package), and we
 * represent inventory/scenarios as compact tuples instead of full objects.
 */

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '1.0.0';

// ---------------------------------------------------------------------------
// Build + encode
// ---------------------------------------------------------------------------

/**
 * Build a compact sync payload from the current DB. Only data that drifts
 * between devices is included (inventory, scenarios, settings). Sticker and
 * team metadata are package-derived and assumed equal on both devices.
 */
export async function buildSyncPayload(
  settings: Settings
): Promise<SyncPayload> {
  const [collections, inventory, scenarios, matchResults, knockoutPicks] =
    await Promise.all([
      db.collections.toArray(),
      db.inventory.toArray(),
      db.scenarios.toArray(),
      db.matchResults.toArray(),
      db.knockoutPicks.toArray(),
    ]);

  const invByCol = groupBy(inventory, (i) => i.collectionId);
  const scenByCol = groupBy(scenarios, (s) => s.collectionId);
  const resultsByScenario = groupBy(matchResults, (r) => r.scenarioId);
  const picksByScenario = groupBy(knockoutPicks, (p) => p.scenarioId);

  const colById = new Map(collections.map((c) => [c.id, c]));

  // Only emit a collection if the local DB has at least one row of relevant
  // data for it. This keeps the payload tiny for users with several
  // collections installed but only one in active use.
  const collectionIds = new Set<string>();
  for (const i of inventory) collectionIds.add(i.collectionId);
  for (const s of scenarios) collectionIds.add(s.collectionId);

  const syncCollections: SyncCollection[] = [];
  for (const id of collectionIds) {
    const col = colById.get(id);
    const inv = invByCol.get(id) ?? [];
    const scens = scenByCol.get(id) ?? [];

    syncCollections.push({
      i: id,
      v: col?.version ?? '',
      q: inv
        .filter((i) => i.quantity > 0)
        .map((i) => [i.stickerId, i.quantity] as [string, number]),
      s: scens.map((s) => ({
        i: s.id,
        n: s.name,
        o: s.isOfficial,
        r: (resultsByScenario.get(s.id) ?? []).map((r) => resultToTuple(r)),
        p: (picksByScenario.get(s.id) ?? []).map((p) => pickToTuple(p)),
      })),
    });
  }

  return {
    v: SYNC_VERSION,
    t: Date.now(),
    a: APP_VERSION,
    c: syncCollections,
    st: settings,
  };
}

/** Encode a sync payload to a URL-safe string (gzip + base64url). */
export function encodeSync(payload: SyncPayload): string {
  return encodeCompact(payload);
}

/** Decode + validate a sync payload from a URL-safe string. */
export function decodeSync(text: string): SyncPayload {
  const raw = decodeCompact(text.trim());
  return syncPayloadSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export interface SyncChunks {
  /** Session id, unique per sync, used to correlate chunks on the receiver. */
  sid: string;
  /** Total chunks. */
  total: number;
  /** Each chunk, in order (1-based index encoded in the URL). */
  pieces: string[];
}

/**
 * Split an encoded sync string into chunks that each fit comfortably in a
 * single QR code (L error correction). Uses {@link SYNC_CHUNK_MAX_BYTES} as
 * the per-chunk budget and slices on character boundaries (base64url is
 * ASCII, so byte and char counts agree).
 */
export function chunkSync(encoded: string): SyncChunks {
  const sid = generateSyncSessionId();
  // +25 is a safety margin for the wrapping URL (?sync=, &i=, &n=, &c=,
  // &sid=) that gets prepended to each chunk when rendered.
  const perChunk = SYNC_CHUNK_MAX_BYTES;
  if (encoded.length <= perChunk) {
    return { sid, total: 1, pieces: [encoded] };
  }
  const pieces: string[] = [];
  for (let i = 0; i < encoded.length; i += perChunk) {
    pieces.push(encoded.slice(i, i + perChunk));
  }
  return { sid, total: pieces.length, pieces };
}

// ---------------------------------------------------------------------------
// URL building (sender side)
// ---------------------------------------------------------------------------

/**
 * Resolve the base URL used to build sync links. Uses `window.location.origin`
 * + the Vite `BASE_URL` (e.g. `/AlbumPanini/`) so the resulting link works
 * both in production (GitHub Pages) and locally (where base is `/`).
 */
export function resolveSyncBaseUrl(): string {
  if (typeof window === 'undefined') return '/';
  const origin = window.location.origin || '';
  const rawBase = import.meta.env.BASE_URL || '/';
  // `BASE_URL` always ends with `/` in Vite.
  return `${origin}${rawBase}#/backup`;
}

/**
 * Build the URL that should be encoded into a QR code. The receiver opens
 * this URL, the app reads `?sync=…` from the hash and decodes the payload.
 *
 * For multi-chunk syncs the URL contains `?sync=<sid>&i=<idx>&n=<total>&c=<chunk>`
 * so the receiver can identify and accumulate chunks.
 */
export function buildSyncUrl(chunk: {
  sid: string;
  idx: number;
  total: number;
  data: string;
}): string {
  const base = resolveSyncBaseUrl();
  const params = new URLSearchParams();
  params.set('sync', chunk.sid);
  params.set('i', String(chunk.idx));
  params.set('n', String(chunk.total));
  params.set('c', chunk.data);
  return `${base}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// QR rendering
// ---------------------------------------------------------------------------

export interface RenderSyncQrOptions {
  size?: number;
  /** Render dark/light colors explicitly for the current theme. */
  dark?: string;
  light?: string;
}

/**
 * Render an arbitrary string (usually a sync URL) as a QR-code PNG data URL.
 * Mirrors the exchange service's helper so the look-and-feel is consistent.
 */
export async function renderSyncQr(
  text: string,
  options: RenderSyncQrOptions = {}
): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: options.size ?? 320,
    color: {
      dark: options.dark ?? '#0f172a',
      light: options.light ?? '#ffffff',
    },
  });
}

// ---------------------------------------------------------------------------
// Receiver side: URL parsing + payload assembly
// ---------------------------------------------------------------------------

export interface ParsedSyncLink {
  /** True when the URL describes a full payload (single-chunk). */
  isSingle: boolean;
  sid: string;
  total: number;
  idx: number;
  /** Raw chunk payload (for multi-chunk) or full payload (for single). */
  data: string;
}

/** Parse a sync URL back into its components. */
export function parseSyncUrl(url: string): ParsedSyncLink | null {
  try {
    const u = new URL(url);
    // The sync query is carried inside the hash because we use hash-based
    // routing (`createHashRouter`): the URL looks like
    //   https://host/AlbumPanini/#/backup?sync=…&i=…&n=…&c=…
    // so `u.searchParams` is empty — we have to read the query from `u.hash`.
    const hashIdx = u.hash.indexOf('?');
    const queryString =
      hashIdx >= 0 ? u.hash.slice(hashIdx + 1) : u.search.slice(1);
    const params = new URLSearchParams(queryString);
    const sid = params.get('sync');
    const data = params.get('c') ?? params.get('d') ?? params.get('p');
    if (!sid) return null;
    const idx = Number(params.get('i') ?? '1');
    const total = Number(params.get('n') ?? '1');
    if (!data) return null;
    if (Number.isNaN(idx) || Number.isNaN(total)) return null;
    return {
      isSingle: total <= 1,
      sid,
      total: Math.max(1, total),
      idx: Math.max(1, idx),
      data,
    };
  } catch {
    return null;
  }
}

/**
 * Read the current page URL and extract a sync descriptor, if any. Safe to
 * call from a `useEffect`; returns null when there is no sync query.
 */
export function readSyncFromLocation(): ParsedSyncLink | null {
  if (typeof window === 'undefined') return null;
  return parseSyncUrl(window.location.href);
}

// ---------------------------------------------------------------------------
// Session buffer (receiver accumulates chunks in localStorage)
// ---------------------------------------------------------------------------

const SYNC_SESSION_STORAGE_KEY = 'panini-sync-session';
const SYNC_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * In-memory fallback used when `localStorage` is not available (private mode,
 * opaque origins, SSR, jsdom under Node ≥22 without the experimental flag).
 * Mirrors the pattern used by `settingsStore` so the sync flow keeps working
 * in tests and exotic runtimes.
 */
const sessionMemoryStore = new Map<string, string>();

interface StoredSession {
  sid: string;
  total: number;
  chunks: Record<number, string>;
  receivedAt: number;
}

/**
 * Append a chunk to the in-flight sync session and return the new session
 * state. If the same chunk index arrives twice it is overwritten (idempotent
 * scans). Returns null when the session has expired or the chunk does not
 * belong to the stored session.
 */
export function recordSyncChunk(chunk: ParsedSyncLink): {
  session: SyncSessionInfo;
  isComplete: boolean;
} | null {
  const stored = readStoredSession();
  // First chunk of a new session, or matching an existing one.
  if (!stored || stored.sid !== chunk.sid) {
    if (chunk.idx !== 1) return null; // out of order
    const fresh: StoredSession = {
      sid: chunk.sid,
      total: chunk.total,
      chunks: { [chunk.idx]: chunk.data },
      receivedAt: Date.now(),
    };
    writeStoredSession(fresh);
    return {
      session: toSessionInfo(fresh),
      isComplete: fresh.total <= 1,
    };
  }
  if (Date.now() - stored.receivedAt > SYNC_SESSION_TTL_MS) {
    // Stale session — restart from this chunk.
    const fresh: StoredSession = {
      sid: chunk.sid,
      total: chunk.total,
      chunks: { [chunk.idx]: chunk.data },
      receivedAt: Date.now(),
    };
    writeStoredSession(fresh);
    return {
      session: toSessionInfo(fresh),
      isComplete: fresh.total <= 1,
    };
  }
  stored.chunks[chunk.idx] = chunk.data;
  stored.receivedAt = Date.now();
  writeStoredSession(stored);
  const isComplete = Object.keys(stored.chunks).length >= stored.total;
  return { session: toSessionInfo(stored), isComplete };
}

/** Clear any in-flight sync session. Called after a successful apply. */
export function clearSyncSession(): void {
  try {
    globalThis.localStorage?.removeItem(SYNC_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  sessionMemoryStore.delete(SYNC_SESSION_STORAGE_KEY);
}

/**
 * Assemble chunks from the receiver's buffer back into a single encoded
 * sync string. Returns null if some chunks are still missing.
 */
export function assembleSyncChunks(session: SyncSessionInfo): string | null {
  if (session.chunks.size < session.total) return null;
  const parts: string[] = [];
  for (let i = 1; i <= session.total; i++) {
    const piece = session.chunks.get(i);
    if (!piece) return null;
    parts.push(piece);
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Apply (restore into the local DB)
// ---------------------------------------------------------------------------

export interface ApplySyncOptions {
  /**
   * `'merge'` (default) — keep existing collections, add/update the
   * inventory and scenarios carried in the payload.
   * `'replace'` — drop the local collections listed in the payload before
   * writing.
   */
  mode?: 'merge' | 'replace';
  /** Skip applying the user settings block. */
  ignoreSettings?: boolean;
}

export interface ApplySyncSummary {
  collections: number;
  inventoryItems: number;
  scenarios: number;
  matchResults: number;
  knockoutPicks: number;
  settingsApplied: boolean;
  missingCollections: string[]; // collection ids not installed locally
}

/**
 * Apply a decoded sync payload to the local database.
 *
 * The payload is collection-scoped: we only touch collections that are
 * mentioned in the payload, leaving any unrelated local data intact.
 * Collections that exist in the payload but are *not* installed locally are
 * returned in `missingCollections` so the caller can warn the user — we
 * don't auto-install packages during a sync.
 */
export async function applySyncPayload(
  payload: SyncPayload,
  options: ApplySyncOptions = {}
): Promise<ApplySyncSummary> {
  const mode = options.mode ?? 'merge';
  const summary: ApplySyncSummary = {
    collections: 0,
    inventoryItems: 0,
    scenarios: 0,
    matchResults: 0,
    knockoutPicks: 0,
    settingsApplied: false,
    missingCollections: [],
  };

  const localCollections = await db.collections.toArray();
  const localById = new Map(localCollections.map((c) => [c.id, c]));

  const now = Date.now();
  const invRows: StoredInventoryItem[] = [];
  const scenarioRows: StoredScenario[] = [];
  const resultRows: StoredMatchResult[] = [];
  const pickRows: StoredKnockoutPick[] = [];

  for (const sc of payload.c) {
    summary.collections += 1;
    if (!localById.has(sc.i)) {
      summary.missingCollections.push(sc.i);
    }
    for (const [stickerId, qty] of sc.q) {
      invRows.push({
        uid: makeUid(sc.i, stickerId),
        collectionId: sc.i,
        stickerId,
        quantity: qty,
        updatedAt: now,
      });
    }
    for (const s of sc.s) {
      scenarioRows.push({
        id: s.i,
        collectionId: sc.i,
        name: s.n || 'Simulación',
        isOfficial: !!s.o,
        createdAt: now,
        updatedAt: now,
      });
      for (const r of s.r) {
        const [matchId, hg, ag, hp, ap, played] = r;
        const row: StoredMatchResult = {
          uid: makeUid(s.i, matchId),
          scenarioId: s.i,
          matchId,
          homeGoals: hg,
          awayGoals: ag,
          played: !!played,
          updatedAt: now,
        };
        if (typeof hp === 'number') row.homePens = hp;
        if (typeof ap === 'number') row.awayPens = ap;
        resultRows.push(row);
      }
      for (const p of s.p) {
        const [slot, teamId] = p;
        pickRows.push({
          uid: makeUid(s.i, slot),
          scenarioId: s.i,
          slot,
          teamId,
          updatedAt: now,
        });
      }
    }
  }

  await db.transaction(
    'rw',
    [db.inventory, db.scenarios, db.matchResults, db.knockoutPicks],
    async () => {
      // Inventory: in 'replace' mode we wipe the per-collection inventory
      // before re-inserting; in 'merge' we let bulkPut upsert.
      if (mode === 'replace') {
        for (const sc of payload.c) {
          await db.inventory.where('collectionId').equals(sc.i).delete();
        }
        for (const s of payload.c.flatMap((c) => c.s)) {
          await db.matchResults.where('scenarioId').equals(s.i).delete();
          await db.knockoutPicks.where('scenarioId').equals(s.i).delete();
        }
      }
      if (invRows.length) await db.inventory.bulkPut(invRows);
      if (scenarioRows.length) await db.scenarios.bulkPut(scenarioRows);
      if (resultRows.length) await db.matchResults.bulkPut(resultRows);
      if (pickRows.length) await db.knockoutPicks.bulkPut(pickRows);
    }
  );

  summary.inventoryItems = invRows.length;
  summary.scenarios = scenarioRows.length;
  summary.matchResults = resultRows.length;
  summary.knockoutPicks = pickRows.length;

  // Settings: handled by the caller (UI) so it can run side-effects (theme
  // application, persisted store update). We just flag whether the payload
  // carried one.
  if (!options.ignoreSettings && payload.st) {
    summary.settingsApplied = true;
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Convenience helper for the "I scanned a single-chunk sync, restore now"
// path. Pulls the current local settings from the store the caller passes in
// (kept as a parameter to avoid a hard store import here).
// ---------------------------------------------------------------------------

export interface ApplySettingsFn {
  (settings: Settings): void;
}

export async function applySyncPayloadWithSettings(
  payload: SyncPayload,
  applySettings: ApplySettingsFn,
  options: ApplySyncOptions = {}
): Promise<ApplySyncSummary> {
  const summary = await applySyncPayload(payload, options);
  if (!options.ignoreSettings && payload.st) {
    applySettings(payload.st);
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Helpers (kept private to this module)
// ---------------------------------------------------------------------------

function resultToTuple(
  r: StoredMatchResult
): [string, number, number, number | undefined, number | undefined, boolean] {
  return [
    r.matchId,
    r.homeGoals,
    r.awayGoals,
    r.homePens,
    r.awayPens,
    r.played,
  ];
}

function pickToTuple(p: StoredKnockoutPick): [string, string] {
  return [p.slot, p.teamId];
}

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function generateSyncSessionId(): string {
  // Short, URL-safe, no padding. 8 random bytes = 64 bits of entropy, plenty
  // for the 10-minute TTL window.
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = Math.floor(Math.random() * 256);
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

function readStoredSession(): StoredSession | null {
  let raw: string | null = null;
  try {
    raw = globalThis.localStorage?.getItem(SYNC_SESSION_STORAGE_KEY) ?? null;
  } catch {
    /* ignore */
  }
  if (!raw) {
    raw = sessionMemoryStore.get(SYNC_SESSION_STORAGE_KEY) ?? null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (
      typeof parsed.sid !== 'string' ||
      typeof parsed.total !== 'number' ||
      !parsed.chunks
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession): void {
  const serialized = JSON.stringify(session);
  try {
    globalThis.localStorage?.setItem(SYNC_SESSION_STORAGE_KEY, serialized);
  } catch {
    /* ignore quota / private mode errors */
  }
  sessionMemoryStore.set(SYNC_SESSION_STORAGE_KEY, serialized);
}

function toSessionInfo(stored: StoredSession): SyncSessionInfo {
  return {
    sid: stored.sid,
    total: stored.total,
    chunks: new Map(
      Object.entries(stored.chunks).map(([k, v]) => [Number(k), v])
    ),
    receivedAt: stored.receivedAt,
  };
}
