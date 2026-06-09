import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  accent?: 'default' | 'success' | 'warning' | 'danger';
  icon?: ReactNode;
}

/**
 * M3 stat card — `surface-container-low` + elev-1, con label superior
 * tipográfico M3 (`text-label-md uppercase`) y valor como `text-headline-sm`.
 *
 * Las accents semánticas (success/warning/danger) usan los roles M3
 * (secondary, tertiary, error) en lugar de clases slate hard-coded.
 */
const ACCENTS: Record<NonNullable<StatCardProps['accent']>, string> = {
  default: 'text-on-surface',
  success: 'text-secondary',
  warning: 'text-tertiary',
  danger: 'text-error',
};

export function StatCard({
  label,
  value,
  accent = 'default',
  icon,
}: StatCardProps) {
  return (
    <div className="card flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-label-md uppercase tracking-wide text-on-surface-variant">
          {label}
        </span>
        {icon ? (
          <span className="text-on-surface-variant">{icon}</span>
        ) : null}
      </div>
      <span
        className={`text-headline-sm font-semibold tabular-nums ${ACCENTS[accent]}`}
      >
        {value}
      </span>
    </div>
  );
}
