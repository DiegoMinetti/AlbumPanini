import { createHashRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { StickersPage } from '@/pages/StickersPage';
import { TournamentPage } from '@/pages/TournamentPage';
import { StatisticsPage } from '@/pages/StatisticsPage';
import { ExchangePage } from '@/pages/ExchangePage';
import { ScanPage } from '@/pages/ScanPage';
import { CollectionsPage } from '@/pages/CollectionsPage';
import { BackupPage } from '@/pages/BackupPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * Hash-based routing is used so the app works on GitHub Pages (and offline,
 * deep-linked, hard-refreshed) without any server-side rewrite or 404 issues.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'stickers', element: <StickersPage /> },
      { path: 'tournament', element: <TournamentPage /> },
      { path: 'stats', element: <StatisticsPage /> },
      { path: 'exchange', element: <ExchangePage /> },
      { path: 'scan', element: <ScanPage /> },
      { path: 'collections', element: <CollectionsPage /> },
      { path: 'backup', element: <BackupPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
