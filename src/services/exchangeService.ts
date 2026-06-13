/**
 * Exchange service — text-based, fully offline.
 *
 * The exchange flow is intentionally dead simple:
 *
 *   1. The user taps a copy button on a section ("Repetidas" / "Faltan") and
 *      gets a self-contained text block with the list + a deep link.
 *   2. They paste that block in WhatsApp / Telegram / wherever.
 *   3. The other person opens the link (which lands in the installed PWA)
 *      or just pastes the text into the same section. We detect the origin
 *      automatically: our own format is preferred, but the parser is also
 *      tolerant of the external "PREFIX <emoji>: n,n,n" format that other
 *      Panini-style apps produce.
 *
 * No QR, no images, no servers. The text is the contract.
 *
 * ## Wire format
 *
 * Our own format is:
 *
 *   Panini Tracker
 *   <Section title in source language>
 *   PREFIX1: n, n, n
 *   PREFIX2: n
 *
 *   <Section title in source language>
 *   ...
 *
 *   Abrí en la app
 *   <deep-link URL>
 *
 *   --- 1/3 ---
 *   <deep-link URL>
 *
 *   (optional chunked continuation)
 *
 * The human-readable lines are the source of truth for clipboard
 * compatibility. The deep link is a compact, gzipped+base64url payload
 * (see `encodePayload` / `decodePayload`) that lets the app open straight
 * into the right collection with the right list pre-filled.
 *
 * ## External format
 *
 *   PREFIX <emoji>: n, n, n
 *
 * One line per prefix. Optional prose around it (titles, banners, "Me
 * faltan" / "Repetidas" labels) is ignored. This format is the lingua
 * franca between Panini-style apps; we accept it as input without
 * complaining about the source.
 */

import { db } from '@/db';
import type { StoredSticker, StoredTeam } from '@/types/collection';
import { normalizeCode } from '@/utils/code';
import { decodeCompact, encodeCompact } from '@/utils/compression';
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Wire format — compact payload (encoded into the deep-link URL).     */
/* ------------------------------------------------------------------ */

const EXCHANGE_PAYLOAD_VERSION = 1 as const;

const exchangePayloadSchema = z.object({
  v: z.literal(EXCHANGE_PAYLOAD_VERSION),
  c: z.string().min(1), // collectionId
  // Sections are identified by a short key. Today only "d" (duplicates) and
  // "m" (missing) are supported; future versions can add more without
  // breaking the deep link.
  d: z.array(z.string()).default([]),
  m: z.array(z.string()).default([]),
});

export type ExchangePayload = z.infer<typeof exchangePayloadSchema>;

/** Where this text came from. Drives the UI labelling. */
export type ExchangeSource = 'own' | 'external';

export interface ParsedExchangeText {
  source: ExchangeSource;
  collectionId: string | null; // present only for `own`
  duplicates: string[]; // sticker ids the source has duplicates of
  missing: string[]; // sticker ids the source is missing
  /** External-only: lines we couldn't resolve. */
  unresolved: { prefix: string; number: string }[];
  /** Original line list, preserved for the UI. */
  lines: { prefix: string; emoji: string; numbers: string[] }[];
}

/* ------------------------------------------------------------------ */
/* Deep link                                                            */
/* ------------------------------------------------------------------ */

const DEEP_LINK_BASE = 'https://albumpanini.app/exchange';

/** Section of a list inside a deep link (or a "Repetidas" / "Faltan" block). */
export type ExchangeSection = 'duplicates' | 'missing';

const SECTION_KEYS: Record<ExchangeSection, 'd' | 'm'> = {
  duplicates: 'd',
  missing: 'm',
};

/** Hard cap on a single chunk's URL length — leaves headroom in chat apps. */
const CHUNK_MAX_URL_BYTES = 1500;

/**
 * Build a deep link for a given collection + section.
 * The sticker ids are passed through `normalizeCode` to align with the DB.
 */
