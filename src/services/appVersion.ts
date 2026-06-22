import { db } from '@/db';
import type { StoredAppVersion } from '@/db/database';

/**
 * App-version bookkeeping.
 *
 * On every fresh launch we look up the most recent `appVersions` row
 * (the "current install") and compare its `buildSha` against the SHA of
 * the running build (injected by the deploy workflow as
 * `VITE_APP_VERSION`). When they differ:
 *   1. The previous row is marked `isCurrent: false`.
 *   2. A new row is appended with the current build, `isCurrent: true`.
 *
 * Returning the previous version's label lets the caller fire a subtle
 * "updated to vX" toast without having to query again.
 *
 * Idempotent: re-running with the same SHA is a no-op (the same row
 * stays `isCurrent: true`). Safe to call on every launch.
 */

/** Read the build SHA lazily so tests can stub it per-case via vi.stubEnv. */
function getBuildSha(): string {
  return import.meta.env.VITE_APP_VERSION ?? 'dev';
}

export interface VersionCheckResult {
  /** True if the build SHA changed since the previous launch. */
  updated: boolean;
  /** Label of the previous build (`"v1234abc"`, `"dev"`, …) — undefined on first install. */
  previousVersion?: string;
  /** Label of the build the app is currently on. */
  currentVersion: string;
  /** Full SHA of the previous build, useful for analytics / debugging. */
  previousSha?: string;
  /** Full SHA of the build that just ran the check. */
  currentSha: string;
}

export async function recordAppLaunch(): Promise<VersionCheckResult> {
  const currentSha = getBuildSha();
  const currentVersion = labelFromSha(currentSha);

  const previous = (await db.appVersions
    .orderBy('installedAt')
    .reverse()
    .first()) as StoredAppVersion | undefined;

  // Three branches:
  //   1. No previous row → first install. Write the row, return updated=false
  //      so the caller doesn't fire a "welcome, you're on v1" toast.
  //   2. Same SHA as previous → no change. Return updated=false.
  //   3. Different SHA → write a new row and flag updated=true so the
  //      caller can show an "updated to vX" toast.
  if (!previous) {
    await db.appVersions.add({
      version: currentVersion,
      buildSha: currentSha,
      installedAt: Date.now(),
      isCurrent: true,
    });
    return {
      updated: false,
      currentVersion,
      currentSha,
    };
  }

  if (previous.buildSha === currentSha) {
    return {
      updated: false,
      previousVersion: previous.version,
      currentVersion,
      previousSha: previous.buildSha,
      currentSha,
    };
  }

  // Mark the previous row as no-longer-current in the same transaction
  // that appends the new one, so we never have two `isCurrent: true`.
  await db.transaction('rw', db.appVersions, async () => {
    await db.appVersions.update(previous.id!, { isCurrent: false });
    await db.appVersions.add({
      version: currentVersion,
      buildSha: currentSha,
      installedAt: Date.now(),
      isCurrent: true,
    });
  });

  return {
    updated: true,
    previousVersion: previous.version,
    currentVersion,
    previousSha: previous.buildSha,
    currentSha,
  };
}

/** Read the most recent `appVersions` row — the user's current install. */
export async function getCurrentAppVersion(): Promise<
  StoredAppVersion | undefined
> {
  return db.appVersions.orderBy('installedAt').reverse().first();
}

/**
 * Build a short label from a SHA. Production deploys inject the full
 * SHA via `VITE_APP_VERSION`; we render the first 7 hex chars prefixed
 * by `v` for human display. Local dev falls back to `dev`.
 */
function labelFromSha(sha: string): string {
  if (!sha || sha === 'dev') return 'dev';
  const short = sha.slice(0, 7);
  return `v${short}`;
}
