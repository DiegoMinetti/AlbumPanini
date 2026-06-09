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

/** Collapsible header bar shared by sections and country sub-groups (M3). */
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
  const progress = total > 0 ? (owned / total) * 100 : 0;
  return (
    <div
      className={
        nested
          ? 'px-3 py-1 transition-shadow duration-motion-short2'
          : 'px-4 py-2 transition-shadow duration-motion-short2'
      }
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left
          rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Icon
          name="chevron_right"
          size={20}
          className={`shrink-0 text-on-surface-variant transition-transform duration-motion-medium2 ease-emphasized ${
            open ? 'rotate-90' : ''
          }`}
        />
        {flag ? <span className="text-xl leading-none">{flag}</span> : null}
        <span
          className={`min-w-0 flex-1 truncate ${
            nested ? 'text-sm font-medium' : 'text-base font-semibold'
          } text-on-surface`}
        >
          {label}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
            complete
              ? 'bg-secondary-container text-on-secondary-container'
              : 'bg-surface-container text-on-surface-variant'
          }`}
        >
          {owned}/{total}
        </span>
      </button>
      {/* M3 linear progress */}
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-surface-container-high"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-motion-medium3 ease-emphasized"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
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
        className="overflow-hidden rounded-md bg-surface-container-low"
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
            className="overflow-hidden rounded-md bg-surface-container-low shadow-elev-1"
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
