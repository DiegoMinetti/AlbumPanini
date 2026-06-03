/** Separator used to namespace per-collection rows. */
export const UID_SEP = '::';

/** Build a collection-namespaced unique id, e.g. `wc2026::ARG1`. */
export function makeUid(collectionId: string, localId: string): string {
  return `${collectionId}${UID_SEP}${localId}`;
}

/** Split a uid back into `[collectionId, localId]`. */
export function splitUid(uid: string): [string, string] {
  const idx = uid.indexOf(UID_SEP);
  if (idx === -1) return [uid, ''];
  return [uid.slice(0, idx), uid.slice(idx + UID_SEP.length)];
}

/**
 * Generate a reasonably-unique id for user-created/duplicated collections.
 * Uses crypto.randomUUID when available, falls back to a timestamp+random id.
 */
export function generateId(prefix = 'col'): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rnd}`;
}
