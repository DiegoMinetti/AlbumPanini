import type { StoredSticker, StoredTeam } from '@/types/collection';
import type {
  CategoryStats,
  CollectionStats,
  FullStatistics,
  RepeatedSticker,
  TeamStats,
} from '@/types/stats';

/**
 * Statistics are pure derivations of (stickers + inventory). Keeping them as
 * pure functions makes them trivially unit-testable and lets the UI memoize.
 *
 * `inventory` is a Map of stickerId -> quantity (missing stickers may be
 * absent from the map; treated as quantity 0).
 */

export function computeOverview(
  stickers: StoredSticker[],
  inventory: Map<string, number>
): CollectionStats {
  let owned = 0;
  let duplicates = 0;
  let distinctDuplicates = 0;
  for (const sticker of stickers) {
    const qty = inventory.get(sticker.id) ?? 0;
    if (qty > 0) owned += 1;
    if (qty > 1) {
      duplicates += qty - 1;
      distinctDuplicates += 1;
    }
  }
  const total = stickers.length;
  const missing = total - owned;
  return {
    total,
    owned,
    missing,
    duplicates,
    distinctDuplicates,
    completion: total === 0 ? 0 : owned / total,
  };
}

export function computeTeamStats(
  stickers: StoredSticker[],
  teams: StoredTeam[],
  inventory: Map<string, number>
): TeamStats[] {
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const buckets = new Map<string, { total: number; owned: number }>();

  for (const sticker of stickers) {
    if (!sticker.teamId) continue;
    const bucket = buckets.get(sticker.teamId) ?? { total: 0, owned: 0 };
    bucket.total += 1;
    if ((inventory.get(sticker.id) ?? 0) > 0) bucket.owned += 1;
    buckets.set(sticker.teamId, bucket);
  }

  const result: TeamStats[] = [];
  for (const [teamId, bucket] of buckets) {
    const completion = bucket.total === 0 ? 0 : bucket.owned / bucket.total;
    result.push({
      teamId,
      teamName: teamName.get(teamId) ?? teamId,
      total: bucket.total,
      owned: bucket.owned,
      missing: bucket.total - bucket.owned,
      completion,
      complete: bucket.total > 0 && bucket.owned === bucket.total,
    });
  }
  return result.sort((a, b) => b.completion - a.completion);
}

export function computeCategoryStats(
  stickers: StoredSticker[],
  inventory: Map<string, number>
): CategoryStats[] {
  const buckets = new Map<string, { total: number; owned: number }>();
  for (const sticker of stickers) {
    const cat = sticker.category || 'default';
    const bucket = buckets.get(cat) ?? { total: 0, owned: 0 };
    bucket.total += 1;
    if ((inventory.get(sticker.id) ?? 0) > 0) bucket.owned += 1;
    buckets.set(cat, bucket);
  }
  return [...buckets.entries()]
    .map(([category, b]) => ({
      category,
      total: b.total,
      owned: b.owned,
      completion: b.total === 0 ? 0 : b.owned / b.total,
    }))
    .sort((a, b) => b.total - a.total);
}

export function computeMostRepeated(
  stickers: StoredSticker[],
  inventory: Map<string, number>,
  limit = 10
): RepeatedSticker[] {
  return stickers
    .map((s) => ({
      stickerId: s.id,
      code: s.code,
      name: s.name,
      quantity: inventory.get(s.id) ?? 0,
    }))
    .filter((s) => s.quantity > 1)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}

/**
 * "Least common" = owned stickers with the fewest copies (exactly one), useful
 * to highlight stickers the user cannot yet trade away.
 */
export function computeLeastCommon(
  stickers: StoredSticker[],
  inventory: Map<string, number>,
  limit = 10
): RepeatedSticker[] {
  return stickers
    .map((s) => ({
      stickerId: s.id,
      code: s.code,
      name: s.name,
      quantity: inventory.get(s.id) ?? 0,
    }))
    .filter((s) => s.quantity === 1)
    .slice(0, limit);
}

export function computeStatistics(
  stickers: StoredSticker[],
  teams: StoredTeam[],
  inventory: Map<string, number>,
  options: { nearCompleteThreshold?: number } = {}
): FullStatistics {
  const threshold = options.nearCompleteThreshold ?? 0.8;
  const teamStats = computeTeamStats(stickers, teams, inventory);
  return {
    overview: computeOverview(stickers, inventory),
    teams: teamStats,
    categories: computeCategoryStats(stickers, inventory),
    mostRepeated: computeMostRepeated(stickers, inventory),
    leastCommon: computeLeastCommon(stickers, inventory),
    completedTeams: teamStats.filter((t) => t.complete),
    nearCompleteTeams: teamStats.filter(
      (t) => !t.complete && t.completion >= threshold
    ),
  };
}
