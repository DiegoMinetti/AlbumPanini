import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface NavItem {
  to: string;
  labelKey: string;
  icon: string;
  end?: boolean;
}

const ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: '🏠', end: true },
  { to: '/stickers', labelKey: 'nav.stickers', icon: '🗂️' },
  { to: '/scan', labelKey: 'nav.scan', icon: '📷' },
  { to: '/exchange', labelKey: 'nav.exchange', icon: '🔁' },
  { to: '/stats', labelKey: 'nav.statistics', icon: '📊' },
];

export function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav
      className="sticky bottom-0 z-40 border-t border-slate-200 bg-white/90 backdrop-blur pb-safe-bottom dark:border-slate-800 dark:bg-slate-950/90"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch">
        {ITEMS.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-tap flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <span aria-hidden="true" className="text-xl leading-none">
                {item.icon}
              </span>
              <span>{t(item.labelKey)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
