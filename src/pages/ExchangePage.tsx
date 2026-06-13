import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveCollection } from '@/hooks';
import { useCollectionData } from '@/hooks/useCollectionData';
import {
  buildExchangeText,
  buildOwnList,
  parseExchangeText,
  resolveExchangeText,
  type ExchangeSection,
  type ResolvedExchange,
} from '@/services/exchangeService';
import { adjustQuantity } from '@/services/inventoryService';
import { Spinner } from '@/components/feedback/Spinner';
import { NoActiveCollection } from '@/components/collections/NoActiveCollection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { toast } from '@/stores/uiStore';

/** Default partner label used when the user pastes a list without naming someone. */
const DEFAULT_PARTNER = 'amigo';

export function ExchangePage() {
  const { t } = useTranslation();
  const { active, loading } = useActiveCollection();
  const { stickers, teams, inventory } = useCollectionData(active?.id ?? null);

  // ---- Repetidas: sub-selection of which duplicates we'll offer. ----
  // The user can uncheck stickers from the auto-populated list to narrow
  // down what they want to copy/share.
  const [offeredDuplicates, setOfferedDuplicates] = useState<Set<string>>(new Set());
  const [offeredMissing, setOfferedMissing] = useState<Set<string>>(new Set());

  // ---- Paste flow state. ----
  const [partner, setPartner] = useState(DEFAULT_PARTNER);
  const [resolved, setResolved] = useState<ResolvedExchange | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const collectionId = active?.id ?? null;

  // ---- Derive the "Repetidas" / "Faltan" groups from the active collection. ----
  const ownList = useMemo(
    () =>
      buildOwnList({
        stickers: stickers.map((s) => ({
          id: s.id,
          code: s.code,
          teamId: s.teamId,
        })),
        teams: teams.map((tm) => ({ id: tm.id, flag: tm.flag })),
        inventory,
      }),
    [stickers, teams, inventory]
  );

  // Pre-select all duplicates when the list first loads (or changes due to
  // a fresh collection). Missing is empty by default — the user has to
  // explicitly mark which ones they want to ask for.
  const duplicatesKey = ownList.duplicates
    .map((g) => g.prefix + g.numbers.join(','))
    .join('|');
  const missingKey = ownList.missing
    .map((g) => g.prefix + g.numbers.join(','))
    .join('|');
  useEffect(() => {
    setOfferedDuplicates(
      new Set(
        ownList.duplicates.flatMap((g) =>
          g.numbers.map((n) => `${g.prefix}${n}`)
        )
      )
    );
    setOfferedMissing(new Set());
    setResolved(null);
    setPastedText('');
    setErrorMsg(null);
    // We intentionally re-seed the selection only when the *shape* of
    // duplicates/missing changes (captured in `duplicatesKey` / `missingKey`)
    // — not on every inventory write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicatesKey, missingKey]);

  if (loading) return <Spinner />;
  if (!active || !collectionId) return <NoActiveCollection />;

  const toggleOffered = (
    code: string,
    set: Set<string>,
    setter: (next: Set<string>) => void
  ) => {
    const next = new Set(set);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setter(next);
  };

  const handleCopyOwn = (section: ExchangeSection) => {
    const labels = {
      header: t('exchange.header'),
      duplicatesTitle: t('exchange.duplicatesTitle'),
      missingTitle: t('exchange.missingTitle'),
      openInApp: t('exchange.openInApp'),
    };
    const duplicates = section === 'duplicates' ? pickSelected(ownList.duplicates, offeredDuplicates) : [];
    const missing = section === 'missing' ? pickSelected(ownList.missing, offeredMissing) : [];
    const text = buildExchangeText({
      labels,
      collectionId,
      duplicates,
      missing,
    });
    void writeClipboard(text).then((ok) => {
      if (!ok) toast.error(t('toast.error'));
      else toast.success(t('exchange.copied'));
    });
  };

  const handleCopyBoth = () => {
    const labels = {
      header: t('exchange.header'),
      duplicatesTitle: t('exchange.duplicatesTitle'),
      missingTitle: t('exchange.missingTitle'),
      openInApp: t('exchange.openInApp'),
    };
    const duplicates = pickSelected(ownList.duplicates, offeredDuplicates);
    const missing = pickSelected(ownList.missing, offeredMissing);
    const text = buildExchangeText({
      labels,
      collectionId,
      duplicates,
      missing,
    });
    void writeClipboard(text).then((ok) => {
      if (!ok) toast.error(t('toast.error'));
      else toast.success(t('exchange.copied'));
    });
  };

  const handleShareBoth = async () => {
    const labels = {
      header: t('exchange.header'),
      duplicatesTitle: t('exchange.duplicatesTitle'),
      missingTitle: t('exchange.missingTitle'),
      openInApp: t('exchange.openInApp'),
    };
    const duplicates = pickSelected(ownList.duplicates, offeredDuplicates);
    const missing = pickSelected(ownList.missing, offeredMissing);
    const text = buildExchangeText({
      labels,
      collectionId,
      duplicates,
      missing,
    });
    const ok = await shareOrCopy(text);
    if (!ok) toast.error(t('toast.error'));
    else toast.success(t('exchange.copied'));
  };

  const handlePasteFromClipboard = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
      setErrorMsg(t('exchange.pasteUnsupported'));
      return;
    }
    setAnalyzing(true);
    setErrorMsg(null);
    try {
      const text = await navigator.clipboard.readText();
      await analyzeText(text);
    } catch {
      setErrorMsg(t('exchange.pasteError'));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzePasted = async () => {
    if (!pastedText.trim()) {
      setErrorMsg(t('exchange.pasteEmpty'));
      return;
    }
    setAnalyzing(true);
    setErrorMsg(null);
    try {
      await analyzeText(pastedText);
    } catch {
      setErrorMsg(t('exchange.pasteError'));
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeText = async (text: string) => {
    const parsed = parseExchangeText(text);
    if (parsed.source === 'own' && parsed.collectionId && parsed.collectionId !== collectionId) {
      setErrorMsg(t('exchange.sameCollectionRequired'));
      setResolved(null);
      return;
    }
    if (parsed.lines.length === 0 && parsed.duplicates.length === 0 && parsed.missing.length === 0) {
      setErrorMsg(t('exchange.pasteEmpty'));
      setResolved(null);
      return;
    }
    const out = await resolveExchangeText(collectionId, text);
    setResolved(out);
    setPastedText(text);
    toast.success(t('exchange.pasteAnalyzed'));
  };

  const handleClearPaste = () => {
    setResolved(null);
    setPastedText('');
    setErrorMsg(null);
  };

  const handleApplyTrade = async () => {
    if (!resolved) return;
    // Apply: for every "they give you" → +1; every "you give them" → -1
    // (only if you have a duplicate to give). The user picks which
    // duplicates to give via `offeredDuplicates` (already filtered).
    const received = resolved.missing; // things they have, you need
    const given = ownList.duplicates
      .flatMap((g) =>
        g.numbers
          .filter((n) => offeredDuplicates.has(`${g.prefix}${n}`))
          .map((n) => ({ stickerId: `${g.prefix}${n}`, code: `${g.prefix}${n}` }))
      )
      // only the ones the friend has (intersection)
      .filter((d) =>
        resolved.duplicates.some((r) => r.code === d.code)
      );

    if (given.length === 0 && received.length === 0) {
      toast.error(t('exchange.tradeEmpty'));
      return;
    }

    try {
      for (const g of given) {
        await adjustQuantity(collectionId, g.stickerId, -1);
      }
      for (const r of received) {
        await adjustQuantity(collectionId, r.stickerId, 1);
      }
      toast.success(
        t('exchange.tradeApplied', {
          give: given.length,
          receive: received.length,
          partner: partner.trim() || t('exchange.partnerDefault'),
        })
      );
      setResolved(null);
      setPastedText('');
    } catch {
      toast.error(t('toast.error'));
    }
  };

  const totalDuplicates = ownList.duplicates.reduce(
    (sum, g) => sum + g.numbers.length,
    0
  );
  const totalMissing = ownList.missing.reduce((sum, g) => sum + g.numbers.length, 0);
  const totalOfferedDup = offeredDuplicates.size;
  const totalOfferedMiss = offeredMissing.size;

  return (
    <div className="flex flex-col gap-5">
      {/* ============== 1. REPETIDAS ============== */}
      <OwnSection
        title={t('exchange.duplicatesTitle')}
        description={t('exchange.duplicatesDescription', { count: totalDuplicates })}
        groups={ownList.duplicates}
        selected={offeredDuplicates}
        onToggle={(code) =>
          toggleOffered(code, offeredDuplicates, setOfferedDuplicates)
        }
        copyLabel={t('exchange.copyDuplicates')}
        copyLabelSelected={t('exchange.copyDuplicatesSelected', { count: totalOfferedDup })}
        onCopy={() => handleCopyOwn('duplicates')}
        onSelectAll={() =>
          setOfferedDuplicates(
            new Set(
              ownList.duplicates.flatMap((g) => g.numbers.map((n) => `${g.prefix}${n}`))
            )
          )
        }
        onSelectNone={() => setOfferedDuplicates(new Set())}
        emptyHint={t('exchange.noDuplicatesHint')}
        testId="duplicates-section"
        shareDisabled={totalOfferedDup === 0}
      />

      {/* ============== 2. FALTAN ============== */}
      <OwnSection
        title={t('exchange.missingTitle')}
        description={t('exchange.missingDescription', { count: totalMissing })}
        groups={ownList.missing}
        selected={offeredMissing}
        onToggle={(code) =>
          toggleOffered(code, offeredMissing, setOfferedMissing)
        }
        copyLabel={t('exchange.copyMissing')}
        copyLabelSelected={t('exchange.copyMissingSelected', { count: totalOfferedMiss })}
        onCopy={() => handleCopyOwn('missing')}
        onSelectAll={() =>
          setOfferedMissing(
            new Set(
              ownList.missing.flatMap((g) => g.numbers.map((n) => `${g.prefix}${n}`))
            )
          )
        }
        onSelectNone={() => setOfferedMissing(new Set())}
        emptyHint={t('exchange.noMissingHint')}
        testId="missing-section"
        shareDisabled={totalOfferedMiss === 0}
      />

      {/* ============== 3. SHARE BOTH ============== */}
      {(totalDuplicates > 0 || totalMissing > 0) && (
        <section
          className="card flex flex-col gap-3"
          data-testid="share-both-section"
        >
          <h2 className="text-label-md font-medium uppercase tracking-wide text-on-surface-variant">
            {t('exchange.shareBothTitle')}
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            {t('exchange.shareBothDescription', {
              duplicates: totalOfferedDup,
              missing: totalOfferedMiss,
            })}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={handleCopyBoth}
              disabled={totalOfferedDup === 0 && totalOfferedMiss === 0}
              data-testid="share-both-copy"
            >
              {t('exchange.copyBoth')}
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => void handleShareBoth()}
              disabled={totalOfferedDup === 0 && totalOfferedMiss === 0}
              data-testid="share-both-share"
            >
              {t('exchange.shareBothShare')}
            </button>
          </div>
          <p className="text-label-sm text-on-surface-variant">
            {t('exchange.shareBothHint')}
          </p>
        </section>
      )}

      {/* ============== 4. PASTE FROM A FRIEND ============== */}
      <section className="card flex flex-col gap-3" data-testid="paste-section">
        <h2 className="text-label-md font-medium uppercase tracking-wide text-on-surface-variant">
          {t('exchange.pasteTitle')}
        </h2>
        <p className="text-body-sm text-on-surface-variant">
          {t('exchange.pasteDescription')}
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-label-md text-on-surface-variant">
            {t('exchange.partnerLabel')}
          </span>
          <input
            type="text"
            className="input py-2"
            placeholder={t('exchange.partnerPlaceholder')}
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
            aria-label={t('exchange.partnerLabel')}
            data-testid="paste-partner"
          />
        </label>

        <textarea
          className="input min-h-[140px] py-2 font-mono text-label-sm"
          placeholder={t('exchange.pastePlaceholder')}
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          aria-label={t('exchange.pasteLabel')}
          data-testid="paste-textarea"
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={handlePasteFromClipboard}
            disabled={analyzing}
            data-testid="paste-from-clipboard"
          >
            {analyzing ? t('common.loading') : t('exchange.pasteFromClipboard')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={handleAnalyzePasted}
            disabled={analyzing || !pastedText.trim()}
            data-testid="paste-analyze"
          >
            {analyzing ? t('common.loading') : t('exchange.pasteAnalyze')}
          </button>
        </div>

        {errorMsg ? (
          <p className="text-label-sm text-error" data-testid="paste-error">
            {errorMsg}
          </p>
        ) : null}

        {resolved ? (
          <>
            <ResolvedSummary resolved={resolved} collectionId={collectionId} />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={handleApplyTrade}
                disabled={
                  resolved.missing.length === 0 &&
                  (ownList.duplicates
                    .flatMap((g) => g.numbers.map((n) => `${g.prefix}${n}`))
                    .filter((c) => offeredDuplicates.has(c) &&
                      resolved.duplicates.some((r) => r.code === c))
                    .length === 0)
                }
                data-testid="paste-apply"
              >
                {t('exchange.tradeConfirm', {
                  give: ownList.duplicates
                    .flatMap((g) => g.numbers.map((n) => `${g.prefix}${n}`))
                    .filter((c) =>
                      offeredDuplicates.has(c) &&
                      resolved.duplicates.some((r) => r.code === c)
                    ).length,
                  receive: resolved.missing.length,
                })}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClearPaste}
                data-testid="paste-clear"
              >
                {t('exchange.clear')}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Own section (Repetidas or Faltan)                                   */
/* ------------------------------------------------------------------ */

interface OwnSectionProps {
  title: string;
  description: string;
  groups: { prefix: string; emoji: string; numbers: string[] }[];
  selected: Set<string>;
  onToggle: (code: string) => void;
  copyLabel: string;
  copyLabelSelected: string;
  onCopy: () => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  emptyHint: string;
  testId: string;
  shareDisabled: boolean;
}

function OwnSection({
  title,
  description,
  groups,
  selected,
  onToggle,
  copyLabel,
  copyLabelSelected,
  onCopy,
  onSelectAll,
  onSelectNone,
  emptyHint,
  testId,
  shareDisabled,
}: OwnSectionProps) {
  const { t } = useTranslation();
  const totalGroups = groups.length;
  const hasAny = totalGroups > 0;

  return (
    <section className="card flex flex-col gap-3" data-testid={testId}>
      <header className="flex flex-col gap-1">
        <h2 className="text-label-md font-medium uppercase tracking-wide text-on-surface-variant">
          {title}
        </h2>
        <p className="text-body-sm text-on-surface-variant">{description}</p>
      </header>

      {hasAny ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={onSelectAll}
              data-testid={`${testId}-select-all`}
            >
              {t('exchange.selectAll')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onSelectNone}
              data-testid={`${testId}-select-none`}
            >
              {t('exchange.selectNone')}
            </button>
          </div>

          <ul className="flex flex-wrap gap-1.5" data-testid={`${testId}-list`}>
            {groups.flatMap((g) =>
              g.numbers.map((n) => {
                const code = `${g.prefix}${n}`;
                const isSelected = selected.has(code);
                return (
                  <li key={code}>
                    <button
                      type="button"
                      onClick={() => onToggle(code)}
                      aria-pressed={isSelected}
                      aria-label={code}
                      data-testid={`${testId}-chip-${code}`}
                      data-selected={isSelected}
                      className={`flex items-center gap-1 rounded-full border px-2.5
                        py-1 font-mono text-label-md transition-colors
                        ${
                          isSelected
                            ? 'border-primary bg-primary-container text-on-primary-container'
                            : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-container'
                        }`}
                    >
                      <span aria-hidden="true">{g.emoji || '·'}</span>
                      <span>{code}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={onCopy}
              disabled={shareDisabled}
              data-testid={`${testId}-copy`}
            >
              {selected.size > 0 ? copyLabelSelected : copyLabel}
            </button>
          </div>
        </>
      ) : (
        <EmptyState
          title={t('exchange.noItems')}
          description={emptyHint}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Resolved summary after a paste                                       */
/* ------------------------------------------------------------------ */

function ResolvedSummary({
  resolved,
}: {
  resolved: ResolvedExchange;
  collectionId?: string;
}) {
  const { t } = useTranslation();
  const iCanGive = resolved.duplicates.length;
  const iNeed = resolved.missing.length;
  const unresolved = resolved.unresolved.length;

  return (
    <div
      className="flex flex-col gap-1 rounded-md bg-surface-container-lowest p-2 text-body-sm"
      data-testid="paste-summary"
    >
      <p className="flex items-center justify-between gap-2">
        <span className="text-secondary">
          {t('exchange.pasteTheyGive', { count: iCanGive })}
        </span>
        <span className="text-on-surface-variant">↔</span>
        <span className="text-primary">
          {t('exchange.pasteYouReceive', { count: iNeed })}
        </span>
      </p>
      {unresolved > 0 ? (
        <p className="text-label-sm text-on-surface-variant">
          {t('exchange.pasteUnresolved', { count: unresolved })}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function pickSelected(
  groups: { prefix: string; emoji: string; numbers: string[] }[],
  selected: Set<string>
): { prefix: string; emoji: string; numbers: string[] }[] {
  return groups
    .map((g) => {
      const kept = g.numbers.filter((n) => selected.has(`${g.prefix}${n}`));
      return { prefix: g.prefix, emoji: g.emoji, numbers: kept };
    })
    .filter((g) => g.numbers.length > 0);
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function shareOrCopy(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function'
    ) {
      const data = { text, title: 'AlbumPanini exchange' };
      if (navigator.canShare(data)) {
        await navigator.share(data);
        return true;
      }
    }
  } catch {
    // fall through to clipboard
  }
  return writeClipboard(text);
}
