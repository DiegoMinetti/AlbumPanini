import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

/**
 * M3 Empty State — contenedor centrado con icono, título, descripción y
 * acción opcional. Usa `outline-variant` para el borde punteado, que es
 * la convención M3 para estados vacíos en listas.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg
        border border-dashed border-outline-variant bg-surface-container-lowest
        px-6 py-12 text-center"
    >
      {icon ? (
        <div
          className="grid h-16 w-16 place-items-center rounded-full
            bg-surface-container text-on-surface-variant"
        >
          {icon}
        </div>
      ) : null}
      <h3 className="text-title-md text-on-surface">{title}</h3>
      {description ? (
        <p className="max-w-sm text-body-md text-on-surface-variant">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
