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
