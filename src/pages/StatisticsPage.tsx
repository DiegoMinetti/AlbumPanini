import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useActiveCollection } from '@/hooks';
import { useCollectionData } from '@/hooks/useCollectionData';
import { Spinner } from '@/components/feedback/Spinner';
import { NoActiveCollection } from '@/components/collections/NoActiveCollection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { CollectionHeatmap } from '@/components/stats/CollectionHeatmap';
import { formatPercent } from '@/utils/format';

const PIE_COLORS = ['#16a34a', '#e2e8f0'];

export function StatisticsPage() {
  const { t } = useTranslation();
  const { active, loading: loadingActive } = useActiveCollection();
  const { stickers, inventory, statistics, loading } = useCollectionData(
    active?.id ?? null
  );

  if (loadingActive) return <Spinner />;
  if (!active) return <NoActiveCollection />;
  if (loading) return <Spinner label={t('common.loading')} />;

  const {
    overview,
    teams,
    categories,
    mostRepeated,
    completedTeams,
    nearCompleteTeams,
  } = statistics;

  const pieData = [
    { name: t('common.owned'), value: overview.owned },
    { name: t('common.missing'), value: overview.missing },
  ];

  const teamChart = teams.slice(0, 12).map((tm) => ({
    name: tm.teamName,
    pct: Math.round(tm.completion * 100),
  }));

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-4">
        <div className="card flex flex-col items-center">
          <h2 className="mb-1 text-sm font-semibold text-slate-500">
            {t('dashboard.completion')}
          </h2>
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  innerRadius={36}
                  outerRadius={56}
                  paddingAngle={2}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {formatPercent(overview.completion)}
          </p>
        </div>

        <div className="card flex flex-col justify-center gap-2 text-sm">
          <Row label={t('common.total')} value={overview.total} />
          <Row label={t('common.owned')} value={overview.owned} />
          <Row label={t('common.missing')} value={overview.missing} />
          <Row label={t('common.duplicates')} value={overview.duplicates} />
          <Row
            label={t('exchange.iCanGive')}
            value={overview.distinctDuplicates}
          />
        </div>
      </section>

      {teamChart.length > 0 ? (
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">
            {t('dashboard.teamCompletion')}
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamChart} layout="vertical" margin={{ left: 8 }}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="pct" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      {categories.length > 1 ? (
        <section className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">
            {t('stickers.category')}
          </h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categories.map((c) => ({
                  name: c.category,
                  pct: Math.round(c.completion * 100),
                }))}
              >
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} width={32} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="pct" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">
          {t('exchange.iCanGive')} · {t('common.duplicates')}
        </h2>
        {mostRepeated.length === 0 ? (
          <EmptyState title={t('exchange.noDuplicates')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {mostRepeated.map((s) => (
              <li key={s.stickerId} className="flex justify-between text-sm">
                <span>
                  <span className="font-mono font-semibold">{s.code}</span>{' '}
                  {s.name}
                </span>
                <span className="font-bold tabular-nums text-amber-600">
                  ×{s.quantity}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(completedTeams.length > 0 || nearCompleteTeams.length > 0) && (
        <section className="card grid grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="mb-2 font-semibold text-emerald-600">
              {t('common.owned')} ✓
            </h3>
            <ul className="flex flex-col gap-1">
              {completedTeams.map((tm) => (
                <li key={tm.teamId}>{tm.teamName}</li>
              ))}
              {completedTeams.length === 0 ? (
                <li className="text-slate-400">—</li>
              ) : null}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-amber-600">≥ 80%</h3>
            <ul className="flex flex-col gap-1">
              {nearCompleteTeams.map((tm) => (
                <li key={tm.teamId}>
                  {tm.teamName} · {formatPercent(tm.completion)}
                </li>
              ))}
              {nearCompleteTeams.length === 0 ? (
                <li className="text-slate-400">—</li>
              ) : null}
            </ul>
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">Heatmap</h2>
        <CollectionHeatmap stickers={stickers} inventory={inventory} />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}