export function buildDeepLink(
  collectionId: string,
  section: ExchangeSection,
  stickerIds: string[]
): string {
  const key = SECTION_KEYS[section];
  const normalized = stickerIds.map(normalizeCode);
  const payload: ExchangePayload = {
    v: EXCHANGE_PAYLOAD_VERSION,
    c: collectionId,
    d: key === 'd' ? normalized : [],
    m: key === 'm' ? normalized : [],
  };
  const encoded = encodePayload(payload);
  return `${DEEP_LINK_BASE}?c=${encodeURIComponent(collectionId)}&s=${key}&d=${encoded}`;
}

/**
 * Build a single text block with both sections + a deep link per chunk.
 *
 * Output shape:
 *   <own header>
 *   <Repetidas section>
 *   <lines>
 *
 *   <Faltan section>
 *   <lines>
 *
 *   Abrí en la app
 *   <deep-link url>     (with all the data in the URL, single chunk)
 *   --- 1/N ---         (only if we needed to chunk)
 *   <deep-link url>
 *   ...
 */
export function buildExchangeText(args: {
  /** Localized "Repetidas" / "Faltan" / "Open in the app" labels. */
  labels: {
    header: string;
    duplicatesTitle: string;
    missingTitle: string;
    openInApp: string;
  };
  collectionId: string;
  duplicates: { prefix: string; emoji: string; numbers: string[] }[];
  missing: { prefix: string; emoji: string; numbers: string[] }[];
}): string {
  const { labels, collectionId, duplicates, missing } = args;

  const dupBlock = renderSection(labels.duplicatesTitle, duplicates);
  const missBlock = renderSection(labels.missingTitle, missing);

  // Encode each section as its own payload so the receiving app can land
  // directly on the right flow ("Repetidas" → offer duplicates,
  // "Faltan" → request missing).
  const dupLink = buildDeepLink(collectionId, 'duplicates', flatIds(duplicates));
  const missLink = buildDeepLink(collectionId, 'missing', flatIds(missing));

  const allLinks = [dupLink, missLink];

  const chunked = chunkLinks(allLinks, CHUNK_MAX_URL_BYTES);

  const linkLines: string[] = [labels.openInApp];
  if (allLinks.length === 1) {
    linkLines.push(allLinks[0]);
  } else if (chunked.length === 1) {
    // Multiple URLs that all fit in one chunk — show on separate lines for
    // readability and to make each one tappable on mobile.
    allLinks.forEach((url) => linkLines.push(url));
  } else {
    chunked.forEach((url, idx) => {
      linkLines.push(url);
      linkLines.push(`--- ${idx + 1}/${chunked.length} ---`);
    });
  }

  return [
    labels.header,
    dupBlock,
    missBlock,
    '',
    linkLines.join('\n'),
  ]
    .filter((s) => s !== '' || dupBlock === '' || missBlock === '')
    .join('\n');
}

function renderSection(
  title: string,
  groups: { prefix: string; emoji: string; numbers: string[] }[]
): string {
  if (groups.length === 0) return '';
  const lines = groups.map((g) =>
    g.emoji ? `${g.prefix} ${g.emoji}: ${g.numbers.join(', ')}` : `${g.prefix}: ${g.numbers.join(', ')}`
  );
  return [title, ...lines].join('\n');
}

function flatIds(groups: { prefix: string; numbers: string[] }[]): string[] {
  return groups.flatMap((g) => g.numbers.map((n) => `${g.prefix}${n}`));
}

function chunkLinks(urls: string[], maxBytes: number): string[] {
  // Greedy: try to keep all URLs in a single chunk; fall back to one URL
  // per chunk if any single URL exceeds the cap. With our 1500-byte cap
  // and 6-byte `?c=&s=&d=` overhead per URL, a single chunk usually fits
  // a complete payload.
  const total = urls.join('\n').length;
  if (total <= maxBytes) return [urls.join('\n')];
  return urls.map((u) => u);
}

/* ------------------------------------------------------------------ */
/* Compact payload encoding (used inside the deep link)                */
/* ------------------------------------------------------------------ */

