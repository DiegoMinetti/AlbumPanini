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
 * Our own format (what we copy/share) is two labelled blocks separated
 * by a blank line, preceded by an optional header line:
 *
 *   <header line: "<album> · Panini Tracker">   ← optional
 *   Tengo repetidas
 *   PREFIX1: n, n, n
 *   PREFIX2: n
 *
 *   Me faltan
 *   PREFIX1: n
 *   PREFIX2: n, n
 *
 *   Abrí en la app
 *   <deep-link URL>
 *   ...
 *
 * The block headers ("Tengo repetidas" / "Me faltan") are recognised
 * case-insensitively in the parser — see `SECTION_HEADERS`. The deep
 * link is a compact, gzipped+base64url payload (see `encodePayload` /
 * `decodePayload`) that lets the app open straight into the right
 * collection with the right list pre-filled.
 *
 * ## External format (the other app)
 *
 *   Me faltan
 *   PREFIX <emoji>: n, n, n
 *   ...
 *
 *   Repetidas
 *   PREFIX <emoji>: n
 *   ...
 *
 *   Descarga la app
 *   https://www.figuritas.app/es/descargar
 *
 * Section headers ("Me faltan" / "Repetidas" / "Missing" / "Duplicates")
 * are recognized case-insensitively. If a text has no headers, parsing
 * fails with a clear error — the user can re-share with the headers
 * intact.
 */

import { db } from '@/db';
import type { StoredSticker, StoredTeam } from '@/types/collection';
import { normalizeCode } from '@/utils/code';
import { decodeCompact, encodeCompact } from '@/utils/compression';
import {
  albumGroupSort,
  albumPrefixOrder,
  sortStickersByAlbumOrder,
} from '@/utils/albumOrder';
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Wire format — compact payload (encoded into the deep-link URL).     */
/* ------------------------------------------------------------------ */

const EXCHANGE_PAYLOAD_VERSION = 1 as const;

const exchangePayloadSchema = z.object({
  v: z.literal(EXCHANGE_PAYLOAD_VERSION),
  c: z.string().min(1), // collectionId
  // Sections are identified by a short key. `d` = duplicates, `m` = missing.
  d: z.array(z.string()).default([]),
  m: z.array(z.string()).default([]),
});

export type ExchangePayload = z.infer<typeof exchangePayloadSchema>;

/** Where this text came from. Drives the UI labelling. */
export type ExchangeSource = 'own' | 'external';

/** Result of parsing a friend's text. The friend's perspective, not ours. */
export interface ParsedExchangeText {
  source: ExchangeSource;
  collectionId: string | null; // present only for `own` format
  /** Sticker codes the friend is missing (= what we could give them). */
  friendWants: string[];
  /** Sticker codes the friend has duplicates of (= what they could give us). */
  friendHasExtra: string[];
  /** External-only: lines we couldn't resolve. */
  unresolved: { prefix: string; number: string }[];
  /** Original line list, preserved for the UI. */
  lines: { prefix: string; emoji: string; numbers: string[] }[];
  /** Per-line breakdown, in source order. */
  byLine: ParsedLineSection[];
  /** Friendly error message when parsing is rejected (e.g. no headers). */
  error: string | null;
}

export interface ParsedLineSection {
  /** "Me faltan" / "Repetidas" / "Faltan" / etc. Null if no header was found. */
  heading: string | null;
  emoji: string;
  numbers: string[];
}

/* ------------------------------------------------------------------ */
/* Deep link                                                            */
/* ------------------------------------------------------------------ */

const DEEP_LINK_BASE = 'https://diegominetti.github.io/AlbumPanini/';

/** Section of a list inside a deep link. */
export type ExchangeSection = 'duplicates' | 'missing';

const SECTION_KEYS: Record<ExchangeSection, 'd' | 'm'> = {
  duplicates: 'd',
  missing: 'm',
};

/** Hard cap on a single chunk's URL length — leaves headroom in chat apps. */
const CHUNK_MAX_URL_BYTES = 1500;

/**
 * Build a deep link for a given collection + section.
 * The sticker codes are passed through `normalizeCode` to align with the DB.
 */
