import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useActiveCollection } from '@/hooks';

const TITLE_BY_PATH: Record<string, string> = {
  '/': 'nav.dashboard',
  '/stickers': 'nav.stickers',
  '/stats': 'nav.statistics',
  '/exchange': 'nav.exchange',
  '/scan': 'nav.scan',
  '/collections': 'nav.collections',
  '/backup': 'nav.backup',
  '/settings': 'nav.settings',
};

export function TopBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { active } = useActiveCollection();

  const titleKey = TITLE_BY_PATH[pathname] ?? 'app.name';

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur pt-safe-top dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">{t(titleKey)}</h1>
          {active ? (
            <p className="truncate text-xs text-slate-500">{active.name}</p>
          ) : null}
        </div>
        <nav className="flex items-center gap-1">
          <Link
            to="/collections"
            className="btn-ghost px-2"
            aria-label={t('nav.collections')}
            title={t('nav.collections')}
          >
            <span aria-hidden="true" className="text-xl">
              🗃️
            </span>
          </Link>
          <Link
            to="/backup"
            className="btn-ghost px-2"
            aria-label={t('nav.backup')}
            title={t('nav.backup')}
          >
            <span aria-hidden="true" className="text-xl">
              💾
            </span>
          </Link>
          <Link
            to="/settings"
            className="btn-ghost px-2"
            aria-label={t('nav.settings')}
            title={t('nav.settings')}
          >
            <span aria-hidden="true" className="text-xl">
              ⚙️
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
