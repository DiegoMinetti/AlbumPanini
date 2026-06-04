# Backups & migrations

## Backup files (`.albumbackup`)

Export from **Backup → Export backup**. The file is the full app state
(`BackupPayload`) serialized to JSON and **gzip-compressed with pako**:

```
BackupPayload {
  magic: "PANINI-BACKUP"
  version: <BACKUP_VERSION>
  appVersion: string
  createdAt: number
  collections: [{ meta…, teams[], stickers[], inventory[] }]
  settings: Settings
}
```

Only owned inventory (quantity > 0) is stored to keep files small.

## Restore

Import from **Backup → Restore backup**:

- **Merge** — upserts the backup's collections, replacing those with matching
  ids and leaving others untouched.
- **Replace** — wipes all existing data first (full restore).

Restore is safe by construction:

1. `parseBackupFile` ungzips and hands the raw object to `migrateBackup`.
2. `migrateBackup` checks the magic signature, refuses **newer-than-supported**
   versions, then applies stepwise migrations up to the current version.
3. The result is validated with `backupPayloadSchema` (Zod) before any DB write.
4. Settings are merged onto defaults and re-validated.

A `RestoreSummary` reports how many collections/teams/stickers/inventory items
were restored and whether a migration happened.

## Adding a new backup version

1. Bump `BACKUP_VERSION` in `src/types/backup.ts` and update the schema.
2. Add a migration step in `migrateBackup` (`backupService.ts`):
   ```ts
   if (version < 2) working = migrateV1toV2(working);
   ```
3. Add a round-trip test in `backupService.test.ts`.

## Database migrations (IndexedDB)

Separate from backup versioning. Schema versions live in
`src/db/migrations.ts`; each entry has a `stores` definition and an optional
`upgrade(tx)`. `PaniniDatabase` registers them all and appends to a persisted
**version history** (visible under Settings → About). To evolve the schema,
**append** a new entry — never edit a released one.
