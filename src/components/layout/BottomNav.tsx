import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
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
  { to: '/scan', labelKey: 'nav.scan', icon: 'photo_camera' },
  { to: '/exchange', labelKey: 'nav.exchange', icon: 'swap_horiz' },
  { to: '/stats', labelKey: 'nav.statistics', icon: 'bar_chart' },
  { to: '/donations', labelKey: 'nav.donations', icon: 'volunteer_activism' },
];

export function BottomNav() {
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 backdrop-blur pb-safe-bottom dark:border-slate-800 dark:bg-slate-950/90"
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
                } ${
                  item.to === '/donations' && donationBlink
                    ? 'donation-nav-blink'
                    : ''
                }`
              }
            >
              <Icon name={item.icon} size={24} />
              <span>{t(item.labelKey)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
