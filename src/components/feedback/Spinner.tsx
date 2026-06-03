interface SpinnerProps {
  label?: string;
  className?: string;
}

export function Spinner({ label, className }: SpinnerProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-10 text-slate-500 ${className ?? ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  );
}
