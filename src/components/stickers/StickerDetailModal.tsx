import { useTranslation } from 'react-i18next';
import type { StoredSticker } from '@/types/collection';
import { Modal } from '@/components/ui/Modal';

interface StickerDetailModalProps {
  sticker: StoredSticker | null;
  quantity: number;
  onClose: () => void;
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
 * Detail sheet for a sticker. For enriched player stickers it surfaces the bio
 * carried in `meta` (club, position, age, height, nationality, links). Falls
 * back gracefully for non-player stickers with no metadata.
 */
export function StickerDetailModal({
  sticker,
  quantity,
  onClose,
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
    <Modal open={!!sticker} onClose={onClose} title={sticker.name}>
      <div className="flex flex-col gap-4">
        {sticker.image ? (
          <img
            src={sticker.image}
            alt={sticker.name}
            className="mx-auto h-48 w-auto rounded-xl object-cover"
          />
        ) : null}

        <div className="flex items-center gap-2">
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {sticker.code}
          </span>
          {flag ? <span className="text-xl">{flag}</span> : null}
          <span className="text-xs text-slate-500">
            {t('stickers.quantity', { count: quantity })}
          </span>
        </div>

        {rows.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-xs uppercase text-slate-400">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-slate-500">{t('detail.noData')}</p>
        )}

        {wiki ? (
          <a
            href={wiki}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {t('detail.wikipedia')} ↗
          </a>
        ) : null}
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
