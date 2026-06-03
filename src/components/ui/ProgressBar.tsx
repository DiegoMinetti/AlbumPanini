import { clamp, formatPercent } from '@/utils/format';

interface ProgressBarProps {
  /** Ratio 0..1. */
  value: number;
  label?: string;
  showPercent?: boolean;
  className?: string;
}

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
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          {label ? <span>{label}</span> : <span />}
          {showPercent ? (
            <span className="font-semibold tabular-nums">
              {formatPercent(pct)}
            </span>
          ) : null}
        </div>
      )}
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}
