import { z } from 'zod';

export const themeModeSchema = z.enum(['light', 'dark', 'system']);
export type ThemeMode = z.infer<typeof themeModeSchema>;

export const languageSchema = z.enum(['es', 'en']);
export type Language = z.infer<typeof languageSchema>;

export const stickerViewSchema = z.enum(['grid', 'list']);
export type StickerView = z.infer<typeof stickerViewSchema>;

/**
 * User preferences. Persisted to localStorage via the settings store (small,
 * synchronous, read before first paint) and also embedded in backups.
 */
export const settingsSchema = z.object({
  theme: themeModeSchema.default('system'),
  language: languageSchema.default('es'),
  haptics: z.boolean().default(true),
  stickerView: stickerViewSchema.default('grid'),
  /** Currently selected collection id (null = none/onboarding). */
  activeCollectionId: z.string().nullable().default(null),
  /** Show only owned-relevant info, hide images to save bandwidth, etc. */
  showImages: z.boolean().default(true),
  /**
   * Include "extra" stickers (foil/parallel variants that ship only in some
   * country editions). Off by default so the count matches the standard album.
   */
  includeExtras: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});
