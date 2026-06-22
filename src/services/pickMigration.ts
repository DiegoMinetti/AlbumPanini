import { db } from '@/db';
import type { StoredKnockoutPick } from '@/types/scenario';
import type {
  GroupId,
  TournamentGroup,
  TournamentMatch,
} from '@/types/tournament';
import { computeAllStandings, indexResults } from './tournamentService';
import { annexCAssign } from '@/utils/annexC';

/**
 * One-shot migration of legacy `T1`…`T8` knockout picks into the new
 * FIFA Annex C `3[A-L]+` slot encoding.
 *
 * Background: the 2026 WC R32 used to use generic slots `T1..T8` (best third
 * by overall rank). After PR A we ship FIFA's actual encoding where each
 * R32 match's third-place side is `3[A-L]+` (a SET of eligible groups). The
 * resolver PR B already understands both formats — legacy picks remain
 * queryable but no current match references `T1..T8`, so they're dormant.
 *
 * This migration is **additive**: for each `T_N` pick whose team still
 * qualifies as a top-8 best third, it creates the corresponding
 * `3[A-L]+` pick under the new slot. The legacy pick is preserved
 * untouched. Users who don't qualify (e.g. they picked a non-third team)
 * get no new pick — they have to re-pick manually.
 *
 * The function is idempotent: it short-circuits when a `3[A-L]+` pick for
 * the resolved slot already exists.
 */

interface MigrationResult {
  /** How many legacy `T_N` picks were found. */
  legacyFound: number;
  /** How many new `3[A-L]+` picks were added. */
  migrated: number;
  /** How many legacy picks couldn't be mapped (team didn't qualify, etc.). */
  unmappable: number;
}

const LEGACY_T_PICK = /^T(\d+)$/;

export async function migrateLegacyTPicks(
  scenarioId: string,
  groups: TournamentGroup[],
  matches: TournamentMatch[],
  resultRows: Array<{
    matchId: string;
    homeGoals: number;
    awayGoals: number;
    homePens?: number;
    awayPens?: number;
    played: boolean;
  }>
): Promise<MigrationResult> {
  const result: MigrationResult = {
    legacyFound: 0,
    migrated: 0,
    unmappable: 0,
  };

  // Index group → third teamId for quick lookup.
  const thirdByGroup = new Map<string, string>();
  for (const g of groups) {
    const team = g.teamIds[2]; // seeded 3rd (Panini catalog order matches FIFA draw)
    if (team) thirdByGroup.set(g.id, team);
  }

  // Slot string → match number, for the new `3[A-L]+` slots only.
  const slotToMatch = new Map<string, number>();
  for (const m of matches) {
    if (m.homeSlot?.startsWith('3')) slotToMatch.set(m.homeSlot, m.matchNumber);
    if (m.awaySlot?.startsWith('3')) slotToMatch.set(m.awaySlot, m.matchNumber);
  }

  // Compute current standings so we can see which groups qualify.
  const indexed = indexResults(
    resultRows.map((r) => ({
      uid: `mig::${r.matchId}`,
      scenarioId,
      matchId: r.matchId,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      homePens: r.homePens,
      awayPens: r.awayPens,
      played: r.played,
      updatedAt: 0,
    }))
  );
  const standings = computeAllStandings(groups, matches, indexed, 8);

  // Load existing picks for this scenario.
  const allPicks: StoredKnockoutPick[] = await db.knockoutPicks
    .where('scenarioId')
    .equals(scenarioId)
    .toArray();
  const picksBySlot = new Map(allPicks.map((p) => [p.slot, p]));

  for (const pick of allPicks) {
    const m = LEGACY_T_PICK.exec(pick.slot);
    if (!m) continue;
    result.legacyFound++;

    // Which group does this team belong to?
    const teamGroup = groups.find((g) => g.teamIds.includes(pick.teamId))?.id;
    if (!teamGroup) {
      result.unmappable++;
      continue;
    }

    // Was this team actually the 3rd-place finisher of that group?
    if (thirdByGroup.get(teamGroup) !== pick.teamId) {
      // Legacy pick was for a team that's not the 3rd of any group. Nothing
      // safe to do — leave the legacy pick dormant.
      result.unmappable++;
      continue;
    }

    // Did that group qualify as top-8 best third?
    if (!standings.qualifyingGroups.has(teamGroup)) {
      result.unmappable++;
      continue;
    }

    // Which new slot does this group fill? Look up via Anexo C: the
    // qualifying set is `standings.qualifyingGroups` (8 of 12), and the
    // slot we want is the one whose match number is the unique
    // `3[A-L]+` slot that includes `teamGroup` in its set of eligible
    // letters AND whose Anexo C row assigns it to `teamGroup`.
    const qualifyingList = [...standings.qualifyingGroups].sort();
    const newSlot = findSlotForGroup(teamGroup, slotToMatch, qualifyingList);
    if (!newSlot) {
      result.unmappable++;
      continue;
    }

    // Skip if a non-legacy pick already exists for that new slot.
    const existing = picksBySlot.get(newSlot);
    if (existing && existing.teamId && !LEGACY_T_PICK.test(existing.slot)) {
      continue;
    }

    await db.knockoutPicks.put({
      uid: `mig::${scenarioId}::${newSlot}`,
      scenarioId,
      slot: newSlot,
      teamId: pick.teamId,
      updatedAt: Date.now(),
    });
    result.migrated++;
  }

  return result;
}

/**
 * Given which group we're trying to place, find the new `3[A-L]+` slot
 * whose Anexo C row assigns to that group under the current qualifying
 * set. There is at most one such slot.
 */
function findSlotForGroup(
  group: string,
  slotToMatch: Map<string, number>,
  qualifyingList: string[]
): string | undefined {
  for (const [slot, matchNum] of slotToMatch.entries()) {
    const letters = slot.slice(1); // strip leading "3"
    if (!letters.includes(group)) continue;
    const assigned = annexCAssign(qualifyingList as GroupId[], matchNum);
    if (assigned === group) return slot;
  }
  return undefined;
}
