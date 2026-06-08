import { useTranslation } from 'react-i18next';
import type { StoredSticker } from '@/types/collection';
import {
  INTRO_GROUP,
  WFC_GROUP,
  SPECIAL_GROUP,
  ownedInGroup,
  sectionTotals,
  type StickerGroup,
  type StickerSection,
} from '@/services/filterService';
import { Icon } from '@/components/ui/Icon';
import { StickerGrid } from './StickerGrid';

interface StickerGroupsProps {
  sections: StickerSection[];
  inventory: Map<string, number>;
  teamColorsById?: Map<
    string,
    { primaryColor?: string; secondaryColor?: string }
  >;
  view: 'grid' | 'list';
  showImages: boolean;
  editable: boolean;
  /** Keys of currently collapsed sections/countries. */
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  /** When true, everything is shown regardless of `collapsed` (e.g. search). */
  forceExpand?: boolean;
  onIncrement: (stickerId: string) => void;
  onDecrement: (stickerId: string) => void;
  onSelect?: (sticker: StoredSticker) => void;
}

/** Collapsible header bar shared by sections and country sub-groups. */
function GroupHeader({
  open,
  onToggle,
  flag,
  label,
  owned,
  total,
  nested,
}: {
  open: boolean;
  onToggle: () => void;
  flag?: string;
  label: string;
  owned: number;
  total: number;
  nested?: boolean;
}) {
  const complete = total > 0 && owned === total;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`flex w-full items-center gap-3 text-left ${
        nested ? 'px-3 py-2' : 'px-4 py-3'
      }`}
    >
      <Icon
        name="chevron_right"
        size={20}
        className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
      />
      {flag ? <span className="text-xl leading-none">{flag}</span> : null}
      <span
        className={`min-w-0 flex-1 truncate ${nested ? 'font-medium' : 'font-semibold'}`}
      >
        {label}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
          complete
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
        }`}
      >
        {owned}/{total}
      </span>
    </button>
  );
}

export function StickerGroups({
  sections,
  inventory,
  teamColorsById,
  view,
  showImages,
  editable,
  collapsed,
  onToggle,
  forceExpand = false,
  onIncrement,
  onDecrement,
  onSelect,
}: StickerGroupsProps) {
  const { t } = useTranslation();

  /** Localized header for a top-level section. */
  const sectionLabel = (section: StickerSection): string => {
    if (section.key.startsWith('tgroup-'))
      return t('stickers.groups.group', { id: section.label });
    if (section.label) return section.label;
    switch (section.key) {
      case INTRO_GROUP:
        return t('stickers.groups.intro');
      case WFC_GROUP:
        return t('stickers.groups.wfc');
      case SPECIAL_GROUP:
      default:
        return t('stickers.groups.special');
    }
  };

  const grid = (stickers: StoredSticker[]) => (
    <StickerGrid
      stickers={stickers}
      inventory={inventory}
      teamColorsById={teamColorsById}
      view={view}
      showImages={showImages}
      editable={editable}
      onIncrement={onIncrement}
      onDecrement={onDecrement}
      onSelect={onSelect}
    />
  );

  const renderCountry = (country: StickerGroup) => {
    const open = forceExpand || !collapsed.has(country.key);
    const owned = ownedInGroup(country, inventory);
    return (
      <section
        key={country.key}
        className="overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-800/40 dark:ring-slate-700"
      >
        <GroupHeader
          open={open}
          onToggle={() => onToggle(country.key)}
          flag={country.flag}
          label={country.label ?? country.key}
          owned={owned}
          total={country.stickers.length}
          nested
        />
        {open ? (
          <div className="px-3 pb-3">{grid(country.stickers)}</div>
        ) : null}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-3" data-testid="sticker-groups">
      {sections.map((section) => {
        const open = forceExpand || !collapsed.has(section.key);
        const { owned, total } = sectionTotals(section, inventory);
        const hasCountries = section.countries.length > 0;

        return (
          <section
            key={section.key}
            className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
          >
            <GroupHeader
              open={open}
              onToggle={() => onToggle(section.key)}
              flag={section.flag}
              label={sectionLabel(section)}
              owned={owned}
              total={total}
            />
            {open ? (
              <div className="px-3 pb-3">
                {hasCountries ? (
                  <div className="flex flex-col gap-2">
                    {section.countries.map(renderCountry)}
                  </div>
                ) : (
                  grid(section.stickers)
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
