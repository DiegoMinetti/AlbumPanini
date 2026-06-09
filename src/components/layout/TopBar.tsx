import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useActiveCollection } from '@/hooks';
import { Icon } from '@/components/ui/Icon';

const TITLE_BY_PATH: Record<string, string> = {
  '/': 'nav.dashboard',
  '/stickers': 'nav.stickers',
  '/tournament': 'nav.tournament',
  '/stats': 'nav.statistics',
  '/exchange': 'nav.exchange',
  '/scan': 'nav.scan',
  '/collections': 'nav.collections',
  '/backup': 'nav.backup',
  '/settings': 'nav.settings',
  '/donations': 'nav.donations',
};

/**
 * Publica la altura real del TopBar (incluyendo safe-area-top) en la CSS
 * custom property `--app-topbar-h` del `<html>`. Los toolbars internos que
 * necesiten quedar inmediatamente debajo del TopBar usan
 * `top: var(--app-topbar-h, 0px)` en su posición sticky.
 */
function useTopbarHeightVar(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty(
        '--app-topbar-h',
        `${Math.round(h)}px`
      );
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener('orientationchange', apply);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', apply);
    };
  }, [ref]);
}

/**
 * M3 CenterAlignedTopAppBar (small / 64dp) — patrón canónico M3:
 *  - Surface translúcida con `backdrop-blur` (efecto "frosted glass").
 *  - Al scrollear el contenido debajo, suma un *surface tint* sutil
 *    (`var(--md-sys-color-surface-tint-translucent)`) y una sombra 1dp.
 *  - Título centrado o alineado al inicio según el ancho (responsive).
 *  - Safe-area-top respetado.
 *  - Acciones: icon-buttons M3 (40dp) con state layer.
 */
export function TopBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { active } = useActiveCollection();
  const headerRef = useRef<HTMLElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  useTopbarHeightVar(headerRef);

  const titleKey = TITLE_BY_PATH[pathname] ?? 'app.name';

  // Detecta scroll para sumar surface-tint + shadow.
  useEffect(() => {
    const onScroll = () => {
      // Threshold de 4px para evitar flickering en rubber-band iOS.
      setScrolled(window.scrollY > 4);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-40 pt-safe-top transition-shadow
        duration-motion-short3 ease-standard app-bar-surface ${
          scrolled ? 'app-bar-surface--scrolled' : ''
        }`}
    >
      <div
        className="mx-auto flex h-[64px] w-full max-w-2xl items-center
          justify-between gap-2 px-3 md:px-4"
      >
        {/* Leading — title + subtitle (M3 center-aligned app bar). */}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-title-lg font-medium text-on-surface">
            {t(titleKey)}
          </h1>
          {active ? (
            <p className="truncate text-body-sm text-on-surface-variant">
              {active.name}
            </p>
          ) : null}
        </div>

        {/* Trailing — M3 icon buttons. */}
        <nav className="flex shrink-0 items-center gap-0.5">
          <Link
            to="/backup"
            className="has-state-layer relative grid h-10 w-10 place-items-center
              overflow-hidden rounded-full text-on-surface-variant
              transition-colors duration-motion-short2 ease-standard
              hover:bg-surface-container-high
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={t('nav.backup')}
            title={t('nav.backup')}
          >
            <Icon name="save" size={22} />
            <span aria-hidden className="state-layer" />
          </Link>
          <Link
            to="/settings"
            className="has-state-layer relative grid h-10 w-10 place-items-center
              overflow-hidden rounded-full text-on-surface-variant
              transition-colors duration-motion-short2 ease-standard
              hover:bg-surface-container-high
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={t('nav.settings')}
            title={t('nav.settings')}
          >
            <Icon name="settings" size={22} />
            <span aria-hidden className="state-layer" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
