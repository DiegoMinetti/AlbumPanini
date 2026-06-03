/**
 * Sticker code normalization shared by OCR and bulk import.
 *
 * Printed codes look like "ARG 1", "BRA 12", "JOR 14" (and sometimes
 * "arg-1", "ARG_01"). We normalize to an uppercase, separator-free,
 * zero-stripped canonical form so all input paths resolve consistently.
 */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') // drop spaces, dashes, dots, etc.
    .replace(/^([A-Z]+)0+(\d)/, '$1$2'); // ARG01 -> ARG1
}

/**
 * Split a printed code into its alpha prefix and numeric part, when present.
 * Returns null parts when the shape is not "letters + digits".
 */
export function parseCode(raw: string): {
  prefix: string | null;
  number: number | null;
  normalized: string;
} {
  const normalized = normalizeCode(raw);
  const match = normalized.match(/^([A-Z]+)(\d+)$/);
  if (!match) return { prefix: null, number: null, normalized };
  return {
    prefix: match[1],
    number: Number.parseInt(match[2], 10),
    normalized,
  };
}

/**
 * Extract candidate sticker codes from a free-form blob (OCR text or a pasted
 * list). Handles both line-separated and space-separated input.
 */
export function extractCodes(input: string): string[] {
  const tokens = input
    .split(/[\n\r,;]+/)
    .flatMap((line) => line.trim().split(/\s{2,}|\t/))
    .map((t) => t.trim())
    .filter(Boolean);

  const codes: string[] = [];
  for (const token of tokens) {
    // A token may itself be "ARG 1" (single space) — keep that intact, but also
    // handle "ARG1 BRA2" style by matching code patterns.
    const matches = token.match(/[A-Za-z]+\s?\d+/g);
    if (matches) {
      codes.push(...matches.map((m) => m.trim()));
    } else if (token) {
      codes.push(token);
    }
  }
  return codes;
}
