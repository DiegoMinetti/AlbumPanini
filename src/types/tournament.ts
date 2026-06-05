import { z } from 'zod';

/**
 * Tournament domain model (groups, fixture, knockout bracket).
 *
 * This is the *static structure* of a tournament: which teams are in which
 * group, the full match list with venues/dates, and the knockout bracket slot
 * graph. It is shipped inside a collection package under the optional
 * `tournament` field, so the core collection model stays franchise-agnostic —
 * collections without a tournament block simply never render tournament UI.
 *
 * User-entered *results* (goals, who advances) are NOT here; they live per
 * scenario in IndexedDB (see `types/scenario.ts`).
 */

/** Group identifiers A..L (12 groups for the 48-team format). */
export const GROUP_IDS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
] as const;
export type GroupId = (typeof GROUP_IDS)[number];

export const groupSchema = z.object({
  id: z.string().min(1),
  /** Team ids in seeded order (position 1..4). */
  teamIds: z.array(z.string().min(1)).min(2),
});
export type TournamentGroup = z.infer<typeof groupSchema>;

/** Stages, from group phase to the final. `third` is the 3rd-place play-off. */
export const MATCH_STAGES = [
  'group',
  'r32',
  'r16',
  'qf',
  'sf',
  'third',
  'final',
] as const;
export const matchStageSchema = z.enum(MATCH_STAGES);
export type MatchStage = (typeof MATCH_STAGES)[number];

/**
 * A single fixture slot.
 *
 * Group matches carry concrete `homeTeamId`/`awayTeamId`. Knockout matches
 * instead carry symbolic `homeSlot`/`awaySlot` (e.g. `"1A"`, `"2B"`,
 * `"3-CDFG"` for a best-third placeholder, `"W73"` for the winner of match 73)
 * which are resolved at runtime from the active scenario's standings + picks.
 */
export const tournamentMatchSchema = z.object({
  id: z.string().min(1),
  matchNumber: z.number().int().positive(),
  stage: matchStageSchema,
  /** Group letter for group-stage matches. */
  group: z.string().optional(),
  /** ISO date `YYYY-MM-DD`. */
  date: z.string().optional(),
  /** Local kickoff time `HH:mm`. */
  kickoff: z.string().optional(),
  venue: z.string().optional(),
  city: z.string().optional(),
  homeTeamId: z.string().optional(),
  awayTeamId: z.string().optional(),
  homeSlot: z.string().optional(),
  awaySlot: z.string().optional(),
});
export type TournamentMatch = z.infer<typeof tournamentMatchSchema>;

export const tournamentSchema = z.object({
  /** How many advance per group + how many best third-placed teams qualify. */
  qualifiers: z
    .object({
      perGroup: z.number().int().positive().default(2),
      bestThirds: z.number().int().nonnegative().default(8),
    })
    .default({ perGroup: 2, bestThirds: 8 }),
  groups: z.array(groupSchema).min(1),
  matches: z.array(tournamentMatchSchema).min(1),
});
export type Tournament = z.infer<typeof tournamentSchema>;
