// Tipos centrales del pipeline de enriquecimiento.

/** Confederaciones FIFA. */
export type Confederation =
  | 'UEFA'
  | 'CONMEBOL'
  | 'CONCACAF'
  | 'CAF'
  | 'AFC'
  | 'OFC';

/** Posiciones normalizadas (cuatro categorías canónicas). */
export type Position = 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward';

/** Pie dominante. */
export type PreferredFoot = 'Left' | 'Right' | 'Both';

/** Clasificación de una figurita del catálogo. */
export type StickerType =
  | 'player' // jugador real de una selección
  | 'team-emblem' // escudo de selección
  | 'team-photo' // foto de plantel
  | 'special'; // logos, mascotas, host cities, historia, etc.

/** Figurita cruda tal como viene del catálogo original. */
export interface RawSticker {
  code: string;
  name: string;
  team: string;
}

/** Catálogo crudo. */
export interface RawCatalog {
  source: string;
  scrapedAt: string;
  edition: string;
  canonicalCount: number;
  cutoffRule: string;
  stickers: RawSticker[];
}

/** Datos de país/selección derivados estáticamente. */
export interface CountryRef {
  /** Nombre tal como aparece en el catálogo Panini. */
  team: string;
  /** ISO 3166-1 alpha-2 (o subdivisión tipo "GB-ENG"). */
  countryCode: string;
  /** Código FIFA de 3 letras. */
  fifaCode: string;
  /** Confederación FIFA. */
  confederation: Confederation;
}

/** Bandera resuelta dinámicamente. */
export interface Flag {
  countryCode: string;
  flagEmoji: string;
  flagSvgUrl: string;
}

/** Selección enriquecida (teams.json). */
export interface EnrichedTeam {
  name: string;
  fifaCode: string;
  countryCode: string;
  flagEmoji: string;
  flagSvgUrl: string;
  confederation: Confederation;
  group: string | null;
}

/** Datos crudos extraídos de Wikidata para una persona. */
export interface WikidataPerson {
  wikidataId: string;
  label?: string;
  wikipediaUrl?: string;
  birthDate?: string; // ISO YYYY-MM-DD
  birthPlace?: string;
  birthCoordinates?: { lat: number; lon: number };
  heightCm?: number;
  weightKg?: number;
  position?: string; // crudo, sin normalizar
  club?: string;
  nationality?: string;
  preferredFoot?: string;
  shirtNumber?: number;
  marketValueEur?: number;
  commonsImage?: string; // URL de imagen en Wikimedia Commons
  socials?: Record<string, string>;
}

/** Jugador enriquecido (players.json). */
export interface EnrichedPlayer {
  code: string;
  type: 'player';
  name: string;
  team: string;
  countryCode: string;
  fifaCode: string;
  flagEmoji: string;
  flagSvgUrl: string;
  wikidataId: string | null;
  wikipediaUrl: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  position: Position | null;
  club: string | null;
  nationality: string | null;
  // Extras opcionales (no comprometen estabilidad si faltan).
  preferredFoot?: PreferredFoot;
  shirtNumber?: number;
  marketValueEur?: number;
  commonsImage?: string;
  birthCoordinates?: { lat: number; lon: number };
  socials?: Record<string, string>;
}

/** Entrada del catálogo enriquecido: jugador o no-jugador. */
export type EnrichedEntry =
  | EnrichedPlayer
  | {
      code: string;
      type: 'team-emblem' | 'team-photo' | 'special';
      name: string;
      team: string;
      countryCode?: string;
      fifaCode?: string;
      flagEmoji?: string;
      flagSvgUrl?: string;
    };

/** Registro de un match ambiguo para revisión manual. */
export interface AmbiguousMatch {
  code: string;
  name: string;
  team: string;
  candidates: { wikidataId: string; label: string; reason: string }[];
}

/** Registro de error de enriquecimiento. */
export interface EnrichmentError {
  code: string;
  name: string;
  team: string;
  stage: string;
  message: string;
}

/** Estado persistido del checkpoint. */
export interface Checkpoint {
  processed: number;
  remaining: number;
  total: number;
  processedCodes: string[];
  updatedAt: string;
}

/** Reporte final. */
export interface EnrichmentReport {
  totalStickers: number;
  playersDetected: number;
  playersEnriched: number;
  playersMissing: number;
  successRate: number;
  teamsDetected: number;
  ambiguousMatches: number;
  errors: number;
  generatedAt: string;
}
