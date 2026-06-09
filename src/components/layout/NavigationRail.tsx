import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
 *  - Ítems centrados con icono arriba y label abajo.
 *  - **Indicador flotante (M3 SegmentedButton pattern):** un único pill
 *    `.nav-segmented-indicator--vertical` se desliza con `transform: translateY`
 *    + `width` entre los items activos, idéntico al efecto burbuja de
 *    `FilterChips` (Todas / Tengo / Faltan / Repetidas).
 *  - Indicador de blink aleatorio en el ítem de Donaciones (último ítem).
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

export function NavigationRail() {
  const { t } = useTranslation();
  const location = useLocation();
  const listRef = useRef<HTMLUListElement | null>(null);
  const [indicator, setIndicator] = useState<{ y: number; w: number }>({
    y: 0,
    w: 0,
  });
  const [donationBlink, setDonationBlink] = useState(false);
  const nextBlinkTimeoutRef = useRef<number | null>(null);
  const stopBlinkTimeoutRef = useRef<number | null>(null);

  // Encuentra qué item está activo según la ruta actual.
  const activeTo = RAIL_ITEMS.find((item) => {
    if (item.end) return location.pathname === item.to;
    return (
      location.pathname === item.to ||
      location.pathname.startsWith(item.to + '/')
    );
  })?.to;

  // Recalcular posición/tamaño del indicator al cambiar la selección.
  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root || !activeTo) return;
    const active = root.querySelector<HTMLElement>(
      `[data-nav-item="${activeTo}"]`
    );
    if (!active) return;
    const rootRect = root.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    setIndicator({ y: aRect.top - rootRect.top, w: aRect.width });
  }, [activeTo]);

  useEffect(() => {
    const onResize = () => {
      const root = listRef.current;
      if (!root || !activeTo) return;
      const active = root.querySelector<HTMLElement>(
        `[data-nav-item="${activeTo}"]`
      );
      if (!active) return;
      const rootRect = root.getBoundingClientRect();
      const aRect = active.getBoundingClientRect();
      setIndicator({ y: aRect.top - rootRect.top, w: aRect.width });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeTo]);

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
      <ul
        ref={listRef}
        className="relative mt-3 flex w-full flex-1 flex-col items-stretch gap-1 px-3"
      >
        <span
          aria-hidden
          className="nav-segmented-indicator--vertical"
          style={{
            transform: `translateY(${indicator.y}px)`,
            width: `${indicator.w}px`,
          }}
        />
        {RAIL_ITEMS.map((item) => {
          const isActive = item.to === activeTo;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                data-nav-item={item.to}
                className={() =>
                  `has-state-layer group relative z-10 flex h-14 w-full flex-col
                    items-center justify-center gap-0.5 overflow-hidden rounded-2xl
                    transition-colors duration-motion-short2 ease-standard
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      isActive
                        ? 'text-on-secondary-container font-semibold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    } ${
                      item.to === '/donations' && donationBlink
                        ? 'donation-nav-blink'
                        : ''
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
          );
        })}
      </ul>
    </nav>
  );
}
