import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuantityStepper } from './QuantityStepper';

describe('QuantityStepper', () => {
  it('renders quantity and fires callbacks', async () => {
    const onInc = vi.fn();
    const onDec = vi.fn();
    render(
      <QuantityStepper quantity={2} onIncrement={onInc} onDecrement={onDec} />
    );
    expect(screen.getByLabelText('quantity')).toHaveTextContent('2');

    await userEvent.click(screen.getByLabelText('increment'));
    expect(onInc).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByLabelText('decrement'));
    expect(onDec).toHaveBeenCalledOnce();
  });

  it('disables decrement at zero', () => {
    render(
      <QuantityStepper
        quantity={0}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
      />
    );
    expect(screen.getByLabelText('decrement')).toBeDisabled();
  });
});
