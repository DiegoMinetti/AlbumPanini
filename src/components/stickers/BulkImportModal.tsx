import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { addByCodes, type BulkApplyReport } from '@/services/inventoryService';
import { extractCodes } from '@/utils/code';
import { toast } from '@/stores/uiStore';
import { haptics } from '@/utils/haptics';

interface BulkImportModalProps {
  open: boolean;
  onClose: () => void;
  collectionId: string;
}

export function BulkImportModal({
  open,
  onClose,
  collectionId,
}: BulkImportModalProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [report, setReport] = useState<BulkApplyReport | null>(null);
  const [busy, setBusy] = useState(false);

  // Live preview of detected codes for the in-modal counter chip.
  const detectedCount = useMemo(() => extractCodes(text).length, [text]);

  const handleImport = async () => {
    const codes = extractCodes(text);
    if (codes.length === 0) return;
    setBusy(true);
    try {
      const result = await addByCodes(collectionId, codes, 'bulk-import');
      setReport(result);
      haptics.success();
      toast.success(
        t('bulk.result', {
          copies: result.addedCopies,
          matched: result.matchedCount,
        })
      );
      setText('');
    } catch {
      haptics.error();
      toast.error(t('toast.error'));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setReport(null);
    setText('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('bulk.title')}
      footer={
        <>
          <button type="button" className="btn-outlined" onClick={handleClose}>
            {t('common.close')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleImport()}
            disabled={busy || text.trim().length === 0}
            aria-label={t('bulk.import')}
          >
            {t('bulk.import')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-on-surface-variant">
          {t('bulk.description')}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
            Códigos
          </span>
          <span
            className="rounded-full bg-primary-container px-2.5 py-0.5 text-xs font-semibold tabular-nums text-on-primary-container"
            aria-live="polite"
          >
            {t('bulk.result', {
              copies: detectedCount,
              matched: detectedCount,
            })}
          </span>
        </div>

        <textarea
          className="input min-h-[140px] resize-y py-2 font-mono"
          placeholder={t('bulk.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={t('bulk.title')}
          data-testid="bulk-input"
        />

        {report ? (
          <div
            className="rounded-md bg-secondary-container p-3"
            data-testid="bulk-report"
          >
            <p className="font-semibold text-on-secondary-container">
              {t('bulk.result', {
                copies: report.addedCopies,
                matched: report.matchedCount,
              })}
            </p>
            {report.unmatched.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium text-on-secondary-container">
                  {t('bulk.unmatched', { count: report.unmatched.length })}
                </summary>
                <p className="mt-1 break-words text-xs text-on-secondary-container/80">
                  {report.unmatched.join(', ')}
                </p>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
