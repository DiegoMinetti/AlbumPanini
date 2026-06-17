import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type {
  BracketResolver,
  IndexedMatchResult,
} from '@/services/tournamentService';
import type { StoredTeam } from '@/types/collection';
import type { TournamentMatch } from '@/types/tournament';
import type { StoredOfficialResult } from '@/types/prediction';
import { isLockedForPrediction, isPredictionCorrect } from '@/utils/prediction';
import { haptics } from '@/utils/haptics';
import {
  dayKeyInZone,
  formatDayInZone,
  formatLongDateInZone,
  formatTimeInZone,
  formatWeekdayInZone,
  safeTimeZone,
} from '@/utils/timeZone';
import { formatCountdown } from '@/utils/countdown';
import { useSettingsStore } from '@/stores/settingsStore';
import { Icon } from '@/components/ui/Icon';
import {
  setPrediction,
  PredictionLockedError,
} from '@/services/predictionService';

interface MatchesViewProps {
  matches: TournamentMatch[];
  resolver: BracketResolver;
  teamsById: Map<string, StoredTeam>;
  results: Map<string, IndexedMatchResult>;
  officialResults: Map<string, StoredOfficialResult>;
  scenarioId: string;
  isOfficialScenario: boolean;
  /** True while a manual sync of official results is in flight. The
   *  refresh button uses this to render its spinner / disabled state. */
  officialRefreshing: boolean;
  /** Manually trigger a sync of the official-results JSON. */
  refreshOfficial: () => Promise<number>;
}

type MatchStatus = 'past' | 'live' | 'next' | 'future';

type StatusFilter = 'all' | 'past' | 'live' | 'upcoming';

interface TimelineEntry {
  match: TournamentMatch;
  kickoffMs: number;
  status: MatchStatus;
  homeTeamId?: string;
  awayTeamId?: string;
}

interface DaySection {
  key: string;
  label: string;
  weekday: string;
  day: string;
  entries: TimelineEntry[];
  anchor: boolean;
}

const LIVE_WINDOW_MS = 2.5 * 60 * 60 * 1000;
/** How long a row stays in the "new result" highlight state after the
 *  official result lands. Long enough to be obvious (~3s), short enough
 *  to not get in the way of scrolling. */
const NEW_RESULT_HIGHLIGHT_MS = 3500;

function parseKickoffMs(match: TournamentMatch): number {
  if (match.kickoff) {
    const t = Date.parse(match.kickoff);
    if (!Number.isNaN(t)) return t;
  }
  if (match.date) {
    return new Date(`${match.date}T12:00:00Z`).getTime();
  }
  return Number.POSITIVE_INFINITY;
}

function classifyEntry(
  kickoffMs: number,
  official: StoredOfficialResult | undefined,
  now: number
): MatchStatus {
  const finished =
    !!official && official.status !== 'SCHEDULED' && official.homeGoals != null;
  if (finished) return 'past';
  if (kickoffMs <= now && now - kickoffMs <= LIVE_WINDOW_MS) return 'live';
  if (kickoffMs > now) return 'future';
  return 'past';
}

