# public/official/

Snapshot of FIFA-official finished results for the World Cup 2026 collection.
Sourced from API-Football and committed by
[`.github/workflows/sync-official-results.yml`](../../.github/workflows/sync-official-results.yml).

The frontend downloads this file on first load of the tournament view and
caches it into IndexedDB (`officialResults` table). See
[`src/services/officialResultsService.ts`](../../src/services/officialResultsService.ts)
and [`src/hooks/useOfficialResults.ts`](../../src/hooks/useOfficialResults.ts).

The placeholder committed at `worldcup-2026-results.json` is intentionally
empty (`matches: []`); the first successful workflow run replaces it with
real data. Until then, the UI shows the user's predictions without an
"official" comparison badge.
