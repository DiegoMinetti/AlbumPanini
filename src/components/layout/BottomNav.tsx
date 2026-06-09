import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/ui/Icon';

interface NavItem {
  to: string;
  labelKey: string;
  icon: IconName;
  end?: boolean;
}

const ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: 'home', end: true },
  { to: '/stickers', labelKey: 'nav.stickers', icon: 'grid_view' },
  { to: '/tournament', labelKey: 'nav.tournament', icon: 'trophy' },
  { to: '/exchange', labelKey: 'nav.exchange', icon: 'swap_horiz' },
  { to: '/donations', labelKey: 'nav.donations', icon: 'volunteer_activism' },
];

/**
 * M3 NavigationBar — barra inferior translúcida (móvil < md).
 *
 * Patrón M3 canónico:
 *  - Altura fija 80dp con safe-area-inset-bottom.
 *  - Surface-container translúcida + backdrop-blur (M3 "translucent surface").
 *  - Cada item: 64dp contenedor con icono arriba y label abajo.
 *  - **Indicador flotante (M3 SegmentedButton pattern):** un único pill
 *    `.nav-segmented-indicator` se desliza con `transform: translateX` +
 *    `width` entre los items activos, idéntico al efecto burbuja de
 *    `FilterChips` (Todas / Tengo / Faltan / Repetidas).
 *  - State layer al 8%/12% (hover/press).
 *  - Indicador de blink aleatorio en el ítem de Donaciones.
 *
 * En pantallas anchas (md+) este componente NO se renderiza — el `NavigationRail`
 * toma el control. Esto se decide con clases responsive (`md:hidden`).
 */
export function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const listRef = useRef<HTMLUListElement | null>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number }>({
    x: 0,
    w: 0,
  });
  const [donationBlink, setDonationBlink] = useState(false);
  const nextBlinkTimeoutRef = useRef<number | null>(null);
  const stopBlinkTimeoutRef = useRef<number | null>(null);

  // Encuentra qué item está activo según la ruta actual.
  // Para '/' se respeta `end` para no matchear otras rutas que empiecen con '/'.
  const activeTo = ITEMS.find((item) => {
    if (item.end) return location.pathname === item.to;
    return (
      location.pathname === item.to ||
      location.pathname.startsWith(item.to + '/')
    );
  })?.to;

  // Recalcular posición/tamaño del indicator al montar y al cambiar la selección
  // o al cambiar el tamaño de la ventana (rotación, resize).
  useLayoutEffect(() => {
    const root = listRef.current;
    if (!root || !activeTo) return;
    const active = root.querySelector<HTMLElement>(
      `[data-nav-item="${activeTo}"]`
    );
    if (!active) return;
    const rootRect = root.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    setIndicator({ x: aRect.left - rootRect.left, w: aRect.width });
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
      setIndicator({ x: aRect.left - rootRect.left, w: aRect.width });
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
      className="nav-bar-surface fixed inset-x-0 bottom-0 z-40 md:hidden
        border-t border-outline-variant/30 pb-safe-bottom"
      aria-label="Primary"
    >
      <ul
        ref={listRef}
        className="relative mx-auto flex h-[64px] w-full max-w-2xl items-stretch px-2
          pt-1.5"
      >
        <span
          aria-hidden
          className="nav-segmented-indicator"
          style={{
            transform: `translateX(${indicator.x}px)`,
            width: `${indicator.w}px`,
          }}
        />
        {ITEMS.map((item) => {
          const isActive = item.to === activeTo;
          return (
            <li key={item.to} className="flex flex-1 items-stretch">
              <NavLink
                to={item.to}
                end={item.end}
                data-nav-item={item.to}
                className={() =>
                  `has-state-layer group relative z-10 flex flex-1 flex-col items-center
                    justify-center gap-0.5 overflow-hidden rounded-2xl
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
