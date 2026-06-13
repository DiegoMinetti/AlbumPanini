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
  type ResolvedSticker,
} from '@/services/exchangeService';
import { adjustQuantity } from '@/services/inventoryService';
import { Spinner } from '@/components/feedback/Spinner';
import { NoActiveCollection } from '@/components/collections/NoActiveCollection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PromptModal } from '@/components/ui/PromptModal';
import { toast } from '@/stores/uiStore';
import {
  pendingTradesFor,
  stickerReservationsFor,
  totalReservedAcrossTrades,
  useReservationStore,
  type PendingTrade,
  type ReservationItem,
  type StickerReservation,
  type TradeStickerRef,
} from '@/stores/reservationStore';

/** Default partner label used when the user pastes a list without naming someone. */
const DEFAULT_PARTNER = 'amigo';

export function ExchangePage() {
  const { t } = useTranslation();
  const { active, loading } = useActiveCollection();
  const { stickers, teams, inventory } = useCollectionData(active?.id ?? null);

  // ---- Reservations store (read + write) ----
  const items = useReservationStore((s) => s.items);
  const addStickerReservation = useReservationStore((s) => s.addStickerReservation);
  const removeStickerReservation = useReservationStore(
    (s) => s.removeStickerReservation
  );
  const addPendingTrade = useReservationStore((s) => s.addPendingTrade);
  const confirmTradeAction = useReservationStore((s) => s.confirmTrade);
  const cancelTradeAction = useReservationStore((s) => s.cancelTrade);

  // ---- Repetidas: sub-selection of which duplicates we'll offer. ----
  const [offeredDuplicates, setOfferedDuplicates] = useState<Set<string>>(new Set());
  const [offeredMissing, setOfferedMissing] = useState<Set<string>>(new Set());

  // ---- Reserve sticker modal ----
  const [reserveModalOpen, setReserveModalOpen] = useState(false);
  const [reserveTarget, setReserveTarget] = useState<{
    stickerId: string;
    code: string;
    displayPrefix: string;
    emoji: string;
  } | null>(null);

  // ---- Paste flow state ----
  const [partner, setPartner] = useState(DEFAULT_PARTNER);
  const [resolved, setResolved] = useState<ResolvedExchange | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const collectionId = active?.id ?? null;

  // ---- Derive "Repetidas" / "Faltan" groups from the active collection. ----
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

  // Pre-select all duplicates when the list first loads. Missing is empty
  // by default.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicatesKey, missingKey]);

  // ---- Reservations scoped to the current collection ----
  const pendingTrades = useMemo(
    () => (collectionId ? pendingTradesFor(items, collectionId) : []),
    [items, collectionId]
  );
  const stickerReservations = useMemo(
    () => (collectionId ? stickerReservationsFor(items, collectionId) : []),
    [items, collectionId]
  );

  if (loading) return <Spinner />;
  if (!active || !collectionId) return <NoActiveCollection />;

  const totalDuplicates = ownList.duplicates.reduce(
    (sum, g) => sum + g.numbers.length,
    0
  );
  const totalMissing = ownList.missing.reduce((sum, g) => sum + g.numbers.length, 0);
  const totalOfferedDup = offeredDuplicates.size;
  const totalOfferedMiss = offeredMissing.size;

  // ---- Handlers ----

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
    const text = buildExchangeText({ labels, collectionId, duplicates, missing });
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
    const text = buildExchangeText({ labels, collectionId, duplicates, missing });
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
    const text = buildExchangeText({ labels, collectionId, duplicates, missing });
    const ok = await shareOrCopy(text);
    if (!ok) toast.error(t('toast.error'));
    else toast.success(t('exchange.copied'));
  };

  // ---- Reserve sticker handlers ----

  const openReserveModal = (
    stickerId: string,
    code: string,
    displayPrefix: string,
    emoji: string
  ) => {
    setReserveTarget({ stickerId, code, displayPrefix, emoji });
    setReserveModalOpen(true);
  };

  const confirmReserveSticker = (partnerName: string) => {
    if (!reserveTarget) return;
    addStickerReservation({
      collectionId,
      stickerId: reserveTarget.stickerId,
      partner: partnerName,
      code: reserveTarget.code,
      displayPrefix: reserveTarget.displayPrefix,
      emoji: reserveTarget.emoji,
    });
    toast.success(t('exchange.reservations.reservedToast', { partner: partnerName }));
    setReserveModalOpen(false);
    setReserveTarget(null);
  };

  // ---- Paste handlers ----

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
    if (
      parsed.lines.length === 0 &&
      parsed.friendWants.length === 0 &&
      parsed.friendHasExtra.length === 0
    ) {
      setErrorMsg(t('exchange.pasteEmpty'));
      setResolved(null);
      return;
    }
    if (parsed.error === 'no-headers') {
      setErrorMsg(t('exchange.pasteNoHeaders'));
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

  // ---- Trade handlers (apply / reserve) ----

  /**
   * Build the current trade from the paste result. The 4-column
   * classification is computed by `resolveExchangeText`:
   *
   *   - `iCanGive`     = the user's duplicates the friend needs
   *   - `iNeed`        = the friend's duplicates the user needs
   *   - `myExtras`     = the user's duplicates the friend does NOT need
   *   - `friendExtras` = the friend's duplicates the user already has
   *
   * The actionable trade is `iCanGive` (what the user gives) + `iNeed`
   * (what the user receives). `myExtras` and `friendExtras` are
   * informational only.
   */
  const buildCurrentTrade = (): {
    give: TradeStickerRef[];
    receive: TradeStickerRef[];
  } | null => {
    if (!resolved) return null;
    const give: TradeStickerRef[] = resolved.iCanGive.map((r) => ({
      stickerId: r.stickerId,
      code: r.code,
      displayPrefix: r.prefix,
      emoji: r.emoji,
    }));
    const receive: TradeStickerRef[] = resolved.iNeed.map((r) => ({
      stickerId: r.stickerId,
      code: r.code,
      displayPrefix: r.prefix,
      emoji: r.emoji,
    }));
    return { give, receive };
  };

  const handleApplyTrade = async () => {
    const trade = buildCurrentTrade();
    if (!trade || (trade.give.length === 0 && trade.receive.length === 0)) {
      toast.error(t('exchange.tradeEmpty'));
      return;
    }
    try {
      for (const g of trade.give) {
        await adjustQuantity(collectionId, g.stickerId, -1);
      }
      for (const r of trade.receive) {
        await adjustQuantity(collectionId, r.stickerId, 1);
      }
      toast.success(
        t('exchange.tradeApplied', {
          give: trade.give.length,
          receive: trade.receive.length,
          partner: partner.trim() || t('exchange.partnerDefault'),
        })
      );
      setResolved(null);
      setPastedText('');
    } catch {
      toast.error(t('toast.error'));
    }
  };

  const handleReserveTrade = () => {
    const trade = buildCurrentTrade();
    if (!trade || (trade.give.length === 0 && trade.receive.length === 0)) {
      toast.error(t('exchange.reservations.reserveTradeEmpty'));
      return;
    }
    addPendingTrade({
      collectionId,
      partner: partner.trim() || t('exchange.partnerDefault'),
      give: trade.give,
      receive: trade.receive,
    });
    toast.success(
      t('exchange.reservations.tradeReservedToast', {
        partner: partner.trim() || t('exchange.partnerDefault'),
      })
    );
    setResolved(null);
    setPastedText('');
  };

  // ---- Pending trade confirm / cancel ----

  const handleConfirmTrade = async (tradeId: string) => {
    const trade = confirmTradeAction(tradeId);
    if (!trade || trade.kind !== 'trade') return;
    try {
      for (const g of trade.give) {
        await adjustQuantity(collectionId, g.stickerId, -1);
      }
      for (const r of trade.receive) {
        await adjustQuantity(collectionId, r.stickerId, 1);
      }
      toast.success(
        t('exchange.reservations.tradeConfirmed', {
          give: trade.give.length,
          receive: trade.receive.length,
          partner: trade.partner,
        })
      );
    } catch {
      toast.error(t('toast.error'));
      // Re-add the trade if inventory update failed.
      addPendingTrade({
        collectionId,
        partner: trade.partner,
        give: trade.give,
        receive: trade.receive,
        note: trade.note,
      });
    }
  };

  const handleCancelTrade = (tradeId: string) => {
    const trade = items.find(
      (it) => it.kind === 'trade' && it.tradeId === tradeId
    );
    cancelTradeAction(tradeId);
    if (trade && trade.kind === 'trade') {
      toast.info(
        t('exchange.reservations.tradeCancelled', { partner: trade.partner })
      );
    }
  };

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
        // Reservation hint for each chip:
        onReserve={openReserveModal}
        inventory={inventory}
        items={items}
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
        <section className="card flex flex-col gap-3" data-testid="share-both-section">
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
            <ResolvedSummary resolved={resolved} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={handleApplyTrade}
                disabled={
                  resolved.iNeed.length === 0 &&
                  resolved.iCanGive.length === 0
                }
                data-testid="paste-apply"
              >
                {t('exchange.tradeConfirm', {
                  give: resolved.iCanGive.length,
                  receive: resolved.iNeed.length,
                })}
              </button>
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={handleReserveTrade}
                disabled={
                  resolved.iNeed.length === 0 &&
                  resolved.iCanGive.length === 0
                }
                data-testid="paste-reserve"
              >
                {t('exchange.reservations.reserveForLater')}
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

      {/* ============== 5. RESERVATIONS ============== */}
      <ReservationsSection
        pendingTrades={pendingTrades}
        stickerReservations={stickerReservations}
        onConfirmTrade={handleConfirmTrade}
        onCancelTrade={handleCancelTrade}
        onCancelStickerReservation={(s) =>
          removeStickerReservation(collectionId, s.stickerId, s.partner)
        }
      />

      {/* ============== Reserve sticker modal ============== */}
      <PromptModal
        open={reserveModalOpen}
        title={t('exchange.reservations.reserveTitle')}
        label={t('exchange.reservations.reserveLabel')}
        placeholder={t('exchange.reservations.reservePlaceholder')}
        confirmLabel={t('exchange.reservations.reserveAction')}
        onConfirm={confirmReserveSticker}
        onCancel={() => {
          setReserveModalOpen(false);
          setReserveTarget(null);
        }}
      />
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
  /** Optional reservation opener for individual stickers. */
  onReserve?: (
    stickerId: string,
    code: string,
    displayPrefix: string,
    emoji: string
  ) => void;
  inventory?: Map<string, number>;
  items?: ReservationItem[];
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
  onReserve,
  inventory,
  items,
}: OwnSectionProps) {
  const { t } = useTranslation();
  const totalGroups = groups.length;
  const hasAny = totalGroups > 0;

  // For each sticker code in this section, how many copies does the user
  // currently have? Used to decide whether a "Reserve" affordance makes
  // sense (only for duplicates).
  const qtyByCode = useMemo(() => {
    const m = new Map<string, number>();
    if (!inventory || !items) return m;
    for (const g of groups) {
      for (const n of g.numbers) {
        const code = `${g.prefix}${n}`;
        const total = totalReservedAcrossTrades(items, inventory && 'collectionId' in inventory ? '' : '', code);
        // We don't actually need the reservation count for *enabling*
        // the reserve button — we need the inventory count, which is
        // passed in via `inventory` (the `items` prop is just for
        // badges). Keep the symbol but read inventory below.
        void total;
        m.set(code, inventory.get(code) ?? 0);
      }
    }
    return m;
  }, [groups, inventory, items]);

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
                const qty = qtyByCode.get(code) ?? 0;
                const canReserve = onReserve && qty > 1;
                return (
                  <li key={code} className="flex items-center gap-1">
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
                    {canReserve ? (
                      <button
                        type="button"
                        onClick={() => onReserve!(g.prefix + n, code, g.prefix, g.emoji)}
                        className="rounded-full border border-outline-variant
                          bg-surface-container px-2 py-0.5 text-label-sm
                          text-on-surface-variant hover:bg-surface-container-high"
                        aria-label={t('exchange.reservations.reserveAction')}
                        title={t('exchange.reservations.reserveAction')}
                        data-testid={`${testId}-reserve-${code}`}
                      >
                        {t('exchange.reservations.reserveShort')}
                      </button>
                    ) : null}
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
        <EmptyState title={t('exchange.noItems')} description={emptyHint} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Resolved summary after a paste                                       */
/* ------------------------------------------------------------------ */

function ResolvedSummary({ resolved }: { resolved: ResolvedExchange }) {
  const { t } = useTranslation();
  const iCanGive = resolved.iCanGive.length;
  const iNeed = resolved.iNeed.length;
  const myExtras = resolved.myExtras.length;
  const friendExtras = resolved.friendExtras.length;
  const unresolved = resolved.unresolved.length;
  const hasExtras = myExtras > 0 || friendExtras > 0;

  return (
    <div
      className="flex flex-col gap-2 rounded-md bg-surface-container-lowest p-3 text-body-sm"
      data-testid="paste-summary"
    >
      {/* Main trade line */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Bucket
          tone="give"
          title={t('exchange.resolved.iCanGive', { count: iCanGive })}
          emptyHint={t('exchange.resolved.iCanGiveEmpty')}
          items={resolved.iCanGive}
        />
        <Bucket
          tone="receive"
          title={t('exchange.resolved.iNeed', { count: iNeed })}
          emptyHint={t('exchange.resolved.iNeedEmpty')}
          items={resolved.iNeed}
        />
      </div>

      {/* Extras — informational only */}
      {hasExtras ? (
        <details
          className="rounded-md bg-surface-container-low p-2"
          data-testid="paste-summary-extras"
        >
          <summary className="cursor-pointer text-label-md text-on-surface-variant">
            {t('exchange.resolved.extrasSummary', {
              myExtras,
              friendExtras,
            })}
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Bucket
              tone="give-extra"
              title={t('exchange.resolved.myExtras', { count: myExtras })}
              emptyHint={t('exchange.resolved.myExtrasEmpty')}
              items={resolved.myExtras}
            />
            <Bucket
              tone="receive-extra"
              title={t('exchange.resolved.friendExtras', { count: friendExtras })}
              emptyHint={t('exchange.resolved.friendExtrasEmpty')}
              items={resolved.friendExtras}
            />
          </div>
        </details>
      ) : null}

      {unresolved > 0 ? (
        <p className="text-label-sm text-on-surface-variant" data-testid="paste-unresolved">
          {t('exchange.pasteUnresolved', { count: unresolved })}
        </p>
      ) : null}
    </div>
  );
}

function Bucket({
  tone,
  title,
  emptyHint,
  items,
}: {
  tone: 'give' | 'receive' | 'give-extra' | 'receive-extra';
  title: string;
  emptyHint: string;
  items: ResolvedSticker[];
}) {
  const isGive = tone === 'give' || tone === 'give-extra';
  const isMain = tone === 'give' || tone === 'receive';
  const toneClass = !isMain
    ? 'text-on-surface-variant'
    : isGive
      ? 'text-secondary'
      : 'text-primary';
  const bgClass = isMain ? 'bg-surface' : 'bg-surface-container-lowest';

  return (
    <div className={`flex flex-col gap-1 rounded-md ${bgClass} p-2`}>
      <p className={`text-label-md font-semibold ${toneClass}`}>{title}</p>
      {items.length === 0 ? (
        <p className="text-label-sm text-on-surface-variant">{emptyHint}</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {items.map((it) => (
            <li
              key={it.stickerId}
              className="rounded-md bg-surface-container px-1.5 py-0.5 font-mono text-label-md text-on-surface"
              data-testid={`paste-summary-chip-${it.code}`}
            >
              {it.code}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reservations section                                                  */
/* ------------------------------------------------------------------ */

interface ReservationsSectionProps {
  pendingTrades: PendingTrade[];
  stickerReservations: StickerReservation[];
  onConfirmTrade: (tradeId: string) => void;
  onCancelTrade: (tradeId: string) => void;
  onCancelStickerReservation: (s: StickerReservation) => void;
}

function ReservationsSection({
  pendingTrades,
  stickerReservations,
  onConfirmTrade,
  onCancelTrade,
  onCancelStickerReservation,
}: ReservationsSectionProps) {
  const { t } = useTranslation();
  const hasAnything = pendingTrades.length > 0 || stickerReservations.length > 0;

  return (
    <section className="card flex flex-col gap-3" data-testid="reservations-section">
      <header className="flex flex-col gap-1">
        <h2 className="text-label-md font-medium uppercase tracking-wide text-on-surface-variant">
          {t('exchange.reservations.title')}
        </h2>
        <p className="text-body-sm text-on-surface-variant">
          {t('exchange.reservations.description')}
        </p>
      </header>

      {!hasAnything ? (
        <EmptyState
          title={t('exchange.reservations.emptyTitle')}
          description={t('exchange.reservations.emptyHint')}
        />
      ) : null}

      {pendingTrades.length > 0 ? (
        <ul className="flex flex-col gap-2" data-testid="pending-trades-list">
          {pendingTrades.map((trade) => (
            <li
              key={trade.tradeId}
              className="flex flex-col gap-2 rounded-md border border-outline-variant
                bg-surface-container-lowest p-2"
              data-testid={`pending-trade-${trade.tradeId}`}
            >
              <header className="flex items-center justify-between gap-2">
                <p className="text-label-md font-semibold text-on-surface">
                  {t('exchange.reservations.withPartner', { partner: trade.partner })}
                </p>
              </header>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <TradeSide
                  tone="give"
                  title={t('exchange.reservations.youGive', {
                    count: trade.give.length,
                  })}
                  items={trade.give}
                />
                <TradeSide
                  tone="receive"
                  title={t('exchange.reservations.youReceive', {
                    count: trade.receive.length,
                  })}
                  items={trade.receive}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="btn-primary flex-1"
                  onClick={() => void onConfirmTrade(trade.tradeId)}
                  data-testid={`pending-trade-confirm-${trade.tradeId}`}
                >
                  {t('exchange.reservations.confirmTrade', {
                    give: trade.give.length,
                    receive: trade.receive.length,
                  })}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onCancelTrade(trade.tradeId)}
                  data-testid={`pending-trade-cancel-${trade.tradeId}`}
                >
                  {t('exchange.reservations.cancelTrade')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {stickerReservations.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="sticker-reservations-list">
          <h3 className="text-label-md font-medium uppercase tracking-wide text-on-surface-variant">
            {t('exchange.reservations.stickerReservationsTitle')}
          </h3>
          <ul className="flex flex-col gap-1">
            {stickerReservations.map((r) => (
              <li
                key={`${r.collectionId}-${r.stickerId}-${r.partner}`}
                className="flex items-center justify-between gap-2 rounded-md
                  bg-surface-container-lowest px-2 py-1 text-body-sm"
                data-testid={`sticker-reservation-${r.stickerId}-${r.partner}`}
              >
                <p className="flex items-center gap-1 font-mono">
                  <span aria-hidden="true">{r.emoji || '·'}</span>
                  <span>{r.code}</span>
                  <span className="text-on-surface-variant">×{r.count}</span>
                  <span className="text-on-surface-variant">—</span>
                  <span>{r.partner}</span>
                </p>
                <button
                  type="button"
                  className="text-label-sm text-error underline underline-offset-2"
                  onClick={() => onCancelStickerReservation(r)}
                  data-testid={`sticker-reservation-cancel-${r.stickerId}-${r.partner}`}
                >
                  {t('exchange.reservations.cancelSticker')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function TradeSide({
  tone,
  title,
  items,
}: {
  tone: 'give' | 'receive';
  title: string;
  items: TradeStickerRef[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <p
        className={`text-label-md font-semibold ${
          tone === 'give' ? 'text-secondary' : 'text-primary'
        }`}
      >
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-label-sm text-on-surface-variant">—</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {items.map((it) => (
            <li
              key={`${tone}-${it.stickerId}`}
              className="rounded-md bg-surface-container px-1.5 py-0.5 font-mono text-label-md text-on-surface"
            >
              <span aria-hidden="true">{it.emoji || '·'} </span>
              {it.code}
            </li>
          ))}
        </ul>
      )}
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
