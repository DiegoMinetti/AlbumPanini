import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

interface FabProps {
  icon: ReactNode;
  label?: string; // Cuando está presente, se renderiza el FAB extendido.
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'surface';
  ariaLabel: string;
  /** Posición. Default 'bottom-end' (mobile, above bottom nav). */
  position?: 'bottom-end' | 'bottom-center';
  /** Si true, muestra animación de entrada. */
  enterAnimation?: boolean;
}

const VARIANT_CLS: Record<NonNullable<FabProps['variant']>, string> = {
  primary: 'bg-primary-container text-on-primary-container shadow-elev-4',
  secondary: 'bg-secondary-container text-on-secondary-container shadow-elev-4',
  tertiary: 'bg-tertiary-container text-on-tertiary-container shadow-elev-4',
  surface: 'bg-surface-container-high text-primary shadow-elev-4',
};

/**
 * Floating Action Button M3.
 *
 *   - Variantes: primary, secondary, tertiary, surface.
 *   - Modo "extendido" cuando recibe `label` (label + icon, height 56dp).
 *   - Modo "default" (icon-only, 56dp, circular).
 *   - State layer M3 + sombra elev-4.
 *   - Se posiciona fixed bottom-end con safe-area inset.
 */
export function Fab({
  icon,
  label,
  onClick,
  variant = 'primary',
  ariaLabel,
  position = 'bottom-end',
  enterAnimation = true,
}: FabProps) {
  const extended = Boolean(label);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={[
        'group fixed z-30 inline-flex items-center justify-center gap-2 overflow-hidden',
        'transition-all duration-motion-medium3 ease-emphasized',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        extended
          ? 'h-14 rounded-2xl px-4 text-label-lg'
          : 'h-14 w-14 rounded-full',
        VARIANT_CLS[variant],
        position === 'bottom-end' && 'right-4 bottom-20', // 16px + bottom nav (56dp)
        position === 'bottom-center' && 'left-1/2 -translate-x-1/2 bottom-20',
        enterAnimation && 'animate-scale-in',
      ].join(' ')}
    >
      <span className="grid h-6 w-6 place-items-center">{icon}</span>
      {extended && <span className="font-medium">{label}</span>}
      <span aria-hidden className="state-layer" />
    </button>
  );
}

/** Helper de uso común. */
export const PrimaryFab = (props: Omit<FabProps, 'variant'>) => (
  <Fab variant="primary" {...props} />
);

/** FAB con icono de upload (usado para BulkImport en Stickers). */
export const ImportFab = ({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) => (
  <Fab
    icon={<Icon name="upload" size={24} />}
    label="Importar"
    variant="primary"
    onClick={onClick}
    ariaLabel={ariaLabel}
  />
);
