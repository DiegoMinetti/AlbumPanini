import { useUiStore, type ToastKind } from '@/stores/uiStore';

/**
 * M3 Snackbar — variante de alta-emphasis que usa `inverse-surface`
 * como fondo y `inverse-on-surface` como color de texto. Esta es la
 * variante recomendada por M3 cuando el mensaje debe destacarse
 * por encima del contenido (success/error/warning).
 *
 * Posición M3 nativa (alineada con PwaUpdatePrompt):
 *  - `bottom-[calc(80px+env(safe-area-inset-bottom))]` — equivalente
 *    M3 de `bottom-20` (80dp) que respeta el safe-area-inset-bottom.
 *  - 80dp deja 16dp de aire arriba del BottomNav (64dp) y queda
 *    debajo del FAB (96dp), sin colisiones con ninguno de los dos.
 *
 * `pointer-events-none` en el wrapper y `pointer-events-auto` en
 * cada toast garantiza que el contenedor full-width NO intercepte
 * clicks que no son del propio snackbar (e.g. botones de modales
 * abiertos debajo). Solo el área visible de cada toast recibe
 * pointer events.
 */

const KIND_STYLES: Record<ToastKind, string> = {
  success: 'bg-inverse-surface text-inverse-on-surface',
  error: 'bg-error text-on-error',
  warning: 'bg-tertiary text-on-tertiary',
  info: 'bg-inverse-surface text-inverse-on-surface',
};

export function ToastViewport() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 mx-auto flex max-w-md
        flex-col items-center gap-2 px-3
        bottom-[calc(80px+env(safe-area-inset-bottom))]"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto w-full animate-slide-up rounded-lg
            px-4 py-3 text-left text-label-lg font-medium shadow-elev-3
            transition-colors duration-motion-short2 ease-standard
            hover:shadow-elev-4 focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-primary ${KIND_STYLES[t.kind]}`}
          role="alert"
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
