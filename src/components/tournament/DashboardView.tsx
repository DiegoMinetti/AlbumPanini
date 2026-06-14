import { useTranslation } from 'react-i18next';
import { useScoring } from '@/hooks/useScoring';
import type { Tournament } from '@/types/tournament';
import type { MatchScore } from '@/services/scoringService';
import type { StoredOfficialResult } from '@/types/prediction';
import { Icon } from '@/components/ui/Icon';

interface DashboardViewProps {
  tournament: Tournament;
  scenarioId: string;
  officialResults: Map<string, StoredOfficialResult>;
  isOfficialScenario: boolean;
}

/**
 * "Mi predicción vs FIFA" dashboard. Shows aggregate points, a verdict
 * breakdown, and a per-match list. Pure presentational — the parent passes
 * the tournament, scenario and the live official-results map and we drive
 * the rest from the `useScoring` hook.
 */
export function DashboardView({
  tournament,
  scenarioId,
  officialResults,
}: DashboardViewProps) {
  const { t } = useTranslation();
  const {
    score,
    loading,
    progressPct,
    exactPct,
    signPct,
    wrongPct,
    pendingPct,
    totalMatches,
    maxScore,
  } = useScoring({ tournament, scenarioId, officialResults });

  if (loading || !score) {
    return (
      <div className="text-on-surface-variant text-body-sm">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3 p-4">
        <header className="flex items-baseline justify-between">
          <h2 className="text-title-md font-bold text-on-surface">
            {t('dashboard.points')}
          </h2>
          <span className="text-label-md text-on-surface-variant">
            {t('dashboard.scenario')}: {tournament.matches.length}{' '}
            {t('dashboard.matches')}
          </span>
        </header>
        <div className="flex items-baseline gap-2">
          <span
            className="text-display-sm font-bold tabular-nums text-primary"
            data-testid="dashboard-total-points"
          >
            {score.totalPoints}
          </span>
          <span className="text-body-md text-on-surface-variant">
            / {maxScore}
          </span>
        </div>
        <ProgressBar
          segments={[
            { value: exactPct, cls: 'bg-primary' },
            { value: signPct, cls: 'bg-secondary' },
            { value: wrongPct, cls: 'bg-error' },
            { value: pendingPct, cls: 'bg-outline-variant/40' },
          ]}
          ariaLabel={t('dashboard.breakdownAria')}
        />
        <ul className="grid grid-cols-2 gap-2 text-label-sm">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            {t('dashboard.verdict.exact')}: {score.exact}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-secondary" />
            {t('dashboard.verdict.sign')}: {score.sign}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-error" />
            {t('dashboard.verdict.wrong')}: {score.wrong}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-outline-variant" />
            {t('dashboard.verdict.pending')}: {score.pending}
          </li>
        </ul>
        <p className="text-label-sm text-on-surface-variant">
          {t('dashboard.progress', {
            finished: score.finishedMatches,
            total: totalMatches,
            pct: progressPct,
          })}
        </p>
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h3 className="text-title-sm font-bold text-on-surface">
          {t('dashboard.breakdown')}
        </h3>
        {score.perMatch.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">
            {t('dashboard.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-outline-variant/40">
            {score.perMatch.map((m) => (
              <PerMatchRow key={m.matchId} score={m} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PerMatchRow({ score }: { score: MatchScore }) {
  const { t } = useTranslation();
  const stageLabel = t(
    score.stage === 'group'
      ? `dashboard.stage.group.${score.group ?? '?'}`
      : `tournament.stage.${score.stage}`,
    score.group ? { group: score.group } : undefined
  );
  const verdictLabel = (() => {
    switch (score.verdict) {
      case 'exact':
        return t('dashboard.verdict.exact');
      case 'sign':
        return t('dashboard.verdict.sign');
      case 'wrong':
        return t('dashboard.verdict.wrong');
      case 'pending':
        return t('dashboard.verdict.pending');
    }
  })();
  return (
    <li className="flex items-center justify-between py-2 text-body-sm">
      <span className="flex items-center gap-2">
        <span className="text-on-surface-variant tabular-nums">
          #{score.matchNumber}
        </span>
        <span className="text-on-surface">{stageLabel}</span>
        {score.wentToPenalties ? (
          <span className="rounded bg-tertiary-container px-1.5 py-0.5 text-label-sm text-on-tertiary-container">
            {t('tournament.pens')}
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-on-surface-variant">{verdictLabel}</span>
        <span className="min-w-[2ch] text-right font-bold tabular-nums text-on-surface">
          {score.points}
        </span>
        <VerdictIcon verdict={score.verdict} />
      </span>
    </li>
  );
}

function VerdictIcon({ verdict }: { verdict: MatchScore['verdict'] }) {
  switch (verdict) {
    case 'exact':
      return <Icon name="check" size={18} className="text-primary" />;
    case 'sign':
      return <Icon name="check" size={18} className="text-secondary" />;
    case 'wrong':
      return <Icon name="close" size={18} className="text-error" />;
    case 'pending':
      return (
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-full bg-outline-variant"
        />
      );
  }
}

interface Segment {
  value: number;
  cls: string;
}

function ProgressBar({
  segments,
  ariaLabel,
}: {
  segments: Segment[];
  ariaLabel: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high"
    >
      <div className="flex h-full w-full">
        {segments.map((s, i) => (
          <div
            key={i}
            className={`h-full ${s.cls}`}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
