import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredSticker } from '@/types/collection';
import { QuantityStepper } from './QuantityStepper';

interface StickerCardProps {
  sticker: StoredSticker;
  quantity: number;
  view: 'grid' | 'list';
  showImage: boolean;
  /** When false the quantity stepper is hidden (read-only view). */
  editable: boolean;
  onIncrement: (stickerId: string) => void;
  onDecrement: (stickerId: string) => void;
  onSelect?: (sticker: StoredSticker) => void;
}

function statusRing(quantity: number): string {
  if (quantity === 0) return 'ring-slate-200 dark:ring-slate-800';
  if (quantity > 1) return 'ring-amber-400';
  return 'ring-emerald-400';
}

function StickerCardComponent({
  sticker,
  quantity,
  view,
  showImage,
  editable,
  onIncrement,
  onDecrement,
  onSelect,
}: StickerCardProps) {
  const { t } = useTranslation();
  const owned = quantity > 0;
  const dupes = Math.max(0, quantity - 1);
  const select = onSelect ? () => onSelect(sticker) : undefined;

  return (
    <div
      className={`flex ${view === 'grid' ? 'flex-col' : 'flex-row items-center'} gap-3 rounded-2xl bg-white p-3 ring-2 transition-opacity dark:bg-slate-900 ${statusRing(quantity)} ${owned ? '' : 'opacity-70'}`}
      data-testid="sticker-card"
      data-sticker-id={sticker.id}
      data-quantity={quantity}
    >
      {showImage && sticker.image ? (
        <img
          src={sticker.image}
          alt={sticker.name}
          loading="lazy"
          onClick={select}
          className={`${view === 'grid' ? 'h-24 w-full' : 'h-14 w-14'} rounded-lg object-cover ${select ? 'cursor-pointer' : ''}`}
        />
      ) : null}

      <button
        type="button"
        onClick={select}
        disabled={!select}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {sticker.code}
          </span>
          {dupes > 0 ? (
            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              +{dupes}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-sm font-semibold">{sticker.name}</p>
        <p className="text-xs text-slate-500">
          {t('stickers.quantity', { count: quantity })}
        </p>
      </button>

      {editable ? (
        <div className={view === 'grid' ? 'mt-1' : ''}>
          <QuantityStepper
            quantity={quantity}
            size={view === 'grid' ? 'sm' : 'md'}
            onIncrement={() => onIncrement(sticker.id)}
            onDecrement={() => onDecrement(sticker.id)}
          />
        </div>
      ) : null}
    </div>
  );
}

export const StickerCard = memo(StickerCardComponent);