function buildSections(
  matches: TournamentMatch[],
  resolver: BracketResolver,
  results: Map<string, IndexedMatchResult>,
  now: number,
  locale: string,
  timeZone: string
): DaySection[] {
  const entries: TimelineEntry[] = matches
    .map((m): TimelineEntry => {
      const kickoffMs = parseKickoffMs(m);
      const resolved = resolver.resolveMatch(m);
      return {
        match: m,
        kickoffMs,
        status: 'future',
        homeTeamId: resolved.homeTeamId,
        awayTeamId: resolved.awayTeamId,
      };
    })
    .sort((a, b) => a.kickoffMs - b.kickoffMs);

  for (const e of entries) {
    e.status = classifyEntry(e.kickoffMs, undefined, now);
  }
  for (const e of entries) {
    const r = results.get(e.match.id);
    if (r?.played && e.status !== 'past') e.status = 'past';
  }
  const nextIdx = entries.findIndex((e) => e.status === 'future');
  if (nextIdx >= 0) entries[nextIdx].status = 'next';

  const byDay = new Map<string, TimelineEntry[]>();
  for (const e of entries) {
    const key = dayKeyInZone(e.kickoffMs, timeZone);
    let list = byDay.get(key);
    if (!list) {
      list = [];
      byDay.set(key, list);
    }
    list.push(e);
  }

  const sections: DaySection[] = [];
  const keys = [...byDay.keys()].sort();
  let anchorAssigned = false;
  for (const key of keys) {
    const list = byDay.get(key)!;
    const ref = new Date(list[0].kickoffMs);
    const hasAnchor = list.some(
      (e) => e.status === 'live' || e.status === 'next'
    );
    sections.push({
      key,
      label: formatLongDateInZone(ref.getTime(), locale, timeZone),
      weekday: formatWeekdayInZone(ref.getTime(), locale, timeZone),
      day: formatDayInZone(ref.getTime(), locale, timeZone),
      entries: list,
      anchor: hasAnchor && !anchorAssigned,
    });
    if (hasAnchor) anchorAssigned = true;
  }
  return sections;
}

/**
 * Format the time-until-kickoff for the next match. Picks a granularity that
 * matches the magnitude so the user doesn't have to parse "in 7320m":
 *  - <  1 h  → "En 23 min"
 *  - < 24 h  → "En 4 h 15 min"
 *  - >= 1 d  → "En 2 d 4 h"
 *  - already started → ""
 *
 * (Implementation moved to `@/utils/countdown` so it can be unit-tested
 *  without mounting React. The helper returns just the time portion; the
 *  "En"/"in" prefix comes from the i18n string `matches.nextStartsIn`.)
 */

const M3_NUMBER_CLS =
  'h-9 w-10 rounded-md border border-outline-variant bg-transparent text-center ' +
  'text-body-md font-bold tabular-nums text-on-surface ' +
  'transition-colors duration-motion-short2 ease-standard ' +
  'hover:border-outline focus:border-primary focus:outline-none ' +
  'focus:ring-2 focus:ring-primary/40 disabled:opacity-40';

function TeamSide({
  team,
  label,
  align,
  dim,
}: {
  team?: StoredTeam;
  label?: string;
  align: 'left' | 'right';
  dim?: boolean;
}) {
  const content = team ? (
    <>
      {team.flag ? (
        <span className="text-xl leading-none">{team.flag}</span>
      ) : null}
      <span
        className={`truncate text-body-md ${
          dim
            ? 'font-medium text-on-surface-variant'
            : 'font-semibold text-on-surface'
        }`}
      >
        {team.name}
      </span>
    </>
  ) : (
    <span className="truncate text-body-md italic text-on-surface-variant">
      {label ?? '—'}
    </span>
  );
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-1.5 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      {content}
    </div>
  );
}

function StatusPill({
  status,
  countdown,
}: {
  status: MatchStatus;
  countdown?: string;
}) {
  const { t } = useTranslation();
  if (status === 'live') {
    return (
      <span
        data-testid="match-status-live"
        className="inline-flex items-center gap-1 rounded-full bg-error/15 px-2 py-0.5
          text-label-sm font-bold uppercase tracking-wide text-error"
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-error"
        />
        {t('matches.status.live')}
      </span>
    );
  }
  if (status === 'next') {
    return (
      <span
        data-testid="match-status-next"
        className="inline-flex flex-col items-end gap-0.5"
      >
        <span
          className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5
          text-label-sm font-bold uppercase tracking-wide text-primary"
        >
          <Icon name="schedule" size={12} />
          {t('matches.status.next')}
        </span>
        {countdown ? (
          <span
            data-testid="match-countdown"
            className="text-label-sm font-semibold tabular-nums text-primary"
          >
            {countdown}
          </span>
        ) : null}
      </span>
    );
  }
  if (status === 'past') {
    return (
      <span
        data-testid="match-status-past"
        className="inline-flex items-center gap-1 rounded-full bg-outline-variant/30
          px-2 py-0.5 text-label-sm font-semibold uppercase tracking-wide
          text-on-surface-variant"
      >
        {t('matches.status.final')}
      </span>
    );
  }
  return null;
}