function encodePayload(payload: ExchangePayload): string {
  return encodeCompact(payload);
}

function decodePayload(encoded: string): ExchangePayload {
  const raw = decodeCompact(encoded);
  return exchangePayloadSchema.parse(raw);
}

/* ------------------------------------------------------------------ */
/* Parsing — auto-detect own format vs. external                       */
/* ------------------------------------------------------------------ */

/** Regex matching a single `PREFIX <emoji>: n, n, n` line. */
const LINE_RE = /^\s*([A-Za-z]+)\s+([^:]+?):\s*(.+?)\s*$/;

interface RawLine {
  prefix: string;
  emoji: string;
  numbers: string[];
}

function parseLines(input: string): RawLine[] {
  const lines: RawLine[] = [];
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('//')) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const prefix = m[1].toUpperCase();
    const emoji = m[2].trim();
    const numbers = m[3]
      .split(/[,;|]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (numbers.length === 0) continue;
    lines.push({ prefix, emoji, numbers });
  }
  return lines;
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Extract every deep link URL present in the text. */
function extractUrls(input: string): string[] {
  return Array.from(input.matchAll(URL_RE)).map((m) => m[1]);
}

/**
 * Parse a block of text. Detects whether it's our own format (with a deep
 * link) or an external format. Always returns a structured result; never
 * throws on empty / malformed input.
 */
export function parseExchangeText(input: string): ParsedExchangeText {
  if (!input || !input.trim()) {
    return emptyParsed('external');
  }

  const urls = extractUrls(input);
  // Our deep-link host is `albumpanini.app`. Anything else with `?c=...&s=...&d=...`
  // is treated as unknown and falls back to plain text parsing.
  const ownUrls = urls.filter((u) => u.startsWith(`${DEEP_LINK_BASE}?`));
  const externalUrls = urls.filter((u) => !ownUrls.includes(u));

  if (ownUrls.length > 0) {
    return parseOwnFormat(ownUrls, input);
  }

  // External format: parse the human-readable lines. We discard the URL
  // lines (they're typically a "Descarga la app" link in the external
  // format and we don't need them).
  return parseExternalFormat(input, externalUrls);
}

function parseOwnFormat(
  ownUrls: string[],
  fullText: string
): ParsedExchangeText {
  const duplicates = new Set<string>();
  const missing = new Set<string>();
  let collectionId: string | null = null;

  for (const url of ownUrls) {
    const parsed = parseDeepLink(url);
    if (!parsed) continue;
    if (collectionId === null) collectionId = parsed.collectionId;
    for (const id of parsed.duplicates) duplicates.add(id);
    for (const id of parsed.missing) missing.add(id);
  }

  return {
    source: 'own',
    collectionId,
    duplicates: [...duplicates],
    missing: [...missing],
    unresolved: [],
    // We also keep the raw line list so the UI can render the text exactly
    // as the user pasted it (without the URL lines).
    lines: parseLines(stripUrlLines(fullText)),
  };
}

function parseExternalFormat(input: string, _externalUrls: string[]): ParsedExchangeText {
  const cleaned = stripUrlLines(input);
  const lines = parseLines(cleaned);
  return {
    source: 'external',
    collectionId: null,
    duplicates: [], // External format doesn't tell us which side is which.
    missing: [],
    unresolved: lines.flatMap((l) =>
      l.numbers.map((n) => ({ prefix: l.prefix, number: n }))
    ),
    lines,
  };
}

function stripUrlLines(input: string): string {
  return input
    .split(/\r?\n/)
    .filter((line) => !URL_RE.test(line.trim()))
    .join('\n');
}

function emptyParsed(source: ExchangeSource): ParsedExchangeText {
  return { source, collectionId: null, duplicates: [], missing: [], unresolved: [], lines: [] };
}

/* ------------------------------------------------------------------ */
/* Deep link parsing                                                    */
/* ------------------------------------------------------------------ */

interface DeepLinkParts {
  collectionId: string;
  duplicates: string[];
  missing: string[];
}

