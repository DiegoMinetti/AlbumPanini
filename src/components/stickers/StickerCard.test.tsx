import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
        editable
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
        editable
        onIncrement={onInc}
        onDecrement={vi.fn()}
      />
    );
    await userEvent.click(screen.getByLabelText('increment'));
    expect(onInc).toHaveBeenCalledWith('ARG-1');
  });

  it('hides quantity controls in read-only mode', () => {
    render(
      <StickerCard
        sticker={base}
        quantity={1}
        view="grid"
        showImage={false}
        editable={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('increment')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('decrement')).not.toBeInTheDocument();
  });

  it('shows fallback avatar when player has no photo', () => {
    render(
      <StickerCard
        sticker={base}
        quantity={1}
        view="grid"
        showImage
        teamColors={{ primaryColor: '#75AADB', secondaryColor: '#FFFFFF' }}
        editable={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
      />
    );

    expect(screen.getByRole('img', { name: 'Messi' })).toBeInTheDocument();
  });

  it('normalizes http urls and falls back when image fails to load', () => {
    render(
      <StickerCard
        sticker={sticker({
          id: 'ARG-10',
          code: 'ARG 10',
          name: 'Maradona',
          image: 'http://commons.wikimedia.org/wiki/Special:FilePath/Test.jpg',
        })}
        quantity={1}
        view="grid"
        showImage
        editable={false}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
      />
    );

    const img = screen.getByRole('img', { name: 'Maradona' });
    expect(img).toHaveAttribute(
      'src',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Test.jpg'
    );

    fireEvent.error(img);
    expect(screen.getByRole('img', { name: 'Maradona' })).toBeInTheDocument();
  });
});
