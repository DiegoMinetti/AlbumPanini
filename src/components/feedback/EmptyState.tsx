import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700">
      {icon ? <div className="text-4xl">{icon}</div> : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm text-slate-500">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
