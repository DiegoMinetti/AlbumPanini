import { db } from '@/db';
import type {
  CollectionPackage,
  StoredSticker,
  StoredTeam,
} from '@/types/collection';
import { installPackage } from '@/services/collectionLoader';

/** Wipe every table so tests start from a clean database. */
export async function resetDb(): Promise<void> {
  await Promise.all([
    db.collections.clear(),
    db.teams.clear(),
    db.stickers.clear(),
    db.inventory.clear(),
    db.activity.clear(),
  ]);
}

/** A small, valid collection package usable across tests. */
export function makeTestPackage(
  overrides: Partial<CollectionPackage> = {}
): CollectionPackage {
  return {
    id: 'test-col',
    schema: 1,
    name: 'Test Collection',
    description: 'For tests',
    version: '1.0.0',
    language: 'en',
    teams: [
      { id: 'ARG', name: 'Argentina', flag: '🇦🇷' },
      { id: 'BRA', name: 'Brazil', flag: '🇧🇷' },
    ],
    stickers: [
      {
        id: 'ARG-1',
        code: 'ARG 1',
        name: 'A1',
        teamId: 'ARG',
        category: 'player',
        type: 'regular',
        rarity: 'common',
      },
      {
        id: 'ARG-2',
        code: 'ARG 2',
        name: 'A2',
        teamId: 'ARG',
        category: 'player',
        type: 'regular',
        rarity: 'common',
      },
      {
        id: 'BRA-1',
        code: 'BRA 1',
        name: 'B1',
        teamId: 'BRA',
        category: 'player',
        type: 'regular',
        rarity: 'common',
      },
      {
        id: 'BRA-12',
        code: 'BRA 12',
        name: 'B12',
        teamId: 'BRA',
        category: 'player',
        type: 'regular',
        rarity: 'rare',
      },
    ],
    ...overrides,
  };
}

/** Install the test package and return its collection id. */
export async function seedTestCollection(
  pkg: CollectionPackage = makeTestPackage()
): Promise<string> {
  const created = await installPackage(pkg);
  return created.id;
}

/** Build a stored sticker quickly for pure-function tests. */
export function sticker(
  partial: Partial<StoredSticker> & { id: string }
): StoredSticker {
  return {
    code: partial.code ?? partial.id,
    name: partial.name ?? partial.id,
    category: 'player',
    type: 'regular',
    rarity: 'common',
    uid: `c::${partial.id}`,
    collectionId: 'c',
    normalizedCode: (partial.code ?? partial.id).replace(/\s/g, ''),
    ...partial,
  };
}

export function team(
  partial: Partial<StoredTeam> & { id: string }
): StoredTeam {
  return {
    name: partial.name ?? partial.id,
    uid: `c::${partial.id}`,
    collectionId: 'c',
    ...partial,
  };
}
