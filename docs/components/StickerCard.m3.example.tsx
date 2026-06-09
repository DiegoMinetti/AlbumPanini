import { useState, type ReactNode } from 'react';
import type { StoredSticker } from '@/types/collection';
import { Icon } from '@/components/ui/Icon';

interface StickerCardProps {
  sticker: StoredSticker;
  quantity: number;
  view: 'grid' | 'list';
  showImage: boolean;
  editable: boolean;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onLongPress?: (id: string) => void;
  /** Acción opcional que se invoca al tocar la card (abrir detalle). */
  onOpen?: (id: string) => void;
  /** Equipo para colorear la franja superior. */
  teamColors?: { primaryColor?: string; secondaryColor?: string };
  /** Variante de display. */
  variant?: 'elevated' | 'outlined' | 'filled';
}

/**
 * StickerCard refactorizado según Material Design 3.
 *
 *   - Elevated card con sombra y state layer.
 *   - Rarity chip tonal.
 *   - Quantity badge con color semántico (tertiary / tertiary-container / outline).
 *   - Imagen con aspect-ratio 3/4 y fallback de inicial sobre primary-container.
 *   - Mantiene la API original para no romper los tests existentes.
 */
export function StickerCard({
  sticker,
  quantity,
  view,
  showImage,
  editable,
  onIncrement,
  onDecrement,
  onLongPress,
  onOpen,
  teamColors,
  variant = 'elevated',
}: StickerCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const owned = quantity > 0;
  const duplicate = quantity > 1;
  const state = !owned ? 'missing' : duplicate ? 'duplicate' : 'owned';

  const handleClick = () => onOpen?.(sticker.id);
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen?.(sticker.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKey}
      aria-label={`${sticker.code} ${sticker.name} — ${
        owned ? (duplicate ? `${quantity} copias` : 'tengo') : 'falta'
      }`}
      className={[
        'group relative flex cursor-pointer flex-col overflow-hidden text-left',
        'rounded-md transition-all duration-motion-medium2 ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        variant === 'elevated' && 'bg-surface-container-low shadow-elev-1 hover:shadow-elev-2',
        variant === 'outlined' && 'bg-surface outline outline-1 outline-outline-variant',
        variant === 'filled' && 'bg-surface-container',
        state === 'missing' && 'opacity-80',
        view === 'list' && 'flex-row items-center',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Media */}
      {showImage && view === 'grid' && (
        <div
          className="relative aspect-[3/4] overflow-hidden bg-surface-container-high"
          style={{
            background: teamColors?.primaryColor
              ? `linear-gradient(135deg, ${teamColors.primaryColor}33 0%, transparent 60%)`
              : undefined,
          }}
        >
          {sticker.image && !imgFailed ? (
            <img
              src={sticker.image}
              alt={sticker.name}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <StickerFallback name={sticker.name} colors={teamColors} />
          )}

          {/* Rarity chip */}
          <RarityBadge rarity={sticker.rarity} className="absolute right-2 top-2" />

          {/* Quantity badge */}
          <QuantityBadge quantity={quantity} className="absolute left-2 top-2" />
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <span className="text-label-md text-on-surface-variant tabular-nums">
          {sticker.code}
        </span>
        <span className="line-clamp-2 text-title-sm text-on-surface">
          {sticker.name}
        </span>

        {view === 'list' && (
          <div className="mt-1 flex items-center gap-2 text-body-sm text-on-surface-variant">
            {sticker.category && <span>{sticker.category}</span>}
            {sticker.rarity && <RarityBadge rarity={sticker.rarity} size="sm" />}
          </div>
        )}

        {/* Stepper inline (only when editable) */}
        {editable && (
          <div
            className="mt-2 flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <StepperButton
              ariaLabel="decrement"
              icon={<Icon name="minus" size={18} />}
              onClick={() => onDecrement(sticker.id)}
              disabled={quantity === 0}
            />
            <span
              className="min-w-[2ch] text-center text-title-sm tabular-nums"
              aria-live="polite"
            >
              {quantity}
            </span>
            <StepperButton
              ariaLabel="increment"
              icon={<Icon name="plus" size={18} />}
              onClick={() => onIncrement(sticker.id)}
            />
          </div>
        )}
      </div>

      {/* State layer M3 */}
      <span aria-hidden className="state-layer" />
    </div>
  );
}

// ── subcomponents ────────────────────────────────────────────

function StickerFallback({
  name,
  colors,
}: {
  name: string;
  colors?: { primaryColor?: string; secondaryColor?: string };
}) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-primary-container text-on-primary-container"
      style={
        colors?.primaryColor
          ? { background: `${colors.primaryColor}22` }
          : undefined
      }
    >
      <span className="text-display-sm font-medium" aria-hidden>
        {initial}
      </span>
    </div>
  );
}

function RarityBadge({
  rarity,
  className = '',
  size = 'md',
}: {
  rarity: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const cls = {
    common: 'bg-rarity-common/40 text-on-surface-variant',
    uncommon: 'bg-rarity-uncommon/20 text-rarity-uncommon',
    rare: 'bg-rarity-rare/20 text-rarity-rare',
    epic: 'bg-rarity-epic text-on-primary-container',
    legendary: 'text-on-tertiary-container motion-safe:animate-shimmer',
    special: 'bg-rarity-special/15 text-rarity-special',
  }[rarity] ?? 'bg-rarity-common/40 text-on-surface-variant';

  return (
    <span
      className={[
        'inline-flex items-center rounded-full font-medium uppercase',
        size === 'sm' ? 'h-5 px-1.5 text-label-sm' : 'h-6 px-2 text-label-md',
        rarity === 'legendary' ? 'bg-rarity-legendary' : cls,
        className,
      ].join(' ')}
      style={
        rarity === 'legendary'
          ? { backgroundSize: '200% 100%' }
          : undefined
      }
    >
      {rarity}
    </span>
  );
}

function QuantityBadge({
  quantity,
  className = '',
}: {
  quantity: number;
  className?: string;
}) {
  if (quantity === 0) {
    return (
      <span
        className={[
          'inline-flex h-6 items-center gap-1 rounded-full border border-outline-variant bg-surface px-2 text-label-md text-on-surface-variant',
          className,
        ].join(' ')}
      >
        <Icon name="close" size={12} />
        Falta
      </span>
    );
  }
  if (quantity > 1) {
    return (
      <span
        className={[
          'inline-flex h-6 items-center gap-1 rounded-full bg-tertiary-container px-2 text-label-md text-on-tertiary-container',
          className,
        ].join(' ')}
      >
        <Icon name="check" size={12} />
        ×{quantity}
      </span>
    );
  }
  return (
    <span
      className={[
        'inline-flex h-6 items-center gap-1 rounded-full bg-secondary-container px-2 text-label-md text-on-secondary-container',
        className,
      ].join(' ')}
    >
      <Icon name="check" size={12} />
      Tengo
    </span>
  );
}

function StepperButton({
  icon,
  onClick,
  disabled,
  ariaLabel,
}: {
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={[
        'group/btn relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full',
        'bg-surface-container text-on-surface',
        'transition-colors duration-motion-short2 ease-standard',
        'hover:bg-surface-container-high active:bg-surface-container-highest',
        'disabled:opacity-40 disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      ].join(' ')}
    >
      {icon}
      <span aria-hidden className="state-layer" />
    </button>
  );
}
