import { useUiStore, type ToastKind } from '@/stores/uiStore';

const KIND_STYLES: Record<ToastKind, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-slate-800 text-white dark:bg-slate-700',
};

export function ToastViewport() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 pb-safe-bottom"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto w-full max-w-sm animate-slide-up rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${KIND_STYLES[t.kind]}`}
          role="alert"
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