function parseDeepLink(url: string): DeepLinkParts | null {
  try {
    const u = new URL(url);
    if (u.origin + u.pathname !== DEEP_LINK_BASE) return null;
    const collectionId = u.searchParams.get('c');
    const sectionKey = u.searchParams.get('s');
    const data = u.searchParams.get('d');
    if (!collectionId || !sectionKey || !data) return null;
    if (sectionKey !== 'd' && sectionKey !== 'm') return null;
    const payload = decodePayload(data);
    if (payload.c !== collectionId) return null;
    return {
      collectionId,
      duplicates: payload.d ?? [],
      missing: payload.m ?? [],
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Resolve parsed text into sticker ids (DB-aware)                      */
/* ------------------------------------------------------------------ */

export interface ResolvedSticker {
  stickerId: string;
  code: string;
  prefix: string;
  number: string;
  emoji: string;
}

export interface ResolvedExchange {
  /** Resolved ids in their canonical `code` form. */
  duplicates: ResolvedSticker[];
  missing: ResolvedSticker[];
  /** Lines the user pasted that don't correspond to any sticker in this collection. */
  unresolved: { prefix: string; number: string }[];
}

/**
 * Turn a parsed text into actual sticker rows from the local DB. Used by
 * the "paste friend list" flow to figure out what they have / need.
 *
 * For our own format, the deep link already carries sticker ids — we
 * look them up directly. For external format, we resolve `(prefix, number)`
 * via the collection's sticker codes.
 */
export async function resolveExchangeText(
  collectionId: string,
  text: string
): Promise<ResolvedExchange> {
  const parsed = parseExchangeText(text);

  const [stickers] = await Promise.all([
    db.stickers.where('collectionId').equals(collectionId).toArray(),
  ]);

  const byCode = new Map<string, StoredSticker>();
  for (const s of stickers) byCode.set(s.normalizedCode, s);

  const dupIds = parsed.source === 'own' ? new Set(parsed.duplicates) : null;
  const missIds = parsed.source === 'own' ? new Set(parsed.missing) : null;

  const duplicates: ResolvedSticker[] = [];
  const missing: ResolvedSticker[] = [];
  const unresolved: { prefix: string; number: string }[] = [];

  if (parsed.source === 'own') {
    for (const id of dupIds ?? []) {
      const s = byCode.get(id);
      if (s) {
        duplicates.push(toResolved(s, s.code, ''));
      } else {
        unresolved.push({ prefix: '?', number: id });
      }
    }
    for (const id of missIds ?? []) {
      const s = byCode.get(id);
      if (s) {
        missing.push(toResolved(s, s.code, ''));
      } else {
        unresolved.push({ prefix: '?', number: id });
      }
    }
  } else {
    // External: resolve from the line list. We don't know which side is
    // "duplicates" and which is "missing" without a section heading — the
    // caller decides how to interpret this (defaults to "missing": the
    // typical "what my friend needs" interpretation).
    for (const line of parsed.lines) {
      for (const number of line.numbers) {
        const candidates = candidateCodes(line.prefix, number);
        const sticker = candidates
          .map((c) => byCode.get(normalizeCode(c)))
          .find((s): s is StoredSticker => Boolean(s));
        if (!sticker) {
          unresolved.push({ prefix: line.prefix, number });
        } else {
          missing.push(toResolved(sticker, line.prefix, number, line.emoji));
        }
      }
    }
  }

  return { duplicates, missing, unresolved };
}

function toResolved(
  s: StoredSticker,
  prefix: string,
  number: string,
  emoji: string = ''
): ResolvedSticker {
  return {
    stickerId: s.id,
    code: s.code,
    prefix,
    number,
    emoji,
  };
}

/** Build candidate codes for a (prefix, number) pair. Same logic as the
 *  legacy parser, kept here so this service is self-contained. */
function candidateCodes(prefix: string, number: string): string[] {
  const trimmedNumber = number.replace(/^0+(?=\d)/, '');
  const candidates: string[] = [];
  candidates.push(`${prefix}${trimmedNumber}`);
  if (number !== trimmedNumber) candidates.push(`${prefix}${number}`);
  if (number !== trimmedNumber) candidates.push(number);
  candidates.push(trimmedNumber);
  return [...new Set(candidates)];
}

/* ------------------------------------------------------------------ */
/* Build the per-prefix lines (for the user's own list)                */
/* ------------------------------------------------------------------ */

export interface OwnListGroups {
  /** "Repetidas" — every sticker the user has in duplicate (qty > 1). */
  duplicates: { prefix: string; emoji: string; numbers: string[] }[];
  /** "Faltan" — every sticker the user is missing (qty === 0). */
  missing: { prefix: string; emoji: string; numbers: string[] }[];
}

/**
 * Group the user's own inventory into the two "Repetidas" / "Faltan"
 * buckets, ready to render as text. Source order is preserved.
 */
export function buildOwnList(args: {
  stickers: Array<Pick<StoredSticker, 'id' | 'code'> & { teamId?: string }>;
  teams: Array<Pick<StoredTeam, 'id'> & { flag?: string }>;
  inventory: Map<string, number>;
}): OwnListGroups {
  const teamEmoji = new Map<string, string>();
  for (const t of args.teams) {
    if (t.flag) teamEmoji.set(t.id.toUpperCase(), t.flag);
  }

  const dupOrder: string[] = [];
  const dupNumbers = new Map<string, string[]>();
  const missOrder: string[] = [];
  const missNumbers = new Map<string, string[]>();

  for (const s of args.stickers) {
    const qty = args.inventory.get(s.id) ?? 0;

    // Determine the display prefix. Prefer teamId (clean source of truth).
    let prefix: string;
    if (s.teamId && teamEmoji.has(s.teamId.toUpperCase())) {
      prefix = s.teamId.toUpperCase();
    } else {
      // Synthetic groups: FWC (FIFA World Cup specials), INTRO (Panini
      // logo, no team).
      const m = s.code.match(/^([A-Za-z]+)?(\d+)$/);
      if (!m || !m[1]) {
        prefix = 'INTRO';
      } else {
        const upper = m[1].toUpperCase();
        if (upper === 'FWC' || upper === 'WFC') {
          prefix = 'FWC';
        } else if (teamEmoji.has(upper)) {
          prefix = upper;
        } else {
          prefix = upper;
        }
      }
    }

    const numeric = s.code.replace(/^[A-Za-z]+/, '');

    if (qty > 1) {
      if (!dupNumbers.has(prefix)) {
        dupNumbers.set(prefix, []);
        dupOrder.push(prefix);
      }
      dupNumbers.get(prefix)!.push(numeric);
    } else {
      // qty === 1: not in either list (one copy is the "owned" baseline).
    }

    if (qty === 0) {
      if (!missNumbers.has(prefix)) {
        missNumbers.set(prefix, []);
        missOrder.push(prefix);
      }
      missNumbers.get(prefix)!.push(numeric);
    }
  }

  const sortByNumeric = (a: string, b: string) => {
    const na = Number.parseInt(a, 10);
    const nb = Number.parseInt(b, 10);
    if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
    return na - nb;
  };

  return {
    duplicates: dupOrder.map((p) => ({
      prefix: p,
      emoji: dupNumbers.get(p)!.length ? emojiFor(p, teamEmoji) : '',
      numbers: [...dupNumbers.get(p)!].sort(sortByNumeric),
    })),
    missing: missOrder.map((p) => ({
      prefix: p,
      emoji: missNumbers.get(p)!.length ? emojiFor(p, teamEmoji) : '',
      numbers: [...missNumbers.get(p)!].sort(sortByNumeric),
    })),
  };
}

function emojiFor(prefix: string, teamEmoji: Map<string, string>): string {
  if (prefix === 'FWC') return '🏆';
  if (prefix === 'INTRO') return '';
  return teamEmoji.get(prefix) ?? '🏳️';
}
