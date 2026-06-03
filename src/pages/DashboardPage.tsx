import { useTranslation } from 'react-i18next';
import { useActiveCollection } from '@/hooks';
import { useCollectionData } from '@/hooks/useCollectionData';
import { useRecentActivity } from '@/hooks/useRecentActivity';
import { useSettingsStore } from '@/stores/settingsStore';
import { StatCard } from '@/components/ui/StatCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Spinner } from '@/components/feedback/Spinner';
import { NoActiveCollection } from '@/components/collections/NoActiveCollection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatPercent, formatRelativeTime } from '@/utils/format';

export function DashboardPage() {
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const { active, loading: loadingActive } = useActiveCollection();
  const { statistics, loading } = useCollectionData(active?.id ?? null);
  const activity = useRecentActivity(active?.id ?? null, 12);

  if (loadingActive) return <Spinner />;
  if (!active) return <NoActiveCollection />;
  if (loading) return <Spinner label={t('common.loading')} />;

  const { overview, teams } = statistics;

  return (
    <div className="flex flex-col gap-5">
      <section className="card">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">
          {t('dashboard.collectionCompletion')}
        </h2>
        <div className="mb-1 text-3xl font-extrabold tabular-nums">
          {formatPercent(overview.completion)}
        </div>
        <ProgressBar value={overview.completion} showPercent={false} />
        <p className="mt-2 text-xs text-slate-500">
          {overview.owned}/{overview.total} · {t('common.missing')}{' '}
          {overview.missing}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <StatCard label={t('common.total')} value={overview.total} />
        <StatCard
          label={t('common.owned')}
          value={overview.owned}
          accent="success"
        />
        <StatCard
          label={t('common.missing')}
          value={overview.missing}
          accent="warning"
        />
        <StatCard
          label={t('common.duplicates')}
          value={overview.duplicates}
          accent="danger"
        />
      </section>

      {teams.length > 0 ? (
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">
            {t('dashboard.teamCompletion')}
          </h2>
          <ul className="flex flex-col gap-3">
            {teams.slice(0, 6).map((team) => (
              <li key={team.teamId}>
                <ProgressBar value={team.completion} label={team.teamName} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">
          {t('dashboard.recentActivity')}
        </h2>
        {activity.length === 0 ? (
          <EmptyState title={t('dashboard.noActivity')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {activity.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-medium">
                  {t(`toast.${entry.kind === 'add' ? 'added' : entry.kind === 'remove' ? 'removed' : 'saved'}`)}
                  {entry.delta ? ` (${entry.delta > 0 ? '+' : ''}${entry.delta})` : ''}
                </span>
                <span className="text-xs text-slate-400">
                  {formatRelativeTime(entry.timestamp, language)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
