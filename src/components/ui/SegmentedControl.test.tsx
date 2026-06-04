import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl } from './SegmentedControl';

describe('SegmentedControl', () => {
  it('marks the active option and fires onChange', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        ariaLabel="view"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        value="a"
        onChange={onChange}
      />
    );
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await userEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
