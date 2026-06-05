import { z } from 'zod';
import { tournamentSchema, type Tournament } from './tournament';

/**
 * Domain model for collections, teams and stickers.
 *
 * Zod schemas are the single source of truth: TypeScript types are inferred
 * from them so that runtime validation (collection packages, restored backups)
 * and compile-time types can never drift apart.
 *
 * The model is deliberately collection-agnostic. Nothing here is specific to a
 * World Cup, Pokémon set or any single franchise — everything is driven by the
 * JSON package that is loaded at runtime.
 */

/** A hex color such as `#1d4ed8`. Also accepts 3-digit shorthand. */
export const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color');

/**
 * Rarity is open-ended (collection driven) but we suggest a canonical set so
 * the UI can assign colors/sort order. Unknown values fall back to "common".
 */
export const KNOWN_RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'special',
] as const;
export type KnownRarity = (typeof KNOWN_RARITIES)[number];

export const teamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Emoji flag, ISO code, or relative asset path. Optional. */
  flag: z.string().optional(),
  primaryColor: hexColorSchema.optional(),
  secondaryColor: hexColorSchema.optional(),
  /** Optional explicit ordering within the collection. */
  order: z.number().int().optional(),
  /** Collection-driven extra data (e.g. confederation, codes). */
  meta: z.record(z.unknown()).optional(),
});
export type Team = z.infer<typeof teamSchema>;

export const stickerSchema = z.object({
  id: z.string().min(1),
  /** Human/printed code such as "ARG 1", "BRA 12". Used by OCR & bulk import. */
  code: z.string().min(1),
  name: z.string().min(1),
  /** References Team.id. May be empty for collections without teams. */
  teamId: z.string().optional(),
  /** Free-form grouping, e.g. "player", "badge", "stadium", "legend". */
  category: z.string().default('default'),
  /** Variant type, e.g. "regular", "foil", "shiny". */
  type: z.string().default('regular'),
  rarity: z.string().default('common'),
  /** Optional relative path or URL to the sticker/player image. */
  image: z.string().optional(),
  /** Optional explicit ordering. */
  order: z.number().int().optional(),
  /**
   * Collection-driven extra data carried verbatim into the UI (e.g. player
   * bio: club, position, age, height). Kept generic so the model stays
   * franchise-agnostic.
   */
  meta: z.record(z.unknown()).optional(),
});
export type Sticker = z.infer<typeof stickerSchema>;

/** Metadata shared by both the JSON package and the stored collection. */
export const collectionMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  version: z.string().min(1),
  language: z.string().min(2).default('en'),
  coverImage: z.string().optional(),
});
export type CollectionMeta = z.infer<typeof collectionMetaSchema>;

/**
 * A collection package as shipped in `public/collections/*.json`.
 * This is what the dynamic discovery loader fetches and validates.
 */
export const collectionPackageSchema = collectionMetaSchema.extend({
  /** Package schema version, lets the loader migrate old package shapes. */
  schema: z.number().int().positive().default(1),
  teams: z.array(teamSchema).default([]),
  stickers: z.array(stickerSchema).min(1),
  /**
   * Optional tournament structure (groups, fixture, knockout bracket). Present
   * only for sports collections; everything else ignores it.
   */
  tournament: tournamentSchema.optional(),
});
export type CollectionPackage = z.infer<typeof collectionPackageSchema>;

/** The manifest listing available packages in `public/collections/index.json`. */
export const collectionManifestEntrySchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  version: z.string().min(1),
  language: z.string().default('en'),
  coverImage: z.string().optional(),
});
export type CollectionManifestEntry = z.infer<
  typeof collectionManifestEntrySchema
>;

export const collectionManifestSchema = z.object({
  collections: z.array(collectionManifestEntrySchema).default([]),
});
export type CollectionManifest = z.infer<typeof collectionManifestSchema>;

export type CollectionStatus = 'active' | 'archived';

/**
 * A collection as stored in IndexedDB. Adds lifecycle/status fields on top of
 * the package metadata. Teams and stickers live in their own tables keyed by
 * `collectionId` so multiple (possibly duplicated) collections can coexist.
 */
export interface StoredCollection extends CollectionMeta {
  status: CollectionStatus;
  /** Id of the source package this was instantiated from (for re-sync/info). */
  sourceId?: string;
  /** Static tournament structure, if the source package shipped one. */
  tournament?: Tournament;
  createdAt: number;
  updatedAt: number;
}

/** Team row as stored, namespaced to a collection. */
export interface StoredTeam extends Team {
  /** `${collectionId}::${team.id}` — primary key, unique across collections. */
  uid: string;
  collectionId: string;
}

/** Sticker row as stored, namespaced to a collection. */
export interface StoredSticker extends Sticker {
  /** `${collectionId}::${sticker.id}` — primary key. */
  uid: string;
  collectionId: string;
  /** Normalized code (uppercase, no spaces) for fast OCR/import lookup. */
  normalizedCode: string;
}
