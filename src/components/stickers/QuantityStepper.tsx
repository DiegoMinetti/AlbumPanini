import { useEffect, useRef } from 'react';
import { haptics } from '@/utils/haptics';

interface QuantityStepperProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  size?: 'sm' | 'md';
  /** Stepper stays disabled even when quantity > 0. */
  disabled?: boolean;
}

/**
 * Numeric stepper M3 — estado layer, haptic feedback y long-press acceleration
 * opcional (a partir de 400ms empieza a incrementar cada 180ms). Conserva la
 * API original (props, aria-labels) para no romper los tests.
 */
export function QuantityStepper({
  quantity,
  onIncrement,
  onDecrement,
  size = 'md',
  disabled = false,
}: QuantityStepperProps) {
  const incTimer = useRef<number | null>(null);
  const incInterval = useRef<number | null>(null);

  const stop = () => {
    if (incTimer.current) {
      window.clearTimeout(incTimer.current);
      incTimer.current = null;
    }
    if (incInterval.current) {
      window.clearInterval(incInterval.current);
      incInterval.current = null;
    }
  };

  useEffect(() => stop, []);

  const dec = () => {
    if (disabled) return;
    haptics.tick();
    onDecrement();
  };
  const inc = () => {
    if (disabled) return;
    haptics.tick();
    onIncrement();
  };

  const startHold = (delta: 1 | -1) => {
    if (disabled) return;
    incTimer.current = window.setTimeout(() => {
      incInterval.current = window.setInterval(() => {
        if (delta > 0) inc();
        else dec();
      }, 180);
    }, 400);
  };

  const sizeCls =
    size === 'sm' ? 'h-8 w-8 text-base' : 'h-10 w-10 min-h-tap min-w-tap text-lg';

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        className={`has-state-layer relative grid place-items-center overflow-hidden rounded-full
          bg-surface-container text-on-surface
          transition-colors duration-motion-short2 ease-standard
          hover:bg-surface-container-high
          active:bg-surface-container-highest
          disabled:opacity-40 disabled:pointer-events-none
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${sizeCls}`}
        onClick={dec}
        onPointerDown={() => startHold(-1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        disabled={disabled || quantity <= 0}
        aria-label="decrement"
      >
        <span aria-hidden>−</span>
        <span aria-hidden className="state-layer" />
      </button>
      <span
        className="min-w-[2ch] text-center text-sm font-semibold tabular-nums"
        aria-label="quantity"
      >
        {quantity}
      </span>
      <button
        type="button"
        className={`has-state-layer relative grid place-items-center overflow-hidden rounded-full
          bg-primary-container text-on-primary-container
          transition-colors duration-motion-short2 ease-standard
          hover:bg-primary
          hover:text-on-primary
          active:bg-primary
          disabled:opacity-40 disabled:pointer-events-none
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${sizeCls}`}
        onClick={inc}
        onPointerDown={() => startHold(1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        disabled={disabled}
        aria-label="increment"
      >
        <span aria-hidden>+</span>
        <span aria-hidden className="state-layer" />
      </button>
    </div>
  );
}
