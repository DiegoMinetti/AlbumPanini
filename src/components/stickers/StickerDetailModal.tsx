import { useTranslation } from 'react-i18next';
import type { StoredSticker } from '@/types/collection';
import { Modal } from '@/components/ui/Modal';
import { QuantityStepper } from './QuantityStepper';
import { haptics } from '@/utils/haptics';
import { toast } from '@/stores/uiStore';

interface StickerDetailModalProps {
  sticker: StoredSticker | null;
  quantity: number;
  onClose: () => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
}

/** Reads a string field from the generic `meta` bag, if present. */
function metaStr(
  meta: Record<string, unknown> | undefined,
  key: string
): string | null {
  const v = meta?.[key];
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return null;
}

/**
 * Detail sheet for a sticker (M3 bottom sheet). Shows bio data from `meta`,
 * the inventory stepper, and shortcut actions.
 */
export function StickerDetailModal({
  sticker,
  quantity,
  onClose,
  onIncrement,
  onDecrement,
}: StickerDetailModalProps) {
  const { t } = useTranslation();
  if (!sticker) return null;

  const meta = sticker.meta as Record<string, unknown> | undefined;
  const wiki = metaStr(meta, 'wikipediaUrl');
  const flag = metaStr(meta, 'flagEmoji');

  const allRows: Array<[string, string | null]> = [
    [t('detail.position'), metaStr(meta, 'position')],
    [t('detail.club'), metaStr(meta, 'club')],
    [t('detail.nationality'), metaStr(meta, 'nationality')],
    [t('detail.age'), metaStr(meta, 'age')],
    [t('detail.birthDate'), metaStr(meta, 'birthDate')],
    [t('detail.birthPlace'), metaStr(meta, 'birthPlace')],
    [t('detail.height'), metaWithUnit(meta, 'heightCm', ' cm')],
    [t('detail.weight'), metaWithUnit(meta, 'weightKg', ' kg')],
    [t('detail.shirtNumber'), metaStr(meta, 'shirtNumber')],
    [t('detail.preferredFoot'), metaStr(meta, 'preferredFoot')],
  ];
  const rows = allRows.filter(([, v]) => v !== null);

  return (
    <Modal
      open={!!sticker}
      onClose={onClose}
      title={sticker.name}
      subtitle={
        <div className="flex items-center gap-2 text-on-surface-variant">
          <span className="rounded bg-surface-container px-1.5 py-0.5 text-xs font-bold uppercase">
            {sticker.code}
          </span>
          {flag ? <span className="text-lg">{flag}</span> : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {sticker.image ? (
          <img
            src={sticker.image}
            alt={sticker.name}
            className="mx-auto h-48 w-auto rounded-md object-cover"
          />
        ) : null}

        {/* Inventario */}
        <section
          className="flex items-center justify-between rounded-md bg-surface-container-low p-3"
          aria-label="inventory"
        >
          <div>
            <p className="text-xs uppercase tracking-wide text-on-surface-variant">
              Cantidad
            </p>
            <p className="text-2xl font-semibold tabular-nums">{quantity}</p>
          </div>
          <QuantityStepper
            quantity={quantity}
            size="md"
            onIncrement={() => {
              haptics.tick();
              onIncrement(sticker.id);
            }}
            onDecrement={() => {
              haptics.tick();
              onDecrement(sticker.id);
            }}
          />
        </section>

        {rows.length > 0 ? (
          <section
            className="rounded-md bg-surface-container-low p-3"
            aria-label="details"
          >
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              Datos
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-xs uppercase text-on-surface-variant">
                    {label}
                  </dt>
                  <dd className="font-medium text-on-surface">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          <p className="text-sm text-on-surface-variant">
            {t('detail.noData')}
          </p>
        )}

        {/* Acciones */}
        <section
          className="flex flex-wrap items-center gap-2"
          aria-label="actions"
        >
          <button
            type="button"
            className="btn-tonal"
            onClick={() => {
              onIncrement(sticker.id);
              haptics.success();
              toast.success(t('toast.added'));
            }}
          >
            {t('common.owned')}
          </button>
          <button
            type="button"
            className="btn-outlined"
            onClick={() => {
              haptics.tick();
              /* Llamamos al reset: si quantity actual es 0, no hay nada que hacer */
              if (quantity > 0) onDecrement(sticker.id);
              toast.info(t('common.remove'));
            }}
          >
            {t('stickers.filter.missing')}
          </button>
          {wiki ? (
            <a
              href={wiki}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
            >
              {t('detail.wikipedia')} ↗
            </a>
          ) : null}
        </section>
      </div>
    </Modal>
  );
}

function metaWithUnit(
  meta: Record<string, unknown> | undefined,
  key: string,
  unit: string
): string | null {
  const v = meta?.[key];
  if (typeof v === 'number') return `${v}${unit}`;
  return null;
}
