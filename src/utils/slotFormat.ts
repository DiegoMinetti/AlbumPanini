/**
 * Render a symbolic bracket slot string (`"1A"`, `"2H"`, `"3CEFHI"`,
 * `"T3"`, `"W73"`, `"L101"`, …) in a way that's readable in the UI when
 * the slot can't be auto-resolved.
 *
 * The new `3[A-L]+` slots (FIFA Annex C best-third-from-set) are the
 * interesting case: `3CEFHI` is opaque — we expand it to
 * "3.º de {C, E, F, H, I}" so the user understands this side of the
 * bracket might end up being any of those teams. The full explanation
 * lives in the i18n string `tournament.slot.bestThirdHint`, rendered as
 * a tooltip on the slot label.
 */
export interface FormattedSlot {
  /** Human-readable label, suitable for the row's place-holder slot. */
  label: string;
  /** Optional tooltip text (already i18n'd by the caller). */
  hint?: string;
  /** The 8 best-third-from-set match numbers that the hint applies to. */
  isBestThirdSet?: boolean;
  /** Raw letters the slot is asking about (e.g. ["C","E","F","H","I"]). */
  groups?: string[];
}

const BEST_THIRD_SET = /^3([A-L]+)$/;

export function formatSlotLabel(slot: string | undefined): FormattedSlot {
  if (!slot) return { label: '—' };
  const match = BEST_THIRD_SET.exec(slot);
  if (match) {
    const letters = match[1] ?? '';
    const groups = letters.split('').join(', ');
    return {
      label: `3.º de {${groups}}`, // caller substitutes with i18n key
      isBestThirdSet: true,
      groups: letters.split(''),
    };
  }
  // All other slot shapes keep their raw form: "1A", "2H", "T3", "W73", …
  return { label: slot };
}
