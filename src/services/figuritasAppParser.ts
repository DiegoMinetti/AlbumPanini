/**
 * Parser for the "missing stickers" list exported by figuritas.app.
 *
 * The list is plain text in the shape:
 *
 *   FWC 🏆: 00, 1, 3
 *   FWC 🌎: 7
 *   CZE 🇨🇿: 1, 3, 20
 *   USA 🇺🇸: 3, 15, 16, 19
 *
 * Each non-blank line is `PREFIX <some emoji(s)>: n1, n2, …`. The prefix is an
 * alpha code (a 3-letter FIFA code for national teams, or a synthetic code like
 * `FWC` for World Cup specials / opening cards). The emoji is purely cosmetic
 * — we ignore it. The numbers are the *printed* numbers within that group, so
 * they need to be combined with the prefix to form the full sticker code that
 * the local collection understands (e.g. `USA` + `15` → `USA15`).
 *
 * The parser is intentionally tolerant: blank lines, leading/trailing spaces
 * and "FWC"-style multi-emoji lines all parse cleanly. Numbers with leading
 * zeros (`00`, `07`) are preserved verbatim.
 */

export interface ParsedLine {
  /** Original prefix as it appeared in the text (uppercased). */
  prefix: string;
  /** Raw emoji cluster, kept for display purposes. */
  emoji: string;
  /** Raw numbers, in source order, with leading zeros preserved. */
  numbers: string[];
}

export interface ParsedList {
  lines: ParsedLine[];
  /**
   * Flat list of `(prefix, number)` tuples — exactly what each line contributes,
   * in source order. Useful for the caller to resolve into sticker codes.
   */
  entries: { prefix: string; number: string }[];
}

/**
 * Match a single non-blank line. Returns null when the line is empty, a
 * comment, or does not match the expected `<prefix> <emoji>: n,n,n` shape.
 *
 * - prefix: 1+ ASCII letters (case-insensitive, uppercased on capture)
 * - the middle "emoji" group is anything until the first colon — it can
 *   contain zero-width joiners, regional indicators, etc.
 * - the trailing group is the comma-separated list of numbers.
 */
const LINE_RE = /^\s*([A-Za-z]+)\s+([^:]+?):\s*(.+?)\s*$/;

export function parseFiguritasAppList(input: string): ParsedList {
  const lines: ParsedLine[] = [];
  const entries: { prefix: string; number: string }[] = [];

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Tolerate simple comment-style lines (`#`, `//`) used as separators.
    if (line.startsWith('#') || line.startsWith('//')) continue;

    const m = LINE_RE.exec(line);
    if (!m) continue;

    const prefix = m[1].toUpperCase();
    const emoji = m[2].trim();
    const numbersRaw = m[3];

    // Split on commas / semicolons / vertical bars; keep alphanumerics inside
    // each token so the caller can decide how to format them.
    const numbers = numbersRaw
      .split(/[,;|]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    if (numbers.length === 0) continue;

    lines.push({ prefix, emoji, numbers });
    for (const number of numbers) entries.push({ prefix, number });
  }

  return { lines, entries };
}

/** Build the candidate printed-codes for a (prefix, number) pair. */
export function candidateCodes(prefix: string, number: string): string[] {
  // The number can be a pure integer ("1", "07") or already include a numeric
  // suffix. We always emit a "prefix + number" candidate plus a fallback that
  // drops the prefix when the number itself looks like a self-contained code
  // (e.g. `00` is the Panini intro sticker in the World Cup collection).
  const trimmedNumber = number.replace(/^0+(?=\d)/, '');
  const candidates: string[] = [];
  const joined = `${prefix}${trimmedNumber}`;
  candidates.push(joined);
  if (number !== trimmedNumber) {
    candidates.push(`${prefix}${number}`);
  }
  // Fallback: number alone, both with and without leading zeros.
  if (number !== trimmedNumber) candidates.push(number);
  candidates.push(trimmedNumber);
  // Dedupe while preserving order.
  return [...new Set(candidates)];
}

/* ------------------------------------------------------------------ */
/* Export side: build a figuritas.app–style list of stickers the user */
/* has duplicates of, so they can share it with friends.               */
/* ------------------------------------------------------------------ */

export interface DuplicateGroup {
  /** Display prefix (team code, "FWC", etc.). Uppercased, deduped. */
  prefix: string;
  /** Decorative emoji to render next to the prefix (team flag, 🏆, etc.). */
  emoji: string;
  /** Sorted list of sticker *numbers* within this group (e.g. ["1", "3", "20"]). */
  numbers: string[];
}

