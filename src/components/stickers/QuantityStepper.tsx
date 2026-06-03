import { haptics } from '@/utils/haptics';

interface QuantityStepperProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  size?: 'sm' | 'md';
}

export function QuantityStepper({
  quantity,
  onIncrement,
  onDecrement,
  size = 'md',
}: QuantityStepperProps) {
  const btn =
    size === 'sm'
      ? 'h-8 w-8 text-base'
      : 'min-h-tap min-w-tap text-lg';

  const dec = () => {
    haptics.light();
    onDecrement();
  };
  const inc = () => {
    haptics.light();
    onIncrement();
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={`btn-secondary rounded-full px-0 ${btn}`}
        onClick={dec}
        disabled={quantity <= 0}
        aria-label="decrement"
      >
        −
      </button>
      <span
        className="min-w-[2ch] text-center text-sm font-bold tabular-nums"
        aria-label="quantity"
      >
        {quantity}
      </span>
      <button
        type="button"
        className={`btn-primary rounded-full px-0 ${btn}`}
        onClick={inc}
        aria-label="increment"
      >
        +
      </button>
    </div>
  );
}
