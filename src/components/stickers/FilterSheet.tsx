import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredTeam } from '@/types/collection';
import type { StickerFilter } from '@/services/filterService';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  filter: StickerFilter;
  onChange: (next: StickerFilter) => void;
  teams: StoredTeam[];
  categories: string[];
  rarities: string[];
}

/**
 * Modal bottom sheet M3 con los filtros avanzados (equipo, categoría, rareza).
 * Reemplaza al panel inline que tenía FilterBar para liberar espacio vertical
 * y mantener la barra de filtros compacta y sticky.
 *
 * M3 patterns aplicados:
 *  - Drag handle (provisto por `Modal`).
 *  - Header con título + subtítulo (cantidad de filtros activos).
 *  - Filled text fields (M3 outlined) para los tres selects.
 *  - Footer fijo con outlined "Limpiar" + filled "Aplicar".
 *  - Atajo de teclado: Enter en el sheet lo cierra (M3 expected behavior).
 */
export function FilterSheet({
  open,
  onClose,
  filter,
  onChange,
  teams,
  categories,
  rarities,
}: FilterSheetProps) {
  const { t } = useTranslation();
  const teamSelectId = useId();
  const categorySelectId = useId();
  const raritySelectId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const activeCount =
    (filter.teamId ? 1 : 0) +
    (filter.category ? 1 : 0) +
    (filter.rarity ? 1 : 0);

  // Si el sheet se cierra con Enter y hay cambios, los aplicamos al cerrar.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'Enter' &&
        (e.target as HTMLElement | null)?.tagName !== 'TEXTAREA'
      ) {
        // Evita enviar forms accidentales; los cambios ya están aplicados
        // onChange en cada select, así que Enter sólo cierra el sheet.
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const clearAdvanced = () =>
    onChange({ ...filter, teamId: null, category: null, rarity: null });

  const translateValue = (
    prefix: 'categoryOptions' | 'rarityOptions',
    value: string
  ) => t(`stickers.${prefix}.${value}`, { defaultValue: value });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('stickers.filters')}
      subtitle={
        <span className="flex items-center gap-2">
          <span>{t('stickers.filtersPanel.subtitle')}</span>
          {activeCount > 0 ? (
            <span
              className="grid h-5 min-w-[1.25rem] place-items-center rounded-full
                bg-primary-container px-1.5 text-label-sm
                font-semibold text-on-primary-container tabular-nums"
              aria-label={`${activeCount} active`}
            >
              {activeCount}
            </span>
          ) : null}
        </span>
      }
      footer={
        <>
          <button
            type="button"
            className="btn-outlined"
            onClick={clearAdvanced}
            disabled={activeCount === 0}
          >
            <Icon name="close" size={16} />
            {t('common.clear')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onClose}
            aria-label={t('common.apply')}
          >
            {t('common.apply')}
          </button>
        </>
      }
    >
      <div ref={sheetRef} className="flex flex-col gap-4 pb-1 pt-1">
        <FilterField
          label={t('stickers.team')}
          id={teamSelectId}
          icon={<Icon name="flag" size={18} />}
        >
          <select
            id={teamSelectId}
            className="input"
            aria-label={t('stickers.team')}
            value={filter.teamId ?? ''}
            onChange={(e) =>
              onChange({ ...filter, teamId: e.target.value || null })
            }
          >
            <option value="">{t('stickers.teamAll')}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.flag ? `${team.flag} ` : ''}
                {team.name}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField
          label={t('stickers.category')}
          id={categorySelectId}
          icon={<Icon name="category" size={18} />}
        >
          <select
            id={categorySelectId}
            className="input"
            aria-label={t('stickers.category')}
            value={filter.category ?? ''}
            onChange={(e) =>
              onChange({ ...filter, category: e.target.value || null })
            }
          >
            <option value="">{t('stickers.categoryAll')}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {translateValue('categoryOptions', cat)}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField
          label={t('stickers.rarity')}
          id={raritySelectId}
          icon={<Icon name="star" size={18} />}
        >
          <select
            id={raritySelectId}
            className="input"
            aria-label={t('stickers.rarity')}
            value={filter.rarity ?? ''}
            onChange={(e) =>
              onChange({ ...filter, rarity: e.target.value || null })
            }
          >
            <option value="">{t('stickers.rarityAll')}</option>
            {rarities.map((rarity) => (
              <option key={rarity} value={rarity}>
                {translateValue('rarityOptions', rarity)}
              </option>
            ))}
          </select>
        </FilterField>

        <p className="text-xs text-on-surface-variant">
          {t('stickers.filtersPanel.hint')}
        </p>
      </div>
    </Modal>
  );
}

interface FilterFieldProps {
  label: string;
  id: string;
  icon: ReactNode;
  children: ReactNode;
}

/** M3 outlined text field wrapper: label persistente + leading icon. */
function FilterField({ label, id, icon, children }: FilterFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-label-md font-medium text-on-surface-variant"
      >
        {label}
      </label>
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 text-on-surface-variant">
          {icon}
        </span>
        <div className="w-full [&_.input]:pl-9">{children}</div>
      </div>
    </div>
  );
}