export function buildDeepLink(
  collectionId: string,
  section: ExchangeSection,
  stickerCodes: string[]
): string {
  const key = SECTION_KEYS[section];
  const normalized = stickerCodes.map(normalizeCode);
  const payload: ExchangePayload = {
    v: EXCHANGE_PAYLOAD_VERSION,
    c: collectionId,
    d: key === 'd' ? normalized : [],
    m: key === 'm' ? normalized : [],
  };
  const encoded = encodePayload(payload);
  return `${DEEP_LINK_BASE}?c=${encodeURIComponent(collectionId)}&s=${key}&d=${encoded}`;
}

/* ------------------------------------------------------------------ */
/* Build the user-facing text                                          */
/* ------------------------------------------------------------------ */

/**
 * Build a copy-pasteable text with both sections + a deep link per chunk.
 *
 * Output shape:
 *   <header line>                       ← "<album> · Panini Tracker" (if album)
 *   Tengo repetidas
 *   PREFIX1: n, n, n
 *   PREFIX2: n
 *
 *   Me faltan
 *   PREFIX1: n
 *   PREFIX2: n, n
 *
 *   Abrí en la app
 *   <deep-link url>
 *   --- 1/N ---                         ← only if chunked
 *   <deep-link url>
 */
export function buildExchangeText(args: {
  /** Localized labels for the shared text. */
  labels: {
    openInApp: string;
    /** Section header for the duplicates block (e.g. "Tengo repetidas"). */
    headingDuplicates: string;
    /** Section header for the missing block (e.g. "Me faltan"). */
    headingMissing: string;
    /** Optional friendly header line (e.g. "World Cup 2026 · Panini Tracker"). */
    headerTitle?: string;
  };
  collectionId: string;
  /** Stickers the user has duplicates of. Block 1. */
  duplicates: { prefix: string; emoji: string; numbers: string[] }[];
  /** Stickers the user is missing. Block 2. */
  missing: { prefix: string; emoji: string; numbers: string[] }[];
}): string {
  const { labels, collectionId, duplicates, missing } = args;

  const dupBody = renderSection(duplicates);
  const missBody = renderSection(missing);

  const dupLink = buildDeepLink(
    collectionId,
    'duplicates',
    flatIds(duplicates)
  );
  const missLink = buildDeepLink(
    collectionId,
    'missing',
    flatIds(missing)
  );

  const allLinks = [dupLink, missLink];
  const chunked = chunkLinks(allLinks, CHUNK_MAX_URL_BYTES);

  const linkLines: string[] = [labels.openInApp];
  if (allLinks.length === 1) {
    linkLines.push(allLinks[0]);
  } else if (chunked.length === 1) {
    allLinks.forEach((url) => linkLines.push(url));
  } else {
    chunked.forEach((url, idx) => {
      linkLines.push(url);
      linkLines.push(`--- ${idx + 1}/${chunked.length} ---`);
    });
  }

  // Build the text as a stack of "parts" joined by blank lines. We
  // always include the open-in-app block, but the duplicates / missing
  // sections are only included when the user actually has content for
  // them (so an empty list doesn't end with a stray section header).
  const parts: string[] = [];
  if (labels.headerTitle) parts.push(labels.headerTitle);
  if (dupBody) {
    parts.push([labels.headingDuplicates, dupBody].filter(Boolean).join('\n'));
  }
  if (missBody) {
    parts.push([labels.headingMissing, missBody].filter(Boolean).join('\n'));
  }
  parts.push(linkLines.join('\n'));
  return parts.join('\n\n');
}

function renderSection(
  groups: { prefix: string; emoji: string; numbers: string[] }[]
): string {
  if (groups.length === 0) return '';
  const lines = groups.map((g) =>
    g.emoji ? `${g.prefix} ${g.emoji}: ${g.numbers.join(', ')}` : `${g.prefix}: ${g.numbers.join(', ')}`
  );
  return lines.join('\n');
}

function flatIds(groups: { prefix: string; numbers: string[] }[]): string[] {
  return groups.flatMap((g) => g.numbers.map((n) => `${g.prefix}${n}`));
}

