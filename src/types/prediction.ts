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
 * A FIFA-official record for one match. Sourced from the openfootball sync
 * (PR2, updated PR5) and committed to the static
 * `public/official/worldcup-2026-results.json` file by the GitHub Action.
 * Read-only at runtime.
 *
 * The shape is uniform across finished and scheduled matches: every row
 * carries the `kickoff` and the metadata (`venue`, `group` or `stage`).
 * For finished matches, `homeGoals`/`awayGoals`/`finishedAt` are present.
 * For pending matches, those fields are absent and `status === 'SCHEDULED'`.
 * This lets the UI distinguish "kickoff locked, awaiting result" from
 * "kickoff locked, no result yet" without a second roundtrip to the fixture.
 */
export interface StoredOfficialResult {
  /** `matchId` from the static fixture (primary key). */
  matchId: string;
  /** Present for finished matches. Absent for SCHEDULED. */
  homeGoals?: number;
  awayGoals?: number;
  homePens?: number;
  awayPens?: number;
  /** 'FT' (full time), 'AET' (after extra time), 'PEN' (penalties), 'SCHEDULED' (pending). */
  status: 'FT' | 'AET' | 'PEN' | 'SCHEDULED';
  /** ISO 8601 with offset (e.g. "2026-06-11T13:00:00.000-06:00"). */
  kickoff: string;
  /** Optional. Present only for finished matches. Equals `kickoff` for FT games, set to the actual FT timestamp once the Action starts emitting it. */
  finishedAt?: string;
  /** Stadium (e.g. "Mexico City", "Los Angeles (Inglewood)"). */
  venue?: string;
  /** Group letter A..L for group-stage matches. */
  group?: string;
  /** Stage: 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final'. */
  stage?: string;
  /** Stable hash of matchId (we lost the original api-football id when we switched sources). */
  apiFootballFixtureId: number;
  /** When we first persisted this row locally. */
  syncedAt: number;
}
