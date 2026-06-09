import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  backupFilename,
  exportBackup,
  parseBackupFile,
  restoreBackup,
} from '@/services/backupService';
import type { BackupPayload } from '@/types/backup';
import { downloadBlob, readFileAsBytes } from '@/utils/file';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/stores/uiStore';

/**
 * Backup — usa M3 tokens (text-on-surface-variant) en lugar de slate.
 * Mantiene data-testid y la API de SegmentedControl.
 */
export function BackupPage() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const applySettings = useSettingsStore((s) => s.applySettings);
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'replace' | 'merge'>('merge');
  const [pending, setPending] = useState<{
    payload: BackupPayload;
    migratedFrom?: number;
  } | null>(null);

  const handleExport = async () => {
    try {
      const blob = await exportBackup({
        theme: settings.theme,
        language: settings.language,
        haptics: settings.haptics,
        stickerView: settings.stickerView,
        activeCollectionId: settings.activeCollectionId,
        showImages: settings.showImages,
        stickerGrouped: settings.stickerGrouped,
        editMode: settings.editMode,
        appLaunchCount: settings.appLaunchCount,
        donationLinkOpened: settings.donationLinkOpened,
        defaultCollectionSeeded: settings.defaultCollectionSeeded,
      });
      downloadBlob(blob, backupFilename());
      toast.success(t('backup.exported'));
    } catch {
      toast.error(t('toast.error'));
    }
  };

  const handleFile = async (file: File) => {
    try {
      const bytes = await readFileAsBytes(file);
      const parsed = parseBackupFile(bytes);
      setPending(parsed);
    } catch {
      toast.error(t('backup.invalid'));
    }
  };

  const confirmRestore = async () => {
    if (!pending) return;
    try {
      const { summary, settings: restored } = await restoreBackup(
        pending.payload,
        { mode, migratedFrom: pending.migratedFrom }
      );
      applySettings(restored);
      if (summary.migratedFrom) {
        toast.info(t('backup.migrated', { from: summary.migratedFrom }));
      }
      toast.success(
        t('backup.restored', {
          collections: summary.collections,
          stickers: summary.stickers,
        })
      );
    } catch {
      toast.error(t('toast.error'));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-3">
        <h2 className="text-title-md font-semibold text-on-surface">
          {t('backup.export')}
        </h2>
        <p className="text-body-md text-on-surface-variant">
          {t('backup.exportDesc')}
        </p>
        <button
          type="button"
          className="btn-primary self-start"
          onClick={() => void handleExport()}
          data-testid="export-backup"
        >
          {t('backup.export')}
        </button>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-title-md font-semibold text-on-surface">
          {t('backup.import')}
        </h2>
        <p className="text-body-md text-on-surface-variant">
          {t('backup.importDesc')}
        </p>

        <div>
          <label className="mb-1 block text-label-md text-on-surface-variant">
            {t('backup.mode')}
          </label>
          <SegmentedControl
            ariaLabel={t('backup.mode')}
            options={[
              { value: 'merge', label: t('backup.modeMerge') },
              { value: 'replace', label: t('backup.modeReplace') },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>

        <button
          type="button"
          className="btn-secondary self-start"
          onClick={() => fileRef.current?.click()}
          data-testid="import-backup"
        >
          {t('backup.import')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".albumbackup,application/gzip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </section>

      <ConfirmDialog
        open={pending !== null}
        danger={mode === 'replace'}
        message={t('backup.restoreConfirm')}
        confirmLabel={t('backup.import')}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmRestore()}
      />
    </div>
  );
}
