import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  accent?: 'default' | 'success' | 'warning' | 'danger';
  icon?: ReactNode;
}

const ACCENTS: Record<NonNullable<StatCardProps['accent']>, string> = {
  default: 'text-slate-900 dark:text-slate-100',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
};

export function StatCard({ label, value, accent = 'default', icon }: StatCardProps) {
  return (
    <div className="card flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </span>
        {icon ? <span className="text-slate-400">{icon}</span> : null}
      </div>
      <span className={`text-2xl font-bold tabular-nums ${ACCENTS[accent]}`}>
        {value}
      </span>
    </div>
  );
}
