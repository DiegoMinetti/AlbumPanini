import { useState } from 'react';
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
          <button type="button" className="btn-secondary" onClick={handleClose}>
            {t('common.close')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleImport()}
            disabled={busy || text.trim().length === 0}
          >
            {t('bulk.import')}
          </button>
        </>
      }
    >
      <p className="mb-2 text-sm text-slate-500">{t('bulk.description')}</p>
      <textarea
        className="input min-h-[140px] resize-y py-2"
        placeholder={t('bulk.placeholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={t('bulk.title')}
        data-testid="bulk-input"
      />

      {report ? (
        <div className="mt-3 text-sm" data-testid="bulk-report">
          <p className="font-semibold text-emerald-600">
            {t('bulk.result', {
              copies: report.addedCopies,
              matched: report.matchedCount,
            })}
          </p>
          {report.unmatched.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-amber-600">
                {t('bulk.unmatched', { count: report.unmatched.length })}
              </summary>
              <p className="mt-1 break-words text-xs text-slate-500">
                {report.unmatched.join(', ')}
              </p>
            </details>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
