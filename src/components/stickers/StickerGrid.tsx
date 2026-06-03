import type { StoredSticker } from '@/types/collection';
import { StickerCard } from './StickerCard';

interface StickerGridProps {
  stickers: StoredSticker[];
  inventory: Map<string, number>;
  view: 'grid' | 'list';
  showImages: boolean;
  onIncrement: (stickerId: string) => void;
  onDecrement: (stickerId: string) => void;
}

export function StickerGrid({
  stickers,
  inventory,
  view,
  showImages,
  onIncrement,
  onDecrement,
}: StickerGridProps) {
  return (
    <div
      className={
        view === 'grid'
          ? 'grid grid-cols-2 gap-3 sm:grid-cols-3'
          : 'flex flex-col gap-2'
      }
      data-testid="sticker-grid"
    >
      {stickers.map((sticker) => (
        <StickerCard
          key={sticker.uid}
          sticker={sticker}
          quantity={inventory.get(sticker.id) ?? 0}
          view={view}
          showImage={showImages}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
        />
      ))}
    </div>
  );
}
