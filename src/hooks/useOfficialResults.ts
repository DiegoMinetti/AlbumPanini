import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  readOfficialSyncedAt,
  syncOfficialResultsFromRemote,
} from '@/services/officialResultsService';
import type { StoredOfficialResult } from '@/types/prediction';

export interface OfficialResultsData {
  byMatchId: Map<string, StoredOfficialResult>;
  syncedAt: string | null;
  loading: boolean;
  /** Last fetch error, surfaced for the UI to show a stale/offline badge. */
  error: string | null;
}

/**
 * Live view of the FIFA-official results table.
 *
 * On first mount it kicks off a fetch against the static JSON produced by
 * the sync Action (PR2). After that, the table is driven entirely by the
 * IndexedDB rows so subsequent reads are instant. Re-fetches on mount are
 * idempotent — the upsert is a key-based replace.
 *
 * Multiple components can call this hook; Dexie's `useLiveQuery` is cheap and
 * they all see the same rows.
 */
export function useOfficialResults(): OfficialResultsData {
  const rows = useLiveQuery<StoredOfficialResult[]>(
    () => db.officialResults.toArray(),
    []
  );
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    console.log('[useOfficialResults] mount, starting fetch');
    void (async () => {
      try {
        await syncOfficialResultsFromRemote();
        console.log('[useOfficialResults] sync done');
        if (cancelled) return;
        const at = await readOfficialSyncedAt();
        if (cancelled) return;
        setSyncedAt(at);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byMatchId = new Map((rows ?? []).map((r) => [r.matchId, r]));
  return { byMatchId, syncedAt, loading, error };
}
