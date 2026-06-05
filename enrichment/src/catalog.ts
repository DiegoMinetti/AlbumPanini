import fs from 'node:fs/promises';
import { PATHS } from './config.js';
import { rawCatalogSchema } from './schemas.js';
import { lookupCountry, NON_TEAM_BLOCKS } from './reference/countries.js';
import { normalizeName } from './normalize.js';
import type { RawSticker, StickerType } from './types.js';

// Nombres que dentro de un bloque de selección NO son jugadores.
const NON_PLAYER_NAMES = new Set<string>(['emblem', 'team photo']);

export interface ClassifiedSticker extends RawSticker {
  type: StickerType;
  /** true si pertenece a una selección nacional conocida. */
  isNationalTeam: boolean;
}

/** Carga y valida el catálogo crudo. */
export async function loadRawCatalog(): Promise<{
  stickers: RawSticker[];
  invalid: { value: unknown; error: string }[];
}> {
  const raw = await fs.readFile(PATHS.rawCatalog, 'utf8');
  const parsed = JSON.parse(raw);
  const result = rawCatalogSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Catálogo crudo inválido: ${result.error.message.slice(0, 300)}`,
    );
  }
  // Validación por sticker: descartar corruptos individualmente.
  const stickers: RawSticker[] = [];
  const invalid: { value: unknown; error: string }[] = [];
  for (const s of result.data.stickers) {
    if (s.code && s.name && s.team) stickers.push(s);
    else invalid.push({ value: s, error: 'campos faltantes' });
  }
  return { stickers, invalid };
}

/** Clasifica una figurita en player / team-emblem / team-photo / special. */
export function classify(sticker: RawSticker): ClassifiedSticker {
  const country = lookupCountry(sticker.team);
  const isNationalTeam = Boolean(country);

  if (NON_TEAM_BLOCKS.has(sticker.team) || !isNationalTeam) {
    return { ...sticker, type: 'special', isNationalTeam: false };
  }

  const nameKey = normalizeName(sticker.name);
  if (nameKey === 'emblem') {
    return { ...sticker, type: 'team-emblem', isNationalTeam: true };
  }
  if (nameKey === 'team photo' || NON_PLAYER_NAMES.has(nameKey)) {
    return { ...sticker, type: 'team-photo', isNationalTeam: true };
  }
  return { ...sticker, type: 'player', isNationalTeam: true };
}

/** Clasifica todo el catálogo. */
export function classifyAll(stickers: RawSticker[]): ClassifiedSticker[] {
  return stickers.map(classify);
}

/** Lista de selecciones nacionales presentes (deduplicadas, en orden). */
export function distinctTeams(stickers: RawSticker[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of stickers) {
    if (lookupCountry(s.team) && !seen.has(s.team)) {
      seen.add(s.team);
      out.push(s.team);
    }
  }
  return out;
}
