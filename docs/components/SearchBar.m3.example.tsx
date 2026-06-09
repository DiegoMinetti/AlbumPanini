import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ui/Icon';

interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Cuando es true, la search bar se expande al focus (push content). */
  expandable?: boolean;
}

/**
 * Search bar M3 — estilo "docked" con icono leading, clear trailing y label
 * persistente como apoyo visual. Pensada para uso sticky en el top de la
 * sección de stickers.
 */
export function SearchBar({
  value,
  onChange,
  placeholder,
  expandable = false,
}: SearchBarProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);

  return (
    <div
      className={[
        'sticky top-14 z-20 flex items-center gap-2 px-4 py-2 transition-all duration-motion-medium2 ease-emphasized',
        expandable && focused ? 'bg-surface-container' : 'bg-transparent',
      ].join(' ')}
    >
      <div
        className={[
          'group relative flex h-12 flex-1 items-center gap-2 overflow-hidden rounded-full px-4',
          'bg-surface-container-high transition-colors duration-motion-short3 ease-standard',
          'focus-within:bg-surface-container-highest focus-within:shadow-elev-1',
        ].join(' ')}
      >
        <Icon name="search" size={20} className="text-on-surface-variant" />

        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          aria-label={t('common.search')}
          placeholder={placeholder ?? t('common.search')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="h-full w-full bg-transparent text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none"
        />

        {value && (
          <button
            type="button"
            aria-label={t('common.clear')}
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            className="grid h-8 w-8 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container-highest"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
