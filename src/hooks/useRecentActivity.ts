import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { ActivityEntry } from '@/types/inventory';

/** Live recent-activity feed for a collection, newest first. */
export function useRecentActivity(
  collectionId: string | null,
  limit = 20
): ActivityEntry[] {
  return (
    useLiveQuery(async () => {
      if (!collectionId) return [];
      const all = await db.activity
        .where('collectionId')
        .equals(collectionId)
        .sortBy('timestamp');
      return all.reverse().slice(0, limit);
    }, [collectionId, limit]) ?? []
  );
}
