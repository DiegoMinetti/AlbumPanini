/**
 * User predictions + FIFA official results, separated from the legacy
 * `matchResults` / `knockoutPicks` tables.
 *
 * A *prediction* is a user-owned score/pick for one match within one
 * scenario. The two are completely independent:
 *  - The user can edit a prediction freely up until the match kickoff.
 *    After kickoff the prediction is locked (see `predictionService`).
 *  - Official results are written by the API-Football sync (PR2) and are
 *    read-only in runtime. They populate over time as matches finish.
 *
 * `predictions` has the same shape as the legacy `matchResults` row, just
 * renamed for clarity. The v3 Dexie migration copies existing rows from
 * `matchResults` and `knockoutPicks` into `predictions`; the old tables stay
 * defined but are no longer read by the app.
 */

/** A user prediction: same shape as the legacy StoredMatchResult. */
export interface StoredPrediction {
  /** `${scenarioId}::${matchId}` — primary key. */
  uid: string;
  scenarioId: string;
  matchId: string;
  homeGoals: number;
  awayGoals: number;
  homePens?: number;
  awayPens?: number;
  /** True once the user has actually entered a prediction. */
  played: boolean;
  updatedAt: number;
}

/** A user knockout-pick prediction (hybrid mode override). */
export interface StoredKnockoutPrediction {
  /** `${scenarioId}::${slot}` — primary key. */
  uid: string;
  scenarioId: string;
  slot: string;
  teamId: string;
  updatedAt: number;
}

/**
 * A confirmed, FIFA-official result. Sourced from the API-Football sync
 * (PR2) and committed to the static `public/official/*.json` file by the
 * GitHub Action. Read-only at runtime.
 */
export interface StoredOfficialResult {
  /** `matchId` from the static fixture (primary key). */
  matchId: string;
  homeGoals: number;
  awayGoals: number;
  homePens?: number;
  awayPens?: number;
  /** "FT" (full time), "AET" (after extra time), "PEN" (penalties). */
  status: 'FT' | 'AET' | 'PEN';
  finishedAt: string;
  /** API-Football's own fixture id, for debugging / cross-ref. */
  apiFootballFixtureId: number;
  /** When we first persisted this row locally. */
  syncedAt: number;
}
