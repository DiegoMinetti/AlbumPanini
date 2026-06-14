import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  readOfficialSyncedAt,
  syncOfficialResultsFromRemote,
} from '@/services/officialResultsService';
import { autoFillOfficialScenarios } from '@/services/officialAutoFillService';
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
 * After every successful sync we run `autoFillOfficialScenarios`: this
 * propagates each finished FIFA result into the `predictions` table
 * for every scenario that has `isOfficial: true`. The official scenario
 * therefore always mirrors the FIFA result without any user typing.
 * Custom (user-owned) scenarios are NOT touched.
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

  // The auto-fill is split into its own effect so that StrictMode's
  // double-mount in dev doesn't cancel the Dexie transaction mid-flight.
  // It runs after every successful sync (driven by `lastSyncAt`) and is
  // idempotent: re-running is a no-op when the predictions are already
  // up to date.
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await syncOfficialResultsFromRemote();
        if (cancelled) return;
        setLastSyncAt(Date.now());
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

  // Auto-fill: runs whenever lastSyncAt bumps (i.e. after every successful
  // sync). Idempotent — safe to run repeatedly; Dexie's bulkPut replaces
  // existing rows.
  useEffect(() => {
    if (lastSyncAt == null) return;
    let cancelled = false;
    void (async () => {
      try {
        await autoFillOfficialScenarios(await db.officialResults.toArray());
        if (cancelled) return;
      } catch (err) {
        if (cancelled) return;
        console.warn('[oficial] auto-fill failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lastSyncAt]);

  const byMatchId = new Map((rows ?? []).map((r) => [r.matchId, r]));
  return { byMatchId, syncedAt, loading, error };
}
