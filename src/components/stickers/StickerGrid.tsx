import type { StoredSticker } from '@/types/collection';
import { StickerCard } from './StickerCard';

interface StickerGridProps {
  stickers: StoredSticker[];
  inventory: Map<string, number>;
  teamColorsById?: Map<
    string,
    { primaryColor?: string; secondaryColor?: string }
  >;
  view: 'grid' | 'list';
  showImages: boolean;
  editable: boolean;
  onIncrement: (stickerId: string) => void;
  onDecrement: (stickerId: string) => void;
  onSelect?: (sticker: StoredSticker) => void;
}

export function StickerGrid({
  stickers,
  inventory,
  teamColorsById,
  view,
  showImages,
  editable,
  onIncrement,
  onDecrement,
  onSelect,
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
          teamColors={
            sticker.teamId ? teamColorsById?.get(sticker.teamId) : undefined
          }
          view={view}
          showImage={showImages}
          editable={editable}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
