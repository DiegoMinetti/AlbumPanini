import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { haptics } from '@/utils/haptics';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name, required when `label` is an icon rather than text. */
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

/**
 * M3 Segmented Control: indicator animado que se desliza entre segmentos.
 * Conserva la API original (`SegmentOption`, `value`, `onChange`) para que
 * los consumidores existentes (FilterBar, StickersPage) sigan funcionando.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number }>({
    x: 0,
    w: 0,
  });

  // Recalcular indicator en mount y cuando cambia el value.
  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>(
      `[data-segment-value="${value}"]`
    );
    if (!active) return;
    const rootRect = root.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    setIndicator({ x: aRect.left - rootRect.left, w: aRect.width });
  }, [value, options.length]);

  const handleChange = (next: T) => {
    if (next !== value) haptics.selection();
    onChange(next);
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className="relative inline-flex w-full gap-1 rounded-lg bg-surface-container p-1"
    >
      <span
        aria-hidden
        className="segmented-indicator"
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
            onClick={() => handleChange(opt.value)}
            className={`group relative z-10 flex min-h-tap flex-1 items-center justify-center gap-1.5
              overflow-hidden rounded-md px-2 text-sm font-medium
              transition-colors duration-motion-short3 ease-standard
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
              ${
                active
                  ? 'text-on-secondary-container'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
          >
            {opt.label}
            <span aria-hidden className="state-layer" />
          </button>
        );
      })}
    </div>
  );
}
