import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Optional sub-header rendered below the title. */
  subtitle?: ReactNode;
  /** Hide the drag handle and rounded top corners (for centered dialogs). */
  variant?: 'sheet' | 'dialog';
}

/**
 * Accessible bottom-sheet / dialog modal. Closes on Escape / backdrop click and
 * locks body scroll while open. Intentionally avoids native dialog() to prevent
 * focus traps from interfering with browser automation/tests.
 *
 * M3 styling: drag handle, M3 surface, scrim @ 32% (per M3 spec), state layer
 * on the close button, and a fixed footer with M3 buttons.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  subtitle,
  variant = 'sheet',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const isSheet = variant === 'sheet';

  return (
    <div
      className={`fixed inset-0 z-50 flex ${
        isSheet
          ? 'items-end justify-center sm:items-end'
          : 'items-center justify-center'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-slate-900/40 animate-fade-in dark:bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative z-10 w-full max-w-md bg-surface shadow-elev-5
        animate-slide-up text-on-surface
        ${isSheet ? 'rounded-t-xl pb-4' : 'm-4 rounded-xl'}`}
      >
        {isSheet ? <span className="drag-handle mt-3" aria-hidden /> : null}

        {title ? (
          <div className="flex items-center gap-2 px-4 pb-2 pt-1">
            <h2 className="flex-1 text-lg font-semibold leading-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="close"
              className="has-state-layer grid h-9 w-9 place-items-center rounded-full
                text-on-surface-variant transition-colors
                duration-motion-short2 ease-standard
                hover:bg-surface-container-high
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon name="close" size={20} />
              <span aria-hidden className="state-layer" />
            </button>
          </div>
        ) : null}

        {subtitle ? (
          <div className="px-4 pb-2 text-sm text-on-surface-variant">
            {subtitle}
          </div>
        ) : null}

        <div className="max-h-[70vh] overflow-y-auto px-4">{children}</div>

        {footer ? (
          <div className="mt-3 flex justify-end gap-2 px-4 pt-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
