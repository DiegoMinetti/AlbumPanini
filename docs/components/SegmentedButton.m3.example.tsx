import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  ariaLabel?: string;
}

interface SegmentedButtonProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

/**
 * SegmentedButton M3 con indicator animado.
 *
 * Mantiene la API del `SegmentedControl` actual (role="tablist") pero agrega:
 *   - Indicator (slider) que se anima entre segmentos.
 *   - State layer M3.
 *   - Iconos opcionales.
 *
 * Implementación: un único indicator absoluto cuyo `transform: translateX()`
 * se actualiza con `useLayoutEffect` midiendo el botón activo.
 */
export function SegmentedButton<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedButtonProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number }>({ x: 0, w: 0 });

  // Recalcular indicator en mount y cuando cambia el value.
  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>(
      `[data-segment-value="${value}"]`,
    );
    if (!active) return;
    const rootRect = root.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    setIndicator({ x: aRect.left - rootRect.left, w: aRect.width });
  }, [value, options.length]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className="relative inline-flex w-full gap-1 rounded-lg bg-surface-container p-1"
    >
      {/* Indicator */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 bottom-1 rounded-md bg-secondary-container shadow-elev-1 transition-all duration-motion-medium2 ease-emphasized"
        style={{
          transform: `translateX(${indicator.x}px)`,
          width: `${indicator.w}px`,
        }}
      />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            data-segment-value={opt.value}
            aria-selected={active}
            aria-label={opt.ariaLabel}
            title={opt.ariaLabel}
            onClick={() => onChange(opt.value)}
            className={[
              'group relative z-10 flex min-h-tap flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-md px-2',
              'text-label-lg transition-colors duration-motion-short3 ease-standard',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              active
                ? 'text-on-secondary-container'
                : 'text-on-surface-variant hover:text-on-surface',
            ].join(' ')}
          >
            {opt.icon ? <span className="grid place-items-center">{opt.icon}</span> : null}
            <span className="font-medium">{opt.label}</span>
            <span aria-hidden className="state-layer" />
          </button>
        );
      })}
    </div>
  );
}
