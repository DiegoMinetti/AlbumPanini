import { clamp, formatPercent } from '@/utils/format';

interface ProgressBarProps {
  /** Ratio 0..1. */
  value: number;
  label?: string;
  showPercent?: boolean;
  className?: string;
}

/**
 * M3 Linear Progress Indicator — track en `surface-container-highest`
 * (M3 spec) e indicator en `primary` (4dp de alto, `rounded-full`,
 * shape M3 full).
 *
 * Animación: `width` con duración `motion-medium2` y easing `standard`
 * (sensación M3 de "fill").
 */
export function ProgressBar({
  value,
  label,
  showPercent = true,
  className,
}: ProgressBarProps) {
  const pct = clamp(value, 0, 1);
  return (
    <div className={className}>
      {(label || showPercent) && (
        <div className="mb-1 flex items-center justify-between text-label-md text-on-surface-variant">
          {label ? <span>{label}</span> : <span />}
          {showPercent ? (
            <span className="font-medium tabular-nums">
              {formatPercent(pct)}
            </span>
          ) : null}
        </div>
      )}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-surface-container-highest"
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-motion-medium2 ease-standard"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}
