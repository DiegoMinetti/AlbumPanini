import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/ui/Icon';

interface RailItem {
  to: string;
  labelKey: string;
  icon: IconName;
  end?: boolean;
}

/**
 * M3 NavigationRail — variante lateral (tablet/desktop ≥ md).
 *
 * Aparece en pantallas anchas en lugar del BottomNav (NavigationBar).
 * Renderiza un rail vertical a la izquierda con:
 *  - Ítems centrados con icono arriba y label abajo (estado activo = pastilla).
 *  - FAB anclado arriba del rail (M3 spec).
 *  - Menú FAB opcional al final del rail (futuro).
 *
 * La translucidez la aporta `nav-rail-surface` (backdrop-blur + surface-container).
 */
const RAIL_ITEMS: RailItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: 'home', end: true },
  { to: '/stickers', labelKey: 'nav.stickers', icon: 'grid_view' },
  { to: '/tournament', labelKey: 'nav.tournament', icon: 'trophy' },
  { to: '/exchange', labelKey: 'nav.exchange', icon: 'swap_horiz' },
  { to: '/donations', labelKey: 'nav.donations', icon: 'volunteer_activism' },
];

interface NavigationRailProps {
  onDonateClick?: () => void;
}

export function NavigationRail({ onDonateClick }: NavigationRailProps) {
  const { t } = useTranslation();
  const [donationBlink, setDonationBlink] = useState(false);
  const nextBlinkTimeoutRef = useRef<number | null>(null);
  const stopBlinkTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const scheduleRandomBlink = () => {
      const nextInMs = 8000 + Math.floor(Math.random() * 14000);
      nextBlinkTimeoutRef.current = window.setTimeout(() => {
        setDonationBlink(true);
        stopBlinkTimeoutRef.current = window.setTimeout(() => {
          setDonationBlink(false);
          scheduleRandomBlink();
        }, 1400);
      }, nextInMs);
    };

    scheduleRandomBlink();
    return () => {
      if (nextBlinkTimeoutRef.current !== null) {
        window.clearTimeout(nextBlinkTimeoutRef.current);
      }
      if (stopBlinkTimeoutRef.current !== null) {
        window.clearTimeout(stopBlinkTimeoutRef.current);
      }
    };
  }, []);

  return (
    <nav
      className="nav-rail-surface fixed inset-y-0 left-0 z-40 hidden w-20 flex-col items-center
        border-r border-outline-variant/30 pt-safe-top md:flex
        pb-safe-bottom"
      aria-label="Primary"
    >
      {/*
        FAB del rail (M3 spec — el FAB se ancla arriba del NavigationRail,
        como una pieza independiente de la navegación).
      */}
      <button
        type="button"
        onClick={onDonateClick}
        className={`has-state-layer relative mt-3 grid h-14 w-14 place-items-center
          overflow-hidden rounded-2xl bg-primary-container
          text-on-primary-container shadow-elev-1 transition-all
          duration-motion-short2 ease-standard
          hover:shadow-elev-2
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
          ${donationBlink ? 'donation-nav-blink' : ''}`}
        aria-label={t('nav.donations')}
        title={t('nav.donations')}
      >
        <Icon name="volunteer_activism" size={24} />
        <span aria-hidden className="state-layer" />
      </button>

      <ul className="mt-4 flex w-full flex-1 flex-col items-stretch gap-1 px-3">
        {RAIL_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `has-state-layer group relative flex h-14 w-full flex-col
                  items-center justify-center gap-0.5 overflow-hidden rounded-2xl
                  transition-all duration-motion-short2 ease-standard
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isActive
                      ? 'nav-item-active-pill font-semibold'
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`
              }
            >
              <Icon name={item.icon} size={24} />
              <span className="text-label-sm leading-none">
                {t(item.labelKey)}
              </span>
              <span aria-hidden className="state-layer" />
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
