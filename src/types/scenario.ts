/**
 * Scenario data model.
 *
 * A *scenario* is a user-owned set of results layered on top of a collection's
 * static tournament structure. Each collection can have many scenarios — one
 * flagged `isOfficial` (the real results, filled in as matches are played) plus
 * any number of "what-if" simulations. Results and knockout picks are keyed by
 * scenario so switching scenarios swaps the whole tournament state.
 */

/** A saved scenario (the official results, or a custom simulation). */
export interface StoredScenario {
  /** Unique id, e.g. `${collectionId}::official` or a generated id. */
  id: string;
  collectionId: string;
  name: string;
  /** Exactly one scenario per collection should be the official one. */
  isOfficial: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A score entered for one match within one scenario. */
export interface StoredMatchResult {
  /** `${scenarioId}::${matchId}` — primary key. */
  uid: string;
  scenarioId: string;
  matchId: string;
  homeGoals: number;
  awayGoals: number;
  /** Penalty shoot-out goals (knockout draws only). */
  homePens?: number;
  awayPens?: number;
  /** False until the user has actually entered a result. */
  played: boolean;
  updatedAt: number;
}

/**
 * A manual knockout slot assignment (hybrid mode).
 *
 * `slot` is a symbolic bracket slot such as `"3-CDFG"` (a best-third
 * placeholder) or `"W73"` (winner of match 73). The user picks which team
 * fills it; group winners/runners-up are auto-resolved from standings and only
 * stored here when manually overridden.
 */
export interface StoredKnockoutPick {
  /** `${scenarioId}::${slot}` — primary key. */
  uid: string;
  scenarioId: string;
  slot: string;
  teamId: string;
  updatedAt: number;
}
