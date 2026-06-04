import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { StoredCollection } from '@/types/collection';

/** Live list of all collections (active + archived), newest first. */
export function useCollections(): StoredCollection[] | undefined {
  return useLiveQuery(
    () => db.collections.orderBy('updatedAt').reverse().toArray(),
    []
  );
}

/** Live single collection by id. */
export function useCollection(
  id: string | null
): StoredCollection | undefined | null {
  return useLiveQuery(
    async () => (id ? ((await db.collections.get(id)) ?? null) : null),
    [id]
  );
}
