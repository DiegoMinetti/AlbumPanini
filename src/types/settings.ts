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
   * Render the sticker browser as collapsible sections (by country / special
   * group) instead of one flat grid. Off by default.
   */
  stickerGrouped: z.boolean().default(false),
  /**
   * Allow editing sticker quantities from the browser. When off the view is
   * read-only, preventing accidental changes while consulting. On by default.
   */
  editMode: z.boolean().default(true),
  /**
   * IANA timezone used to render match kickoffs, group the calendar by day and
   * anchor the "next match" highlight. Defaults to Buenos Aires because the
   * primary user is in AR, but every other consumer can pick their own.
   */
  timeZone: z.string().min(1).default('America/Buenos_Aires'),
  /** Number of app launches recorded (used for non-invasive donation prompt). */
  appLaunchCount: z.number().int().nonnegative().default(0),
  /** True once the Mercado Pago link was opened by the user. */
  donationLinkOpened: z.boolean().default(false),
  /**
   * True once the default collection (FIFA World Cup 2026) has been seeded on
   * first launch. Prevents re-seeding if the user later removes it on purpose.
   */
  defaultCollectionSeeded: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});
