/**
 * Computed statistics. These are derived (never persisted) — the stats service
 * recomputes them from stickers + inventory.
 */

export interface CollectionStats {
  total: number;
  owned: number;
  missing: number;
  /** Total spare copies (sum of quantity-1 over owned stickers). */
  duplicates: number;
  /** Distinct stickers the user has more than one of. */
  distinctDuplicates: number;
  completion: number; // 0..1
}

export interface TeamStats {
  teamId: string;
  teamName: string;
  total: number;
  owned: number;
  missing: number;
  completion: number; // 0..1
  complete: boolean;
}

export interface RepeatedSticker {
  stickerId: string;
  code: string;
  name: string;
  quantity: number;
}

export interface CategoryStats {
  category: string;
  total: number;
  owned: number;
  completion: number;
}

export interface FullStatistics {
  overview: CollectionStats;
  teams: TeamStats[];
  categories: CategoryStats[];
  mostRepeated: RepeatedSticker[];
  /** Owned-but-single stickers that are rarest by global rarity weight. */
  leastCommon: RepeatedSticker[];
  completedTeams: TeamStats[];
  nearCompleteTeams: TeamStats[];
}
