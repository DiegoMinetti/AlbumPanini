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
    'bg-primary-container text-on-primary-container shadow-elev-2 hover:shadow-elev-3',
  surface:
    'bg-surface-container-high text-primary shadow-elev-2 hover:shadow-elev-3',
} as const;

/**
 * Floating Action Button (M3).
 *
 * Posición M3 nativa — el FAB se ancla 96dp desde el borde inferior
 * en TODOS los viewports (móvil y tablet/desktop), respetando el
 * safe-area-inset-bottom. Equivale al `bottom-24` de los tests e2e
 * (96dp), que queda:
 *  - 16dp arriba del snackbar/banner (80dp = bottom-20).
 *  - 32dp arriba del BottomNav (64dp) en móvil.
 *  - 96dp del borde en desktop (donde no hay nav inferior).
 *
 * El FAB nunca queda detrás del BottomNav ni es interceptado por
 * overlays como el PWA prompt o toasts, que viven en z-50 a
 * bottom-20 (80dp) — el FAB está en z-30 a bottom-24 (96dp), así
 * que su hit area queda libre.
 *
 * M3 styling: shape `rounded-2xl` (M3 FAB), state layer, M3
 * elevation (3 → 4), scale-in animation.
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
        'group fixed z-30 inline-flex items-center justify-center gap-2 overflow-hidden',
        'rounded-2xl transition-all duration-motion-medium2 ease-emphasized',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isExtended ? 'h-14 rounded-2xl px-5 text-label-lg font-medium' : 'h-14 w-14',
        VARIANT_CLS[variant],
        // 96dp desde el borde inferior (equivale a bottom-24) en todos
        // los viewports, + safe-area-inset-bottom para iOS / Android.
        position === 'bottom-end' &&
          'right-4 bottom-[calc(96px+env(safe-area-inset-bottom))]',
        position === 'bottom-center' &&
          'left-1/2 -translate-x-1/2 bottom-[calc(96px+env(safe-area-inset-bottom))]',
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
