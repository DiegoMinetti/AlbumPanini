import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

interface PromptModalProps {
  open: boolean;
  title: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Optional checkbox shown under the input. */
  checkboxLabel?: string;
  onConfirm: (value: string, checked: boolean) => void;
  onCancel: () => void;
}

export function PromptModal({
  open,
  title,
  label,
  initialValue = '',
  placeholder,
  confirmLabel,
  checkboxLabel,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setChecked(false);
    }
  }, [open, initialValue]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onConfirm(value.trim(), checked)}
            disabled={value.trim().length === 0}
          >
            {confirmLabel ?? t('common.save')}
          </button>
        </>
      }
    >
      {label ? (
        <label className="mb-1 block text-sm text-slate-500">{label}</label>
      ) : null}
      <input
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        placeholder={placeholder}
        aria-label={label ?? title}
      />
      {checkboxLabel ? (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="h-4 w-4"
          />
          {checkboxLabel}
        </label>
      ) : null}
    </Modal>
  );
}
