import { z } from 'zod';

// Schemas zod: validación de entrada (catálogo crudo) y salida (registros enriquecidos).
// Los registros que no validan se descartan y se registran como error.

export const rawStickerSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  team: z.string().min(1),
});

export const rawCatalogSchema = z.object({
  source: z.string(),
  scrapedAt: z.string(),
  edition: z.string(),
  canonicalCount: z.number(),
  cutoffRule: z.string().optional().default(''),
  stickers: z.array(rawStickerSchema),
});

export const positionSchema = z.enum([
  'Goalkeeper',
  'Defender',
  'Midfielder',
  'Forward',
]);

export const confederationSchema = z.enum([
  'UEFA',
  'CONMEBOL',
  'CONCACAF',
  'CAF',
  'AFC',
  'OFC',
]);

const coordSchema = z.object({ lat: z.number(), lon: z.number() });

export const enrichedPlayerSchema = z.object({
  code: z.string().min(1),
  type: z.literal('player'),
  name: z.string().min(1),
  team: z.string().min(1),
  countryCode: z.string().min(2),
  fifaCode: z.string().length(3),
  flagEmoji: z.string().min(1),
  flagSvgUrl: z.string().url(),
  wikidataId: z.string().nullable(),
  wikipediaUrl: z.string().url().nullable(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  birthPlace: z.string().nullable(),
  age: z.number().int().min(10).max(60).nullable(),
  heightCm: z.number().int().min(140).max(220).nullable(),
  weightKg: z.number().int().min(45).max(120).nullable(),
  position: positionSchema.nullable(),
  club: z.string().nullable(),
  nationality: z.string().nullable(),
  preferredFoot: z.enum(['Left', 'Right', 'Both']).optional(),
  shirtNumber: z.number().int().min(1).max(99).optional(),
  marketValueEur: z.number().nonnegative().optional(),
  commonsImage: z.string().url().optional(),
  birthCoordinates: coordSchema.optional(),
  socials: z.record(z.string()).optional(),
});

export const enrichedTeamSchema = z.object({
  name: z.string().min(1),
  fifaCode: z.string().length(3),
  countryCode: z.string().min(2),
  flagEmoji: z.string().min(1),
  flagSvgUrl: z.string().url(),
  confederation: confederationSchema,
  group: z.string().nullable(),
});

export type EnrichedPlayerParsed = z.infer<typeof enrichedPlayerSchema>;