function chunkLinks(urls: string[], maxBytes: number): string[] {
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

/** A line + its section context, after parsing. */
interface RawLine {
  prefix: string;
  emoji: string;
  numbers: string[];
  /** Section heading in effect for this line, or null for the pre-heading prefix. */
  section: 'wants' | 'extras' | null;
}

interface ParsedRawText {
  /** All `PREFIX <emoji>: n, n, n` lines, with their section context. */
  lines: RawLine[];
  /** Section headings found in the text, in order. */
  sections: { heading: string; kind: 'wants' | 'extras' }[];
}

const SECTION_HEADERS: { pattern: RegExp; kind: 'wants' | 'extras' }[] = [
  // Spanish
  { pattern: /^\s*me\s*faltan\s*$/i, kind: 'wants' },
  { pattern: /^\s*repetidas?\s*$/i, kind: 'extras' },
  { pattern: /^\s*repetido\s*$/i, kind: 'extras' },
  { pattern: /^\s*tengo\s+repetidas\s*$/i, kind: 'extras' },
  { pattern: /^\s*tengo\s+repetido\s*$/i, kind: 'extras' },
  { pattern: /^\s*faltan\s*$/i, kind: 'wants' },
  // English
  { pattern: /^\s*missing\s*$/i, kind: 'wants' },
  { pattern: /^\s*duplicates?\s*$/i, kind: 'extras' },
  { pattern: /^\s*i\s+have\s+duplicates\s*$/i, kind: 'extras' },
  { pattern: /^\s*i'?m\s+missing\s*$/i, kind: 'wants' },
  { pattern: /^\s*spare\s*$/i, kind: 'extras' },
  { pattern: /^\s*spare\s+stickers?\s*$/i, kind: 'extras' },
  // Portuguese
  { pattern: /^\s*faltam\s*$/i, kind: 'wants' },
  { pattern: /^\s*repetidas?\s*$/i, kind: 'extras' },
];

function detectSectionHeading(line: string): 'wants' | 'extras' | null {
  for (const s of SECTION_HEADERS) {
    if (s.pattern.test(line)) return s.kind;
  }
  return null;
}

function parseLinesWithSections(input: string): ParsedRawText {
  const lines: RawLine[] = [];
  const sections: { heading: string; kind: 'wants' | 'extras' }[] = [];
  let currentSection: 'wants' | 'extras' | null = null;

  for (const rawLine of input.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    // Strip a trailing URL so it doesn't get parsed as a "line" (the
    // app banner is typically the last line of an external-format paste).
    if (/^https?:\/\//i.test(trimmed)) continue;

    const headingKind = detectSectionHeading(trimmed);
    if (headingKind) {
      currentSection = headingKind;
      sections.push({ heading: trimmed, kind: headingKind });
      continue;
    }

    const m = LINE_RE.exec(trimmed);
    if (!m) continue;
    const prefix = m[1].toUpperCase();
    const emoji = m[2].trim();
    const numbers = m[3]
      .split(/[,;|]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (numbers.length === 0) continue;
    lines.push({ prefix, emoji, numbers, section: currentSection });
  }

  return { lines, sections };
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

function extractUrls(input: string): string[] {
  return Array.from(input.matchAll(URL_RE)).map((m) => m[1]);
}

/**
 * Parse a block of text. Detects whether it's our own format (with a deep
 * link) or an external format. Returns the friend's perspective
 * (friendWants / friendHasExtra) and a per-line breakdown.
 */
export function parseExchangeText(input: string): ParsedExchangeText {
  if (!input || !input.trim()) {
    return emptyParsed('external', null, 'empty');
  }

  const urls = extractUrls(input);
  const ownUrls = urls.filter((u) => u.startsWith(`${DEEP_LINK_BASE}?`));

  if (ownUrls.length > 0) {
    return parseOwnFormat(ownUrls, input);
  }

  return parseExternalFormat(input);
}

function parseOwnFormat(
  ownUrls: string[],
  fullText: string
): ParsedExchangeText {
  const friendWants = new Set<string>();
  const friendHasExtra = new Set<string>();
  let collectionId: string | null = null;

  for (const url of ownUrls) {
    const parsed = parseDeepLink(url);
    if (!parsed) continue;
    if (collectionId === null) collectionId = parsed.collectionId;
    // In our own format: `d` = duplicates (what the source has extra),
    // `m` = missing (what the source wants). From the receiver's POV,
    // the source's extras = friendHasExtra, the source's missing = friendWants.
    for (const id of parsed.duplicates) friendHasExtra.add(id);
    for (const id of parsed.missing) friendWants.add(id);
  }

  // Also walk the human-readable lines (if any) to populate byLine.
  const cleaned = stripUrlLines(fullText);
  const raw = parseLinesWithSections(cleaned);

  return {
    source: 'own',
    collectionId,
    friendWants: [...friendWants],
    friendHasExtra: [...friendHasExtra],
    unresolved: [],
    lines: raw.lines.map((l) => ({ prefix: l.prefix, emoji: l.emoji, numbers: l.numbers })),
    byLine: groupRawLinesIntoSections(raw),
    error: null,
  };
}

function parseExternalFormat(input: string): ParsedExchangeText {
  const cleaned = stripUrlLines(input);
  const raw = parseLinesWithSections(cleaned);

  if (raw.lines.length === 0) {
    return emptyParsed('external', null, 'empty');
  }

  // External format must have at least one section header. Without one
  // we can't tell which side is which and would silently mis-attribute.
  if (raw.sections.length === 0) {
    return {
      source: 'external',
      collectionId: null,
      friendWants: [],
      friendHasExtra: [],
      unresolved: [],
      lines: raw.lines.map((l) => ({ prefix: l.prefix, emoji: l.emoji, numbers: l.numbers })),
      byLine: [],
      error: 'no-headers',
    };
  }

  const friendWants: string[] = [];
  const friendHasExtra: string[] = [];
  const unresolved: { prefix: string; number: string }[] = [];

  for (const l of raw.lines) {
    if (l.section === null) {
      // Lines before the first header — we don't know which side they're
      // on, so they end up in unresolved rather than being silently dropped.
      for (const n of l.numbers) unresolved.push({ prefix: l.prefix, number: n });
      continue;
    }
    const target = l.section === 'wants' ? friendWants : friendHasExtra;
    for (const n of l.numbers) target.push(`${l.prefix}${n}`);
  }

  return {
    source: 'external',
    collectionId: null,
    friendWants,
    friendHasExtra,
    unresolved,
    lines: raw.lines.map((l) => ({ prefix: l.prefix, emoji: l.emoji, numbers: l.numbers })),
    byLine: groupRawLinesIntoSections(raw),
    error: null,
  };
}

function groupRawLinesIntoSections(raw: ParsedRawText): ParsedLineSection[] {
  return raw.lines.map((l) => ({
    heading: l.section === null ? null : raw.sections.find((s) => s.kind === l.section)?.heading ?? null,
    emoji: l.emoji,
    numbers: l.numbers,
  }));
}

function stripUrlLines(input: string): string {
  return input
    .split(/\r?\n/)
    .filter((line) => !/^https?:\/\//i.test(line.trim()))
    .join('\n');
}

function emptyParsed(
  source: ExchangeSource,
  collectionId: string | null,
  _reason: string
): ParsedExchangeText {
  return {
    source,
    collectionId,
    friendWants: [],
    friendHasExtra: [],
    unresolved: [],
    lines: [],
    byLine: [],
    error: null,
  };
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
/* Resolve parsed text into sticker rows (DB-aware)                      */
/* ------------------------------------------------------------------ */

export interface ResolvedSticker {
  stickerId: string;
  code: string;
  prefix: string;
  number: string;
  emoji: string;
}

export interface ResolvedExchange {
  /** Mis repetidas ∩ lo que el amigo necesita. Le doy al amigo. */
  iCanGive: ResolvedSticker[];
  /** Sus repetidas ∩ lo que yo necesito. El amigo me da. */
  iNeed: ResolvedSticker[];
  /** Mis repetidas que el amigo NO necesita (sobran — no se pueden ofrecer). */
  myExtras: ResolvedSticker[];
  /** Sus repetidas que yo YA tengo (no me sirven — redundantes). */
  friendExtras: ResolvedSticker[];
  /** Lines the user pasted that don't correspond to any sticker in this collection. */
  unresolved: { prefix: string; number: string }[];
}

/**
 * Turn a parsed text into actual sticker rows from the local DB, then
 * classify each one into one of four buckets:
 *
 *   - `iCanGive`    = my duplicates ∩ friendWants
 *   - `iNeed`       = friendHasExtra ∩ my missing
 *   - `myExtras`    = my duplicates ∖ friendWants  (spare stickers I have)
 *   - `friendExtras`= friendHasExtra ∖ my missing  (stickers the friend has that I already have)
 *
 * The user's tap selections in the UI only ever apply to `iCanGive` /
 * `iNeed` (the actionable trade). The extras buckets are visual only.
 */
export async function resolveExchangeText(
  collectionId: string,
  text: string
): Promise<ResolvedExchange> {
  const parsed = parseExchangeText(text);

  const stickers = await db.stickers
    .where('collectionId')
    .equals(collectionId)
    .toArray();

  const sortedStickers = sortStickersByAlbumOrder(stickers);
  const teamsFromStickerOrder: StoredTeam[] = [];
  const seenTeam = new Set<string>();
  for (const s of sortedStickers) {
    if (s.teamId) {
      const upper = s.teamId.toUpperCase();
      if (!seenTeam.has(upper)) {
        seenTeam.add(upper);
        teamsFromStickerOrder.push({
          uid: '',
          id: upper,
          collectionId,
          name: upper,
        });
      }
    }
  }

  const byCode = new Map<string, StoredSticker>();
  for (const s of stickers) byCode.set(s.normalizedCode, s);

  // Friend's resolved lists (one entry per sticker id the friend mentioned)
  const friendWantsIds = parsed.friendWants;
  const friendExtrasIds = parsed.friendHasExtra;

  // Index my inventory once.
  const inventoryRows = await db.inventory
    .where('collectionId')
    .equals(collectionId)
    .toArray();
  const myQty = new Map(inventoryRows.map((i) => [i.stickerId, i.quantity]));

  // ----- Resolve friendWants -> which of those do I have as duplicates?
  const iCanGive: ResolvedSticker[] = [];
  const friendWantsResolved: ResolvedSticker[] = [];
  const friendWantsUnresolved: { prefix: string; number: string }[] = [];
  for (const code of friendWantsIds) {
    const s = byCode.get(normalizeCode(code));
    if (!s) {
      friendWantsUnresolved.push({ prefix: '?', number: code });
      continue;
    }
    const r = toResolved(s, '', '', '');
    friendWantsResolved.push(r);
    const qty = myQty.get(s.id) ?? 0;
    if (qty > 1) iCanGive.push(r);
  }

  // ----- Resolve friendHasExtra -> which of those do I need?
  const iNeed: ResolvedSticker[] = [];
  const friendExtrasResolved: ResolvedSticker[] = [];
  const friendExtrasUnresolved: { prefix: string; number: string }[] = [];
  for (const code of friendExtrasIds) {
    const s = byCode.get(normalizeCode(code));
    if (!s) {
      friendExtrasUnresolved.push({ prefix: '?', number: code });
      continue;
    }
    const r = toResolved(s, '', '', '');
    friendExtrasResolved.push(r);
    const qty = myQty.get(s.id) ?? 0;
    if (qty === 0) iNeed.push(r);
  }

  // ----- myExtras: my duplicates that the friend did NOT say they need.
  // Walk the local sticker set so we surface every duplicate the user
  // has, even if it never appeared in the pasted text.
  const friendWantsCodes = new Set(
    friendWantsResolved.map((r) => r.code.toUpperCase())
  );
  const myExtras: ResolvedSticker[] = [];
  for (const s of sortedStickers) {
    const qty = myQty.get(s.id) ?? 0;
    if (qty <= 1) continue;
    if (friendWantsCodes.has(s.code.toUpperCase())) continue;
    myExtras.push(toResolved(s, '', '', ''));
  }

  // ----- friendExtras: the friend's duplicates I already have.
  const iNeedCodes = new Set(iNeed.map((r) => r.code.toUpperCase()));
  const friendExtras: ResolvedSticker[] = [];
  for (const r of friendExtrasResolved) {
    if (iNeedCodes.has(r.code.toUpperCase())) continue;
    friendExtras.push(r);
  }

  return {
    iCanGive: sortResolvedStickers(iCanGive, teamsFromStickerOrder),
    iNeed: sortResolvedStickers(iNeed, teamsFromStickerOrder),
    myExtras: sortResolvedStickers(myExtras, teamsFromStickerOrder),
    friendExtras: sortResolvedStickers(friendExtras, teamsFromStickerOrder),
    unresolved: [...friendWantsUnresolved, ...friendExtrasUnresolved, ...parsed.unresolved],
  };
}

function toResolved(
  s: StoredSticker,
  prefix: string,
  number: string,
  emoji: string
): ResolvedSticker {
  return {
    stickerId: s.id,
    code: s.code,
    prefix,
    number,
    emoji,
  };
}

/**
 * Sort resolved stickers by album order (group in album order, then by
 * the sticker's `order` field). Used by `resolveExchangeText` so the UI
 * always shows the match in the same order as the physical album.
 */
function sortResolvedStickers(
  items: ResolvedSticker[],
  teams: StoredTeam[]
): ResolvedSticker[] {
  const order = albumPrefixOrder(teams);
  const idx = new Map<string, number>();
  order.forEach((p, i) => idx.set(p, i));

  const numericCmp = (a: ResolvedSticker, b: ResolvedSticker): number => {
    const na = Number.parseInt(a.code.replace(/^\D+/, ''), 10);
    const nb = Number.parseInt(b.code.replace(/^\D+/, ''), 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return a.code.localeCompare(b.code);
  };

  return [...items].sort((a, b) => {
    const pa = a.code.replace(/\d.*$/, '').toUpperCase();
    const pb = b.code.replace(/\d.*$/, '').toUpperCase();
    const ai = idx.get(pa);
    const bi = idx.get(pb);
    if (ai !== undefined && bi !== undefined) {
      if (ai !== bi) return ai - bi;
      return numericCmp(a, b);
    }
    if (ai === undefined && bi === undefined) return numericCmp(a, b);
    return ai === undefined ? 1 : -1;
  });
}

/* ------------------------------------------------------------------ */
/* Build the per-prefix lines (for the user's own list)                */
/* ------------------------------------------------------------------ */

export interface OwnListGroups {
  duplicates: { prefix: string; emoji: string; numbers: string[] }[];
  missing: { prefix: string; emoji: string; numbers: string[] }[];
}

/**
 * The first copy (copyIndex === 0) of any sticker is the "album copy"
 * — the one that goes into the physical album. It is not tradable.
 * Only the extras (copyIndex >= 1) can be selected for share or reserved.
 *
 * The storage model keeps all copies symmetric; this is a UX-level rule
 * to avoid the obvious mistake of "I traded my only USA15 and now the
 * album has a hole".
 */
export function isTradeableCopy(copyIndex: number): boolean {
  return copyIndex >= 1;
}

/**
 * Chip key used by the ExchangePage selection set. Format: `<code>#<copyIndex>`.
 */
export function chipKey(code: string, copyIndex: number): string {
  return `${code}#${copyIndex}`;
}

/**
 * Parse a chip key back into its components. Returns null if the key
 * doesn't follow the `<code>#<copyIndex>` convention.
 */
export function parseChipKey(key: string): { code: string; copyIndex: number } | null {
  const idx = key.lastIndexOf('#');
  if (idx <= 0) return null;
  const code = key.slice(0, idx);
  const copyIndex = Number.parseInt(key.slice(idx + 1), 10);
  if (!Number.isFinite(copyIndex)) return null;
  return { code, copyIndex };
}

/**
 * Filter a set of chip keys (`<code>#<copyIndex>`) down to only the
 * tradeable ones. Always returns a fresh Set.
 *
 * The first copy of every sticker (copyIndex 0) is the "album copy" and
 * is never tradable. Defense in depth: callers should never include
 * such keys in the input, but this helper guarantees the contract.
 */
export function filterTradeableChipKeys(keys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const key of keys) {
    const parsed = parseChipKey(key);
    if (parsed && isTradeableCopy(parsed.copyIndex)) out.add(key);
  }
  return out;
}

/**
 * Build the per-prefix groups (`{prefix, emoji, numbers: string[]}`)
 * for a set of tradeable chip keys. Used by the "copy my selection"
 * handlers to translate the UI's chip selection into the text format.
 *
 * The output is sorted by the original group order (preserved by
 * `groups`) and, within a group, by the chip order the user saw.
 */
export function pickTradeableGroups(
  groups: { prefix: string; emoji: string; numbers: string[] }[],
  selectedKeys: Set<string>
): { prefix: string; emoji: string; numbers: string[] }[] {
  const out: { prefix: string; emoji: string; numbers: string[] }[] = [];
  for (const g of groups) {
    const kept: string[] = [];
    for (let i = 0; i < g.numbers.length; i++) {
      const n = g.numbers[i];
      if (i === 0) continue; // copyIndex 0 is never tradable
      if (selectedKeys.has(chipKey(`${g.prefix}${n}`, i))) kept.push(n);
    }
    if (kept.length > 0) out.push({ prefix: g.prefix, emoji: g.emoji, numbers: kept });
  }
  return out;
}

/**
 * Group the user's own inventory into the two "Repetidas" / "Faltan"
 * buckets, ready to render as text. Source order is preserved.
 */
export function buildOwnList(args: {
  stickers: Array<Pick<StoredSticker, 'id' | 'code'> & { teamId?: string; order?: number }>;
  teams: Array<Pick<StoredTeam, 'id'> & { flag?: string }>;
  inventory: Map<string, number>;
}): OwnListGroups {
  const teamEmoji = new Map<string, string>();
  for (const t of args.teams) {
    if (t.flag) teamEmoji.set(t.id.toUpperCase(), t.flag);
  }

  const stickerByCode = new Map<string, (typeof args.stickers)[number]>();
  for (const s of args.stickers) stickerByCode.set(s.code, s);

  const dupOrder: string[] = [];
  const dupNumbers = new Map<string, string[]>();
  const missOrder: string[] = [];
  const missNumbers = new Map<string, string[]>();

  for (const s of args.stickers) {
    const qty = args.inventory.get(s.id) ?? 0;

    let prefix: string;
    if (s.teamId && teamEmoji.has(s.teamId.toUpperCase())) {
      prefix = s.teamId.toUpperCase();
    } else {
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
      // Emit N copies so the UI can render one chip per inventory slot.
      // If the user has 3 copies of USA15, numbers is ['15', '15', '15'].
      for (let i = 0; i < qty; i++) {
        dupNumbers.get(prefix)!.push(numeric);
      }
    }

    if (qty === 0) {
      if (!missNumbers.has(prefix)) {
        missNumbers.set(prefix, []);
        missOrder.push(prefix);
      }
      missNumbers.get(prefix)!.push(numeric);
    }
  }

  const orderByNumber = (a: string, b: string): number => {
    const oa = stickerByCode.get(a)?.order;
    const ob = stickerByCode.get(b)?.order;
    if (oa !== undefined && ob !== undefined) return oa - ob;
    if (oa !== undefined) return -1;
    if (ob !== undefined) return 1;
    const na = Number.parseInt(a, 10);
    const nb = Number.parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  };

  const dupGroups: {
    prefix: string;
    emoji: string;
    numbers: string[];
  }[] = dupOrder.map((p) => ({
    prefix: p,
    emoji: dupNumbers.get(p)!.length ? emojiFor(p, teamEmoji) : '',
    numbers: [...dupNumbers.get(p)!].sort(orderByNumber),
  }));
  const missGroups: {
    prefix: string;
    emoji: string;
    numbers: string[];
  }[] = missOrder.map((p) => ({
    prefix: p,
    emoji: missNumbers.get(p)!.length ? emojiFor(p, teamEmoji) : '',
    numbers: [...missNumbers.get(p)!].sort(orderByNumber),
  }));

  return {
    duplicates: albumGroupSort(dupGroups, args.teams as StoredTeam[]),
    missing: albumGroupSort(missGroups, args.teams as StoredTeam[]),
  };
}

function emojiFor(prefix: string, teamEmoji: Map<string, string>): string {
  if (prefix === 'FWC') return '🏆';
  if (prefix === 'INTRO') return '';
  return teamEmoji.get(prefix) ?? '🏳️';
}
