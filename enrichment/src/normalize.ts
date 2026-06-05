import type { Position } from './types.js';

// Normalización de texto y mapeo de posiciones.

/**
 * Normaliza un nombre para comparación robusta:
 * - minúsculas
 * - elimina acentos/diacríticos (NFD + strip combining marks)
 * - colapsa puntuación y espacios
 * Ej: "Marc-André ter Stegen" -> "marc andre ter stegen"
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas combinantes (acentos)
    .replace(/[‘’'`]/g, '') // apóstrofes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // resto de puntuación -> espacio
    .trim()
    .replace(/\s+/g, ' ');
}

/** Tokens normalizados de un nombre (para matching por solapamiento). */
export function nameTokens(raw: string): string[] {
  return normalizeName(raw).split(' ').filter(Boolean);
}

// Mapa de variantes crudas (de Wikidata/Wikipedia) a posiciones canónicas.
// Las claves se comparan ya normalizadas (minúscula, sin acentos).
const POSITION_MAP: Record<string, Position> = {
  goalkeeper: 'Goalkeeper',
  'goal keeper': 'Goalkeeper',
  keeper: 'Goalkeeper',
  gk: 'Goalkeeper',

  defender: 'Defender',
  'centre back': 'Defender',
  'center back': 'Defender',
  'central defender': 'Defender',
  'centre half': 'Defender',
  'left back': 'Defender',
  'right back': 'Defender',
  'full back': 'Defender',
  'wing back': 'Defender',
  'left wing back': 'Defender',
  'right wing back': 'Defender',
  'sweeper': 'Defender',
  'back': 'Defender',

  midfielder: 'Midfielder',
  'central midfielder': 'Midfielder',
  'defensive midfielder': 'Midfielder',
  'attacking midfielder': 'Midfielder',
  'central attacking midfielder': 'Midfielder',
  'left midfielder': 'Midfielder',
  'right midfielder': 'Midfielder',
  'deep lying playmaker': 'Midfielder',
  'box to box midfielder': 'Midfielder',
  'holding midfielder': 'Midfielder',
  'playmaker': 'Midfielder',
  'midfield': 'Midfielder',

  forward: 'Forward',
  'centre forward': 'Forward',
  'center forward': 'Forward',
  striker: 'Forward',
  'left winger': 'Forward',
  'right winger': 'Forward',
  winger: 'Forward',
  'second striker': 'Forward',
  'false 9': 'Forward',
  'left forward': 'Forward',
  'right forward': 'Forward',
  'attacker': 'Forward',
};

/**
 * Normaliza una posición cruda a una de las cuatro categorías canónicas.
 * Devuelve null si no se puede mapear con confianza.
 */
export function normalizePosition(raw: string | undefined | null): Position | null {
  if (!raw) return null;
  const key = normalizeName(raw);
  if (POSITION_MAP[key]) return POSITION_MAP[key];

  // Heurística por palabra clave si no hay match exacto.
  if (/\bgoal\s?keeper\b|\bgk\b/.test(key)) return 'Goalkeeper';
  if (/\b(back|defender|defence|defense)\b/.test(key)) return 'Defender';
  if (/\bmidfield/.test(key)) return 'Midfielder';
  if (/\b(forward|striker|winger|attacker)\b/.test(key)) return 'Forward';
  return null;
}

/** Calcula edad (años completos) a una fecha de referencia. */
export function calculateAge(
  birthDateIso: string,
  referenceIso: string,
): number | null {
  const b = new Date(birthDateIso);
  const ref = new Date(referenceIso);
  if (Number.isNaN(b.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age--;
  return age >= 0 ? age : null;
}
