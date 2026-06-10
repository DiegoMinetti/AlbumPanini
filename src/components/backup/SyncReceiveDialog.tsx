import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { SyncPayload } from '@/types/sync';
import type { ApplySyncSummary } from '@/services/syncService';

export type SyncReceiveMode = 'merge' | 'replace';

interface SyncReceiveDialogProps {
  open: boolean;
  payload: SyncPayload | null;
  mode: SyncReceiveMode;
  onChangeMode: (mode: SyncReceiveMode) => void;
  summary: ApplySyncSummary | null;
  /** True while a sync is being applied to the DB. */
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
}

/**
 * Modal shown on the Backup page when a sync QR (or chunk) has been
 * decoded. Lets the user pick merge vs replace, then trigger the actual
 * apply. Mirrors the style of {@link ConfirmDialog}.
 */
export function SyncReceiveDialog({
  open,
  payload,
  mode,
  onChangeMode,
  summary,
  applying,
  onApply,
  onCancel,
}: SyncReceiveDialogProps) {
  const { t } = useTranslation();

  const counts = payload
    ? {
        collections: payload.c.length,
        items: payload.c.reduce(
          (acc: number, c: { q: unknown[] }) => acc + c.q.length,
          0
        ),
        scenarios: payload.c.reduce(
          (acc: number, c: { s: unknown[] }) => acc + c.s.length,
          0
        ),
        settings: !!payload.st,
        missing: payload.c
          .filter((c: { i: string }) =>
            summary?.missingCollections?.includes(c.i)
          )
          .map((c: { i: string }) => c.i),
      }
    : null;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t('backup.sync.received.title')}
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={applying}
          >
            {t('backup.sync.received.ignore')}
          </button>
          <button
            type="button"
            className={mode === 'replace' ? 'btn-danger' : 'btn-primary'}
            onClick={onApply}
            disabled={applying || !payload}
            data-testid="sync-apply"
          >
            {applying ? t('common.loading') : t('backup.sync.received.apply')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body-md text-on-surface-variant">
        <p>{t('backup.sync.received.from')}</p>

        {counts ? (
          <ul className="flex flex-col gap-1 rounded-lg bg-surface-container p-3 text-body-md text-on-surface">
            <li>
              {t('backup.sync.received.collections', {
                count: counts.collections,
              })}
            </li>
            <li>
              {t('backup.sync.received.items', { count: counts.items })}
            </li>
            <li>
              {t('backup.sync.received.scenarios', {
                count: counts.scenarios,
              })}
            </li>
            {counts.settings ? (
              <li className="text-secondary">
                {t('backup.sync.received.settings')}
              </li>
            ) : null}
          </ul>
        ) : null}

        {counts && counts.missing.length > 0 ? (
          <p className="text-warning">
            {t('backup.sync.received.missingWarning', {
              count: counts.missing.length,
              ids: counts.missing.join(', '),
            })}
          </p>
        ) : null}

        <div>
          <label className="mb-1 block text-label-md text-on-surface-variant">
            {t('backup.sync.received.mode')}
          </label>
          <SegmentedControl
            ariaLabel={t('backup.sync.received.mode')}
            options={[
              { value: 'merge', label: t('backup.modeMerge') },
              { value: 'replace', label: t('backup.modeReplace') },
            ]}
            value={mode}
            onChange={(v) => onChangeMode(v as SyncReceiveMode)}
          />
        </div>
      </div>
    </Modal>
  );
}
