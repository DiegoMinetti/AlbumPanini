import { useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { hapticTick, hapticWarning } from '@/utils/haptics';

interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  variant?: 'compact' | 'inline' | 'modal';
  /** Si true, mantener presionado acelera el cambio. */
  longPressAcceleration?: boolean;
  /** Accesibilidad: etiqueta del grupo (ej: "Cantidad de figurita ARG 1"). */
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * Numeric stepper M3 — tres variantes:
 *   - compact: icon-only, en cards.
 *   - inline: con label numérica, en listas.
 *   - modal: con field outlined, en StickerDetailModal.
 *
 * Haptic feedback por unidad + warning al alcanzar el máximo.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  variant = 'inline',
  longPressAcceleration = true,
  ariaLabel,
  disabled = false,
}: QuantityStepperProps) {
  const incTimer = useRef<number | null>(null);
  const incInterval = useRef<number | null>(null);

  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  const stop = () => {
    if (incTimer.current) {
      window.clearTimeout(incTimer.current);
      incTimer.current = null;
    }
    if (incInterval.current) {
      window.clearInterval(incInterval.current);
      incInterval.current = null;
    }
  };

  useEffect(() => stop, []);

  const change = (delta: 1 | -1) => {
    if (disabled) return;
    const next = clamp(value + delta);
    if (next === value) {
      hapticWarning();
      return;
    }
    hapticTick();
    onChange(next);
  };

  const startHold = (delta: 1 | -1) => {
    if (!longPressAcceleration) return;
    incTimer.current = window.setTimeout(() => {
      incInterval.current = window.setInterval(() => change(delta), 180);
    }, 400);
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center',
        variant === 'modal' && 'rounded-lg border border-outline-variant bg-surface',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <StepperButton
        ariaLabel="decrement"
        onPointerDown={() => startHold(-1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onClick={() => change(-1)}
        disabled={disabled || value <= min}
        size={variant === 'modal' ? 'md' : 'sm'}
      >
        <Icon name="minus" size={variant === 'modal' ? 20 : 18} />
      </StepperButton>

      <span
        aria-live="polite"
        className={[
          'min-w-[2.5ch] text-center font-medium tabular-nums',
          variant === 'modal'
            ? 'px-3 text-title-md text-on-surface'
            : 'px-2 text-title-sm text-on-surface',
        ].join(' ')}
      >
        {value}
      </span>

      <StepperButton
        ariaLabel="increment"
        onPointerDown={() => startHold(1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onClick={() => change(1)}
        disabled={disabled || value >= max}
        size={variant === 'modal' ? 'md' : 'sm'}
      >
        <Icon name="plus" size={variant === 'modal' ? 20 : 18} />
      </StepperButton>
    </div>
  );
}

function StepperButton({
  children,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  disabled,
  ariaLabel,
  size,
}: {
  children: React.ReactNode;
  onClick: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
  disabled?: boolean;
  ariaLabel: string;
  size: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      disabled={disabled}
      className={[
        'group/btn relative grid place-items-center overflow-hidden',
        'transition-colors duration-motion-short2 ease-standard',
        'hover:bg-surface-container-high active:bg-surface-container-highest',
        'disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        size === 'md' ? 'h-12 w-12' : 'h-9 w-9',
      ].join(' ')}
    >
      {children}
      <span aria-hidden className="state-layer" />
    </button>
  );
}