export interface BuildDuplicatesInput {
  /** Sticker rows of the active collection, with `code` and `teamId`. */
  stickers: { code: string; teamId?: string }[];
  /** Team rows of the active collection, with `id` and `flag` (emoji). */
  teams: { id: string; flag?: string }[];
  /** stickerId -> owned quantity. Stickers with quantity > 1 are duplicates. */
  inventory: Map<string, number> | Record<string, number>;
  /**
   * Optional override for the synthetic "FWC / FIFA World Cup" group emoji.
   * Defaults to 🏆.
   */
  wfcEmoji?: string;
}

const DEFAULT_WFC_EMOJI = '🏆';

/**
 * Split a sticker code into (prefix, numeric) the same way the parser does,
 * but tolerant of codes that don't start with a known team (e.g. "00" or
 * "FWC1"). Returns `null` prefix when the shape is unusual.
 */
function splitCode(code: string): { prefix: string | null; number: string } {
  const m = code.match(/^([A-Za-z]+)?(\d+)$/);
  if (!m) return { prefix: null, number: code };
  return { prefix: (m[1] ?? '').toUpperCase(), number: m[2] };
}

/**
 * Build a `figuritas.app`–style text from the user's duplicate stickers.
 *
 * The output mirrors what the app generates, one line per prefix:
 *
 *   MEX 🇲🇽: 2, 3
 *   FWC 🏆: 7
 *   USA 🇺🇸: 15, 16
 *
 * Stickers are grouped by their team prefix (or `FWC` for the FIFA World Cup
 * specials). The synthetic `INTRO` group (e.g. the `00` Panini Logo sticker)
 * is rendered first with no emoji. Lines are emitted in source order — the
 * caller should pass stickers sorted by their album `order` so the output
 * matches the visual order of the physical album.
 */
export function buildDuplicatesList(input: BuildDuplicatesInput): {
  groups: DuplicateGroup[];
  text: string;
} {
  const wfcEmoji = input.wfcEmoji ?? DEFAULT_WFC_EMOJI;

  const teamEmoji = new Map<string, string>();
  for (const t of input.teams) {
    if (t.flag) teamEmoji.set(t.id.toUpperCase(), t.flag);
  }

  // Group sticker numbers by their "display prefix" in source order.
  // The first time we see a prefix determines the group order.
  const order: string[] = [];
  const numbersByPrefix = new Map<string, string[]>();

  for (const sticker of input.stickers) {
    const qty =
      input.inventory instanceof Map
        ? (input.inventory.get(sticker.code) ??
          input.inventory.get(
            (sticker as { id?: string }).id ?? sticker.code
          ) ??
          0)
        : ((input.inventory as Record<string, number>)[sticker.code] ??
          (input.inventory as Record<string, number>)[
            (sticker as { id?: string }).id ?? ''
          ] ??
          0);
    // Duplicates = at least one extra copy beyond the album slot.
    if (qty <= 1) continue;

    // Prefer the sticker.teamId when present and recognized — that's the
    // cleanest source of the prefix and guarantees we use the team's flag.
    let prefix: string | null = null;
    if (sticker.teamId && teamEmoji.has(sticker.teamId.toUpperCase())) {
      prefix = sticker.teamId.toUpperCase();
    } else {
      const split = splitCode(sticker.code);
      if (split.prefix && teamEmoji.has(split.prefix)) {
        prefix = split.prefix;
      } else if (split.prefix === 'FWC' || split.prefix === 'WFC') {
        prefix = 'FWC';
      } else if (!split.prefix) {
        prefix = 'INTRO';
      } else {
        // Unknown team prefix — keep it as-is so the user still sees the line.
        prefix = split.prefix;
      }
    }

    if (!numbersByPrefix.has(prefix)) {
      numbersByPrefix.set(prefix, []);
      order.push(prefix);
    }
    numbersByPrefix.get(prefix)!.push(sticker.code.replace(/^[A-Za-z]+/, ''));
  }

  // Build the final groups + text, keeping the source order.
  const groups: DuplicateGroup[] = [];
  const lines: string[] = [];
  for (const prefix of order) {
    const rawNumbers = numbersByPrefix.get(prefix)!;
    // Sort numerically (so "2" < "10") but keep the original string form.
    const sorted = [...rawNumbers].sort((a, b) => {
      const na = Number.parseInt(a, 10);
      const nb = Number.parseInt(b, 10);
      if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
      return na - nb;
    });
    const emoji =
      prefix === 'FWC'
        ? wfcEmoji
        : prefix === 'INTRO'
          ? ''
          : (teamEmoji.get(prefix) ?? '🏳️');
    groups.push({ prefix, emoji, numbers: sorted });
    lines.push(
      emoji
        ? `${prefix} ${emoji}: ${sorted.join(', ')}`
        : `${prefix}: ${sorted.join(', ')}`
    );
  }

  return { groups, text: lines.join('\n') };
}
