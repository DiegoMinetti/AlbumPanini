import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { StickerCard } from './StickerCard';
import { sticker } from '@/tests/helpers';

const base = sticker({ id: 'ARG-1', code: 'ARG 1', name: 'Messi' });

describe('StickerCard', () => {
  it('shows code, name and duplicate badge', () => {
    render(
      <StickerCard
        sticker={base}
        quantity={3}
        view="grid"
        showImage={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
      />
    );
    expect(screen.getByText('ARG 1')).toBeInTheDocument();
    expect(screen.getByText('Messi')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument(); // duplicates badge
  });

  it('passes sticker id to handlers', async () => {
    const onInc = vi.fn();
    render(
      <StickerCard
        sticker={base}
        quantity={0}
        view="list"
        showImage={false}
        onIncrement={onInc}
        onDecrement={vi.fn()}
      />
    );
    await userEvent.click(screen.getByLabelText('increment'));
    expect(onInc).toHaveBeenCalledWith('ARG-1');
  });
});
