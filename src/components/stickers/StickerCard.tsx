import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredSticker } from '@/types/collection';
import { QuantityStepper } from './QuantityStepper';

interface StickerCardProps {
  sticker: StoredSticker;
  quantity: number;
  view: 'grid' | 'list';
  showImage: boolean;
  teamColors?: { primaryColor?: string; secondaryColor?: string };
  /** When false the quantity stepper is hidden (read-only view). */
  editable: boolean;
  onIncrement: (stickerId: string) => void;
  onDecrement: (stickerId: string) => void;
  onSelect?: (sticker: StoredSticker) => void;
}

function normalizeStickerImageSrc(src?: string): string | null {
  if (!src) return null;
  if (src.startsWith('http://')) return `https://${src.slice(7)}`;
  return src;
}

function StickerFallbackImage({
  label,
  view,
  teamColors,
}: {
  label: string;
  view: 'grid' | 'list';
  teamColors?: { primaryColor?: string; secondaryColor?: string };
}) {
  const primary = teamColors?.primaryColor ?? '#9ca3af';
  const secondary = teamColors?.secondaryColor ?? '#6b7280';

  return (
    <div
      role="img"
      aria-label={label}
      className={`${
        view === 'grid' ? 'h-24 w-full' : 'h-14 w-14'
      } relative overflow-hidden rounded-lg`}
      style={{
        background:
          'linear-gradient(155deg, var(--md-sys-color-surface-container) 0%, var(--md-sys-color-surface-container-high) 45%, var(--md-sys-color-surface-container-highest) 100%)',
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ backgroundColor: primary }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1.5"
        style={{ backgroundColor: secondary }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full bg-surface-container-low/80" />
      </div>
    </div>
  );
}

/**
 * M3 status accent: ring-color reemplaza el status ring M2. Mapea al
 * rol M3 correspondiente:
 *   - missing    → outline-variant
 *   - duplicate  → tertiary
 *   - owned      → secondary
 */
function statusAccent(quantity: number): string {
  if (quantity === 0) return 'ring-outline-variant/60';
  if (quantity > 1) return 'ring-tertiary/70';
  return 'ring-secondary/70';
}

function StickerCardComponent({
  sticker,
  quantity,
  view,
  showImage,
  teamColors,
  editable,
  onIncrement,
  onDecrement,
  onSelect,
}: StickerCardProps) {
  const { t } = useTranslation();
  const owned = quantity > 0;
  const dupes = Math.max(0, quantity - 1);
  const select = onSelect ? () => onSelect(sticker) : undefined;
  const [imageError, setImageError] = useState(false);

  const imageSrc = useMemo(
    () => normalizeStickerImageSrc(sticker.image),
    [sticker.image]
  );

  useEffect(() => {
    setImageError(false);
  }, [imageSrc, sticker.uid]);

  const showPhoto = showImage && !!imageSrc && !imageError;
  const showFallback = showImage && !showPhoto;

  const containerCls = [
    'group flex gap-3 rounded-md p-3 ring-1 transition-shadow',
    'duration-motion-short3 ease-standard',
    'bg-surface-container-low shadow-elev-1 hover:shadow-elev-2',
    statusAccent(quantity),
    owned ? '' : 'opacity-70',
    view === 'grid' ? 'flex-col' : 'flex-row items-center',
  ].join(' ');

  return (
    <div
      className={containerCls}
      data-testid="sticker-card"
      data-sticker-id={sticker.id}
      data-quantity={quantity}
    >
      {showPhoto ? (
        <img
          src={imageSrc ?? undefined}
          alt={sticker.name}
          loading="lazy"
          onClick={select}
          onError={() => setImageError(true)}
          className={`${
            view === 'grid' ? 'h-24 w-full' : 'h-14 w-14'
          } rounded-lg object-cover object-center ${
            select ? 'cursor-pointer' : ''
          }`}
        />
      ) : null}

      {showFallback ? (
        <div onClick={select} className={select ? 'cursor-pointer' : ''}>
          <StickerFallbackImage
            label={sticker.name}
            view={view}
            teamColors={teamColors}
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={select}
        disabled={!select}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-surface-container px-1.5 py-0.5 text-label-sm font-bold uppercase text-on-surface-variant">
            {sticker.code}
          </span>
          {dupes > 0 ? (
            <span className="rounded-md bg-tertiary-container px-1.5 py-0.5 text-label-sm font-semibold text-on-tertiary-container">
              +{dupes}
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-body-md font-semibold text-on-surface">
          {sticker.name}
        </p>
        <p className="text-label-md text-on-surface-variant">
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
