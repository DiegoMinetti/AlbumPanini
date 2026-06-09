import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ui/Icon';

interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Etiqueta accesible adicional. */
  ariaLabel?: string;
}

/**
 * Search bar M3 — variante docked (icono leading + clear trailing). Pensada
 * para uso dentro del FilterBar y como sticky top en la sección de stickers.
 */
export function SearchBar({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: SearchBarProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      className="group flex h-12 w-full items-center gap-2 overflow-hidden rounded-full
        bg-surface-container-high px-4 transition-colors duration-motion-short2 ease-standard
        focus-within:bg-surface-container-highest focus-within:shadow-elev-1"
    >
      <Icon name="search" size={20} className="text-on-surface-variant" />
      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        aria-label={ariaLabel ?? t('common.search')}
        placeholder={placeholder ?? t('common.search')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full bg-transparent text-sm text-on-surface
          placeholder:text-on-surface-variant focus:outline-none"
      />
      {value ? (
        <button
          type="button"
          aria-label={t('common.clear')}
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          className="has-state-layer relative grid h-7 w-7 place-items-center
            overflow-hidden rounded-full text-on-surface-variant
            transition-colors hover:bg-surface-container-highest
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="close" size={16} />
          <span aria-hidden className="state-layer" />
        </button>
      ) : null}
    </div>
  );
}
