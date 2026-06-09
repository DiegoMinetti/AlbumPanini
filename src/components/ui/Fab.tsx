import type { ReactNode } from 'react';
import { haptics } from '@/utils/haptics';

interface FabProps {
  icon: ReactNode;
  /** When present, the FAB renders in "extended" mode (icon + label). */
  label?: string;
  onClick: () => void;
  /** Color variant. Default: 'primary' (M3 surface + primary icon). */
  variant?: 'primary' | 'tonal' | 'surface';
  ariaLabel: string;
  /** Visual position. Default: 'bottom-end'. */
  position?: 'bottom-end' | 'bottom-center';
  /** Render the extended label alongside the icon. */
  extended?: boolean;
  /** If true, play a scale-in animation on mount. */
  enterAnimation?: boolean;
}

const VARIANT_CLS = {
  primary: 'bg-primary text-on-primary shadow-elev-3 hover:shadow-elev-4',
  tonal:
    'bg-primary-container text-on-primary-container shadow-elev-3 hover:shadow-elev-4',
  surface:
    'bg-surface-container text-primary shadow-elev-3 hover:shadow-elev-4',
} as const;

/**
 * Floating Action Button (M3). Anchored bottom-end, above the bottom nav.
 * State layer + shadow elev-3/4 + scale-in animation.
 */
export function Fab({
  icon,
  label,
  onClick,
  variant = 'primary',
  ariaLabel,
  position = 'bottom-end',
  extended,
  enterAnimation = true,
}: FabProps) {
  const isExtended = extended ?? Boolean(label);
  const handle = () => {
    haptics.selection();
    onClick();
  };
  return (
    <button
      type="button"
      onClick={handle}
      aria-label={ariaLabel}
      data-testid="fab"
      className={[
        // z-50 keeps the primary action above transient notifications
        // (PWA update prompt, toasts — all at z-50 but earlier in the DOM).
        // Modals are also z-50 but rendered after the FAB in StickersPage,
        // so they still paint on top of the FAB when open.
        'group fixed z-50 inline-flex items-center justify-center gap-2 overflow-hidden',
        'rounded-full transition-all duration-motion-medium2 ease-emphasized',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isExtended ? 'h-14 rounded-2xl px-5 text-sm font-medium' : 'h-14 w-14',
        VARIANT_CLS[variant],
        position === 'bottom-end' && 'right-4 bottom-24',
        position === 'bottom-center' && 'left-1/2 -translate-x-1/2 bottom-24',
        enterAnimation && 'animate-scale-in',
      ].join(' ')}
    >
      <span className="grid h-6 w-6 place-items-center">{icon}</span>
      {isExtended && label ? (
        <span className="font-medium">{label}</span>
      ) : null}
      <span aria-hidden className="state-layer" />
    </button>
  );
}