function VerdictChip({
  verdict,
}: {
  verdict: ReturnType<typeof isPredictionCorrect>;
}) {
  const { t } = useTranslation();
  if (verdict === 'official-missing') return null;
  const map = {
    exact: {
      label: t('tournament.verdict.exact'),
      cls: 'bg-primary/15 text-primary',
    },
    sign: {
      label: t('tournament.verdict.sign'),
      cls: 'bg-secondary/15 text-secondary',
    },
    wrong: {
      label: t('tournament.verdict.wrong'),
      cls: 'bg-error/15 text-error',
    },
    pending: {
      label: t('tournament.verdict.pending'),
      cls: 'bg-outline-variant/30 text-on-surface-variant',
    },
  } as const;
  const v = map[verdict];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-label-sm font-semibold ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

function timeFmt(kickoffMs: number, locale: string, timeZone: string): string {
  return formatTimeInZone(kickoffMs, locale, timeZone);
}

interface MatchRowProps {
  entry: TimelineEntry;
  result: IndexedMatchResult | undefined;
  official: StoredOfficialResult | undefined;
  home?: StoredTeam;
  away?: StoredTeam;
  homeLabel?: string;
  awayLabel?: string;
  scenarioId: string;
  isOfficialScenario: boolean;
  locale: string;
  timeZone: string;
  /** True if this row's official result just arrived within the last
   *  `NEW_RESULT_HIGHLIGHT_MS`. Triggers a brief green highlight. */
  highlightNew: boolean;
  /** Countdown string ("En 2 d 4 h") — only meaningful for the "next" row. */
  countdown?: string;
}

function MatchRow({
  entry,
  result,
  official,
  home,
  away,
  homeLabel,
  awayLabel,
  scenarioId,
  isOfficialScenario,
  locale,
  timeZone,
  highlightNew,
  countdown,
}: MatchRowProps) {
  const { t } = useTranslation();
  const m = entry.match;
  const teamsResolved = !!home && !!away;
  const locked = isLockedForPrediction(m);
  const editable = teamsResolved && !locked && !isOfficialScenario;
  const played = result?.played ?? false;
  const homeGoals = played ? result!.homeGoals : '';
  const awayGoals = played ? result!.awayGoals : '';

  const parse = (v: string): number | null =>
    v === '' ? null : Math.max(0, Math.floor(Number(v) || 0));

  const safeSet = (next: {
    homeGoals?: number | null;
    awayGoals?: number | null;
  }) => {
    if (isOfficialScenario) return;
    try {
      void setPrediction(scenarioId, m, {
        homeGoals: next.homeGoals ?? (played ? result!.homeGoals : null),
        awayGoals: next.awayGoals ?? (played ? result!.awayGoals : null),
      });
    } catch (err) {
      if (err instanceof PredictionLockedError) {
        console.warn(`[prediction] rejected edit on ${err.matchId}: locked`);
      } else {
        throw err;
      }
    }
  };

  const verdict = isPredictionCorrect(
    played
      ? {
          homeGoals: result!.homeGoals,
          awayGoals: result!.awayGoals,
          homePens: result!.homePens,
          awayPens: result!.awayPens,
          played: true,
        }
      : undefined,
    official
  );

  const stageStr =
    m.stage === 'group'
      ? t('tournament.group', { id: m.group ?? '?' })
      : t(`tournament.stage.${m.stage}`);

  const isPast = entry.status === 'past';
  const isAnchor = entry.status === 'live' || entry.status === 'next';

  return (
    <article
      data-testid="match-row"
      data-match-id={m.id}
      data-match-status={entry.status}
      data-highlight-new={highlightNew ? 'true' : undefined}
      className={`flex flex-col gap-1.5 rounded-md border bg-surface-container-low p-3 shadow-elev-1
        transition-colors duration-motion-short2 ease-standard
        ${
          isAnchor
            ? 'border-primary/40 ring-1 ring-primary/30'
            : isPast
              ? 'border-outline-variant/30 opacity-90'
              : 'border-outline-variant/40'
        }
        ${
          highlightNew
            ? 'match-new-result animate-[match-new-result-pulse_2.2s_ease-out]'
            : ''
        }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-label-sm text-on-surface-variant">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold uppercase tracking-wide text-primary">
            {stageStr}
          </span>
          <span aria-hidden>•</span>
          <span className="inline-flex items-center gap-0.5 tabular-nums">
            <Icon name="schedule" size={12} />
            {timeFmt(entry.kickoffMs, locale, timeZone)}
          </span>
          {m.city || m.venue ? (
            <>
              <span aria-hidden>•</span>
              <span
                className="inline-flex max-w-[14ch] items-center gap-0.5 truncate"
                title={
                  m.venue ? `${m.venue}${m.city ? ` — ${m.city}` : ''}` : m.city
                }
              >
                <Icon name="place" size={12} />
                {m.city ?? m.venue}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <StatusPill status={entry.status} countdown={countdown} />
          <span className="tabular-nums text-on-surface-variant">
            #{m.matchNumber}
          </span>
        </div>
      </header>

      <div className="flex items-center gap-2">
        <TeamSide team={home} label={homeLabel} align="left" dim={isPast} />
        <div className="flex shrink-0 items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={`${home?.name ?? homeLabel ?? 'home'} goals`}
            disabled={!editable}
            value={homeGoals}
            onChange={(e) =>
              safeSet({
                homeGoals: parse(e.target.value),
                awayGoals: parse(String(awayGoals)),
              })
            }
            className={M3_NUMBER_CLS}
          />
          <span className="text-on-surface-variant">-</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={`${away?.name ?? awayLabel ?? 'away'} goals`}
            disabled={!editable}
            value={awayGoals}
            onChange={(e) =>
              safeSet({
                homeGoals: parse(String(homeGoals)),
                awayGoals: parse(e.target.value),
              })
            }
            className={M3_NUMBER_CLS}
          />
        </div>
        <TeamSide team={away} label={awayLabel} align="right" dim={isPast} />
      </div>

      {official && official.status !== 'SCHEDULED' ? (
        <div className="flex items-center justify-end gap-1.5 text-label-sm text-on-surface-variant">
          <span className="uppercase tracking-wide">
            {t('tournament.official')}
          </span>
          <span className="tabular-nums font-semibold text-on-surface">
            {official.homeGoals}-{official.awayGoals}
            {official.status === 'PEN' &&
            official.homePens != null &&
            official.awayPens != null
              ? ` (${official.homePens}-${official.awayPens} pen)`
              : ''}
          </span>
          <VerdictChip verdict={verdict} />
          {highlightNew ? (
            <span
              data-testid="match-new-result-badge"
              className="inline-flex items-center gap-1 rounded-full bg-tertiary-container
                px-2 py-0.5 text-label-sm font-bold text-on-tertiary-container"
            >
              <Icon name="check" size={12} />
              {t('matches.newResult')}
            </span>
          ) : null}
        </div>
      ) : null}

      {locked && !official && !isOfficialScenario ? (
        <div className="text-right text-label-sm italic text-on-surface-variant">
          {t('tournament.locked')}
        </div>
      ) : null}
    </article>
  );
}

interface FilterChipsProps {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}

const FILTER_ORDER: StatusFilter[] = ['all', 'past', 'live', 'upcoming'];

/** Compact M3 SegmentedButton-style chip row for status filtering. Slightly
 *  smaller than the stickers FilterChips (no per-chip counts visible by
 *  default — the count is announced to screen readers and the active chip
 *  already shows the dominant number through its label). */
function StatusFilterChips({ value, onChange, counts }: FilterChipsProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number }>({
    x: 0,
    w: 0,
  });

  const update = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>(
      `[data-filter-value="${value}"]`
    );
    if (!active) return;
    const rootRect = root.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    setIndicator({ x: aRect.left - rootRect.left, w: aRect.width });
  }, [value]);

  useLayoutEffect(() => {
    update();
  }, [update]);
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => update());
    ro.observe(root);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const handleChange = (next: StatusFilter) => {
    if (next !== value) haptics.selection();
    onChange(next);
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={t('matches.filterAria')}
      data-testid="matches-filter-chips"
      className="relative flex w-full items-center gap-1 rounded-lg
        bg-surface-container p-1"
    >
      <span
        aria-hidden
        className="segmented-indicator"
        style={{
          transform: `translateX(${indicator.x}px)`,
          width: `${indicator.w}px`,
        }}
      />
      {FILTER_ORDER.map((f) => {
        const active = value === f;
        return (
          <button
            key={f}
            type="button"
            role="tab"
            data-filter-value={f}
            data-testid={`matches-filter-${f}`}
            aria-selected={active}
            onClick={() => handleChange(f)}
            className={[
              'group relative z-10 flex min-h-[36px] min-w-0 flex-1 items-center',
              'justify-center gap-1 overflow-hidden rounded-md px-1.5',
              'text-label-md transition-colors duration-motion-short3',
              'ease-standard focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-primary',
              active
                ? 'text-on-secondary-container'
                : 'text-on-surface-variant hover:text-on-surface',
            ].join(' ')}
          >
            <span className="min-w-0 truncate">{t(`matches.filter.${f}`)}</span>
            <span
              className="shrink-0 tabular-nums opacity-70"
              aria-label={`${counts[f]}`}
            >
              ({counts[f]})
            </span>
            <span aria-hidden className="state-layer" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * "Partidos" — horizontal timeline of the whole tournament, grouped by day.
 * On mount we auto-scroll the section that contains the live / next match
 * into view, then leave the user free to scrub up (past results) or down
 * (upcoming fixtures). A floating "Jump to today" pill re-anchors the view.
 *
 * Beyond the timeline it also offers:
 *  - A status filter (Todos / Jugados / En vivo / Pendientes) that hides
 *    sections that don't match.
 *  - A manual refresh button that re-fetches the official results.
 *  - A live "En 2 d 4 h" countdown under the next-match pill.
 *  - A 2.2 s green highlight + "Nuevo" badge on any row whose official
 *    result just arrived (driven by diffing the previous official-results
 *    map against the current one).
 */
export function MatchesView({
  matches,
  resolver,
  teamsById,
  results,
  officialResults,
  scenarioId,
  isOfficialScenario,
  officialRefreshing,
  refreshOfficial,
}: MatchesViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const configuredZone = useSettingsStore((s) => s.timeZone);
  const timeZone = safeTimeZone(configuredZone);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Refresh "now" every 30 s so the countdown and live-window slide forward
  // smoothly while the user is on the tab. 30 s is the sweet spot between
  // visual freshness and re-render cost.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const sections = useMemo(
    () => buildSections(matches, resolver, results, now, locale, timeZone),
    [matches, resolver, results, now, locale, timeZone]
  );

  // Apply the status filter on top of the built sections. Sections that
  // become empty are dropped from the rendered list (with an empty state
  // if everything was filtered out).
  const filteredSections = useMemo(() => {
    if (filter === 'all') return sections;
    const matchesFilter = (e: TimelineEntry): boolean => {
      if (filter === 'past') return e.status === 'past';
      if (filter === 'live') return e.status === 'live';
      if (filter === 'upcoming')
        return e.status === 'next' || e.status === 'future';
      return true;
    };
    return sections
      .map((s) => ({
        ...s,
        entries: s.entries.filter(matchesFilter),
      }))
      .filter((s) => s.entries.length > 0);
  }, [sections, filter]);

  const totalMatches = matches.length;
  const pastCount = sections.reduce(
    (n, s) => n + s.entries.filter((e) => e.status === 'past').length,
    0
  );
  const liveCount = sections.reduce(
    (n, s) => n + s.entries.filter((e) => e.status === 'live').length,
    0
  );
  const upcomingCount = sections.reduce(
    (n, s) =>
      n +
      s.entries.filter((e) => e.status === 'next' || e.status === 'future')
        .length,
    0
  );
  const counts: Record<StatusFilter, number> = {
    all: totalMatches,
    past: pastCount,
    live: liveCount,
    upcoming: upcomingCount,
  };

  // Compute the countdown string for the first "next" match (the auto-anchor
  // for a user whose view is currently scrolled to the top).
  const nextEntry = useMemo(
    () => sections.flatMap((s) => s.entries).find((e) => e.status === 'next'),
    [sections]
  );
  const nextCountdown = nextEntry
    ? formatCountdown(nextEntry.kickoffMs, now)
    : '';

  // ===== New-result detection =====
  // Snapshot the set of finalized matchIds on every render. If a matchId
  // transitions from "not finalized" → "finalized", we add it to
  // `newlyFinished` for `NEW_RESULT_HIGHLIGHT_MS`, then drop it. This is
  // what triggers the green pulse on the affected row + the "Nuevo" badge.
  //
  // `seeded` is false on the first effect run after mount — we don't want
  // to highlight every historical match on initial load (it would look like
  // the whole season just finished). After the first run we mark the
  // current snapshot as the baseline and only flag true new arrivals.
  const prevFinalizedRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  const [newlyFinished, setNewlyFinished] = useState<Set<string>>(new Set());
  useEffect(() => {
    const finalized = new Set<string>();
    for (const r of officialResults.values()) {
      if (r.status !== 'SCHEDULED' && r.homeGoals != null) {
        finalized.add(r.matchId);
      }
    }
    if (!seededRef.current) {
      seededRef.current = true;
      prevFinalizedRef.current = finalized;
      return;
    }
    const fresh: string[] = [];
    for (const id of finalized) {
      if (!prevFinalizedRef.current.has(id)) fresh.push(id);
    }
    if (fresh.length > 0) {
      setNewlyFinished((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.add(id);
        return next;
      });
      const added = fresh.slice();
      window.setTimeout(() => {
        setNewlyFinished((prev) => {
          const next = new Set(prev);
          for (const id of added) next.delete(id);
          return next;
        });
      }, NEW_RESULT_HIGHLIGHT_MS);
    }
    prevFinalizedRef.current = finalized;
  }, [officialResults]);

  // Refs for the auto-scroll target and the "jump back" button.
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const didAutoScrollRef = useRef(false);
  const [showJumpButton, setShowJumpButton] = useState(false);

  // First mount: scroll the anchor section into view. The dependency on
  // `sections` (the un-filtered list) ensures we scroll to the *real*
  // anchor even when a non-"all" filter would have hidden it.
  useLayoutEffect(() => {
    if (didAutoScrollRef.current) return;
    if (!anchorRef.current) return;
    anchorRef.current.scrollIntoView({
      block: 'center',
      behavior: 'auto',
    });
    didAutoScrollRef.current = true;
  }, [sections]);

  // Track whether the user has scrolled away from the anchor.
  useEffect(() => {
    const onScroll = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const off = rect.bottom < 80 || rect.top > window.innerHeight - 120;
      setShowJumpButton(off);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [sections]);

  const jumpToAnchor = () => {
    anchorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const onRefresh = useCallback(async () => {
    setRefreshError(null);
    haptics.selection();
    try {
      await refreshOfficial();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    }
  }, [refreshOfficial]);

  // Lookup map: matchId → countdown string (only for the single "next"
  // match in the un-filtered timeline).
  const countdownById = useMemo(() => {
    if (!nextEntry) return new Map<string, string>();
    return new Map([[nextEntry.match.id, nextCountdown]]);
  }, [nextEntry, nextCountdown]);

  if (sections.length === 0) {
    return (
      <div className="text-on-surface-variant text-body-sm">
        {t('tournament.noTournament')}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-4">
      <StatusFilterChips value={filter} onChange={setFilter} counts={counts} />

      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-label-md text-on-surface-variant">
        <span data-testid="matches-summary">
          {t('matches.summary', {
            past: pastCount,
            upcoming: upcomingCount,
            total: totalMatches,
          })}
        </span>
        <div className="flex items-center gap-2">
          {nextCountdown ? (
            <span
              data-testid="matches-next-countdown"
              className="inline-flex items-center gap-1 text-label-md font-semibold text-primary"
            >
              <Icon name="schedule" size={14} />
              {t('matches.nextStartsIn', { countdown: nextCountdown })}
            </span>
          ) : null}
          {showJumpButton ? (
            <button
              type="button"
              onClick={jumpToAnchor}
              data-testid="matches-jump-anchor"
              className="has-state-layer group relative inline-flex h-8 items-center gap-1
                overflow-hidden rounded-full bg-primary-container px-3
                text-label-md font-bold text-on-primary-container
                transition-shadow duration-motion-short2 ease-standard
                hover:shadow-elev-1
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon name="event" size={14} />
              {t('matches.jumpToToday')}
              <span aria-hidden className="state-layer" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            disabled={officialRefreshing}
            data-testid="matches-refresh"
            aria-label={t('matches.refresh')}
            title={t('matches.refresh')}
            className="has-state-layer group relative inline-flex h-8 w-8 items-center
              justify-center overflow-hidden rounded-full bg-surface-container
              text-on-surface-variant transition-colors duration-motion-short2
              ease-standard hover:bg-surface-container-high
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
              disabled:opacity-40 disabled:pointer-events-none"
          >
            <Icon
              name="refresh"
              size={16}
              className={
                officialRefreshing
                  ? 'animate-[refresh-spin_1s_linear_infinite]'
                  : ''
              }
            />
            <span aria-hidden className="state-layer" />
          </button>
        </div>
      </header>

      {refreshError ? (
        <p
          role="alert"
          className="rounded-md bg-error-container px-3 py-2 text-label-md text-on-error-container"
        >
          {t('matches.refreshError', { error: refreshError })}
        </p>
      ) : null}

      {filteredSections.length === 0 ? (
        <p
          data-testid="matches-filter-empty"
          className="rounded-md bg-surface-container px-3 py-6 text-center text-body-sm text-on-surface-variant"
        >
          {t(`matches.filterEmpty.${filter}`)}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {filteredSections.map((section) => (
            <section
              key={section.key}
              ref={section.anchor ? anchorRef : null}
              data-testid="matches-day-section"
              data-day-key={section.key}
              data-anchor={section.anchor ? 'true' : undefined}
              className="flex flex-col gap-2"
            >
              <header
                className={`sticky top-0 z-10 -mx-3 flex items-baseline gap-2 px-3 py-1.5
                  backdrop-blur ${
                    section.anchor
                      ? 'bg-primary-container/70 text-on-primary-container'
                      : 'bg-surface/80 text-on-surface-variant'
                  }`}
              >
                <span className="text-title-md font-bold uppercase tracking-wide">
                  {section.weekday}
                </span>
                <span className="text-title-sm font-semibold tabular-nums">
                  {section.day}
                </span>
                <span className="text-label-md capitalize">
                  {section.label}
                </span>
                <span className="ml-auto text-label-sm tabular-nums opacity-80">
                  {section.entries.length}{' '}
                  {section.entries.length === 1
                    ? t('matches.match')
                    : t('matches.matches')}
                </span>
              </header>
              <div className="flex flex-col gap-2">
                {section.entries.map((entry) => {
                  const m = entry.match;
                  const result = results.get(m.id);
                  const official = officialResults.get(m.id);
                  return (
                    <MatchRow
                      key={m.id}
                      entry={entry}
                      result={result}
                      official={official}
                      home={
                        entry.homeTeamId
                          ? teamsById.get(entry.homeTeamId)
                          : undefined
                      }
                      away={
                        entry.awayTeamId
                          ? teamsById.get(entry.awayTeamId)
                          : undefined
                      }
                      homeLabel={m.homeSlot}
                      awayLabel={m.awaySlot}
                      scenarioId={scenarioId}
                      isOfficialScenario={isOfficialScenario}
                      locale={locale}
                      timeZone={timeZone}
                      highlightNew={newlyFinished.has(m.id)}
                      countdown={countdownById.get(m.id)}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
