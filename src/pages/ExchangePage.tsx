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
import { PromptModal } from '@/components/ui/PromptModal';
import { toast } from '@/stores/uiStore';
import {
  pendingTradesFor,
  reservedPartnerFor,
  stickerReservationsFor,
  useReservationStore,
  type PendingTrade,
  type StickerReservation,
  type TradeStickerRef,
} from '@/stores/reservationStore';

/** Default partner label used when the user pastes a list without naming someone. */
const DEFAULT_PARTNER = 'amigo';

/**
 * One rendered chip. A chip represents ONE physical copy of a sticker
 * (i.e. one slot in the inventory). When the user has 3 copies of USA15,
 * we render 3 chips, each independently tappable.
 */
interface OwnChip {
  code: string;
  /** 0-based index of this particular copy (0, 1, 2, …). */
  copyIndex: number;
  /** Total copies the user has of this code. */
  totalCopies: number;
  /** Partner name if THIS particular copy is reserved; null otherwise. */
  reservedPartner: string | null;
}

export function ExchangePage() {
  const { t } = useTranslation();
  const { active, loading } = useActiveCollection();
  const { stickers, teams, inventory } = useCollectionData(active?.id ?? null);

  // ---- Reservations store (read + write) ----
  const items = useReservationStore((s) => s.items);
  const addStickerReservation = useReservationStore((s) => s.addStickerReservation);
  const removeStickerReservationByInstance = useReservationStore(
    (s) => s.removeStickerReservationByInstance
  );
  const addPendingTrade = useReservationStore((s) => s.addPendingTrade);
  const confirmTradeAction = useReservationStore((s) => s.confirmTrade);
  const cancelTradeAction = useReservationStore((s) => s.cancelTrade);

  // ---- Repetidas: per-copy sub-selection (codes + copyIndex) ----
  const [offeredDuplicates, setOfferedDuplicates] = useState<Set<string>>(
    new Set()
  );
  const [offeredMissing, setOfferedMissing] = useState<Set<string>>(new Set());

  // ---- Reserve sticker modal ----
  const [reserveModalOpen, setReserveModalOpen] = useState(false);
  const [reserveTarget, setReserveTarget] = useState<{
    stickerId: string;
    code: string;
    displayPrefix: string;
    emoji: string;
    copyIndex: number;
  } | null>(null);

  // ---- Paste flow state ----
  const [partner, setPartner] = useState(DEFAULT_PARTNER);
  const [resolved, setResolved] = useState<ResolvedExchange | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Per-resolved-sticker sub-selection. Default: all selected.
  const [selectedGive, setSelectedGive] = useState<Set<string>>(new Set());
  const [selectedReceive, setSelectedReceive] = useState<Set<string>>(new Set());

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

  // Per-sticker inventory: how many copies of `code` does the user have?
  const myQty = (code: string) => inventory.get(code) ?? 0;

  // Re-seed the selection whenever the duplicates / missing shape
  // changes. Each instance of a sticker is a separate selectable chip,
  // so the selection set carries `code#index`. We use a stable
  // signature key (prefix + numbers) so React only re-runs this when
  // the actual set of duplicates or missing changes.
  const duplicatesKey = ownList.duplicates
    .map((g) => g.prefix + g.numbers.join(','))
    .join('|');
  const missingKey = ownList.missing
    .map((g) => g.prefix + g.numbers.join(','))
    .join('|');
  useEffect(() => {
    const seed = new Set<string>();
    ownList.duplicates.forEach((g) =>
      g.numbers.forEach((n, idx) => {
        seed.add(`${g.prefix}${n}#${idx}`);
      })
    );
    setOfferedDuplicates(seed);
    setOfferedMissing(new Set());
    setResolved(null);
    setPastedText('');
    setErrorMsg(null);
    // We intentionally re-seed the selection only when the *shape* of
    // duplicates/missing changes (captured in `duplicatesKey` /
    // `missingKey`) — not on every inventory write.
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

  // Total counts (sum of copies, not distinct stickers).
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
    idx: number,
    set: Set<string>,
    setter: (next: Set<string>) => void
  ) => {
    const key = `${code}#${idx}`;
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const handleCopyOwn = (section: ExchangeSection) => {
    const labels = {
      openInApp: t('exchange.openInApp'),
    };
    const allDupCodes = ownList.duplicates.flatMap((g) =>
      g.numbers.map((n) => `${g.prefix}${n}`)
    );
    const allMissCodes = ownList.missing.flatMap((g) =>
      g.numbers.map((n) => `${g.prefix}${n}`)
    );
    const selectedDup = allDupCodes.filter((c) =>
      offeredDuplicates.has(`${c}#0`) || offeredDuplicates.has(`${c}#1`) || offeredDuplicates.has(`${c}#2`)
    );
    const selectedMiss = allMissCodes.filter((c) =>
      offeredMissing.has(`${c}#0`)
    );
    const duplicates =
      section === 'duplicates'
        ? pickSelected(ownList.duplicates, selectedDup)
        : [];
    const missing =
      section === 'missing' ? pickSelected(ownList.missing, selectedMiss) : [];
    const text = buildExchangeText({ labels, collectionId, duplicates, missing });
    void writeClipboard(text).then((ok) => {
      if (!ok) toast.error(t('toast.error'));
      else toast.success(t('exchange.copied'));
    });
  };

  const handleCopyBoth = () => {
    const labels = { openInApp: t('exchange.openInApp') };
    const allDupCodes = ownList.duplicates.flatMap((g) =>
      g.numbers.map((n) => `${g.prefix}${n}`)
    );
    const allMissCodes = ownList.missing.flatMap((g) =>
      g.numbers.map((n) => `${g.prefix}${n}`)
    );
    const selectedDup = allDupCodes.filter((c) =>
      offeredDuplicates.has(`${c}#0`) ||
      offeredDuplicates.has(`${c}#1`) ||
      offeredDuplicates.has(`${c}#2`)
    );
    const selectedMiss = allMissCodes.filter((c) =>
      offeredMissing.has(`${c}#0`)
    );
    const duplicates = pickSelected(ownList.duplicates, selectedDup);
    const missing = pickSelected(ownList.missing, selectedMiss);
    const text = buildExchangeText({ labels, collectionId, duplicates, missing });
    void writeClipboard(text).then((ok) => {
      if (!ok) toast.error(t('toast.error'));
      else toast.success(t('exchange.copied'));
    });
  };

  const handleShareBoth = async () => {
    const labels = { openInApp: t('exchange.openInApp') };
    const allDupCodes = ownList.duplicates.flatMap((g) =>
      g.numbers.map((n) => `${g.prefix}${n}`)
    );
    const allMissCodes = ownList.missing.flatMap((g) =>
      g.numbers.map((n) => `${g.prefix}${n}`)
    );
    const selectedDup = allDupCodes.filter((c) =>
      offeredDuplicates.has(`${c}#0`) ||
      offeredDuplicates.has(`${c}#1`) ||
      offeredDuplicates.has(`${c}#2`)
    );
    const selectedMiss = allMissCodes.filter((c) =>
      offeredMissing.has(`${c}#0`)
    );
    const duplicates = pickSelected(ownList.duplicates, selectedDup);
    const missing = pickSelected(ownList.missing, selectedMiss);
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
    emoji: string,
    copyIndex: number
  ) => {
    setReserveTarget({ stickerId, code, displayPrefix, emoji, copyIndex });
    setReserveModalOpen(true);
  };

  const confirmReserveSticker = (partnerName: string) => {
    if (!reserveTarget) return;
    addStickerReservation({
      instanceId: `${collectionId}::${reserveTarget.stickerId}::${reserveTarget.copyIndex}::${Date.now()}`,
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

  const releaseReservation = (instanceId: string) => {
    removeStickerReservationByInstance(instanceId);
    toast.info(t('exchange.reservations.releasedToast'));
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
    // Default: all selectable. Re-expand on each new paste.
    const newGive = new Set<string>();
    out.iCanGive.forEach((s) => {
      const copies = totalCopies(s.code);
      for (let i = 0; i < copies; i++) newGive.add(`${s.code}#${i}`);
    });
    const newReceive = new Set<string>();
    out.iNeed.forEach((s) => {
      newReceive.add(`${s.code}#0`);
    });
    setSelectedGive(newGive);
    setSelectedReceive(newReceive);
    toast.success(t('exchange.pasteAnalyzed'));
  };

  const totalCopies = (code: string): number => {
    // A sticker can have at most `inventory[code]` copies. We don't
    // track per-instance — every inventory count above 1 is rendered
    // as that many chips.
    return myQty(code);
  };

  const handleClearPaste = () => {
    setResolved(null);
    setPastedText('');
    setErrorMsg(null);
    setSelectedGive(new Set());
    setSelectedReceive(new Set());
  };

  // ---- Trade handlers (apply / reserve) ----

  const buildCurrentTrade = (): {
    give: TradeStickerRef[];
    receive: TradeStickerRef[];
  } | null => {
    if (!resolved) return null;
    // give = iCanGive items where at least one copy is selected.
    const give: TradeStickerRef[] = [];
    for (const r of resolved.iCanGive) {
      const copies = totalCopies(r.code);
      for (let i = 0; i < copies; i++) {
        if (selectedGive.has(`${r.code}#${i}`)) {
          give.push({
            stickerId: r.stickerId,
            code: r.code,
            displayPrefix: r.prefix,
            emoji: r.emoji,
          });
        }
      }
    }
    const receive: TradeStickerRef[] = [];
    for (const r of resolved.iNeed) {
      if (selectedReceive.has(`${r.code}#0`)) {
        receive.push({
          stickerId: r.stickerId,
          code: r.code,
          displayPrefix: r.prefix,
          emoji: r.emoji,
        });
      }
    }
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
        onToggle={(code, idx) =>
          toggleOffered(code, idx, offeredDuplicates, setOfferedDuplicates)
        }
        copyLabel={t('exchange.copyDuplicates')}
        copyLabelSelected={t('exchange.copyDuplicatesSelected', { count: totalOfferedDup })}
        onCopy={() => handleCopyOwn('duplicates')}
        onSelectAll={() => {
          const all = new Set<string>();
          ownList.duplicates.forEach((g) =>
            g.numbers.forEach((n, idx) => {
              all.add(`${g.prefix}${n}#${idx}`);
            })
          );
          setOfferedDuplicates(all);
        }}
        onSelectNone={() => setOfferedDuplicates(new Set())}
        emptyHint={t('exchange.noDuplicatesHint')}
        testId="duplicates-section"
        shareDisabled={totalOfferedDup === 0}
        onReserve={openReserveModal}
        collectionId={collectionId}
        stickers={stickers.map((s) => ({ id: s.id, code: s.code, teamId: s.teamId }))}
      />

      {/* ============== 2. FALTAN ============== */}
      <OwnSection
        title={t('exchange.missingTitle')}
        description={t('exchange.missingDescription', { count: totalMissing })}
        groups={ownList.missing}
        selected={offeredMissing}
        onToggle={(code, idx) =>
          toggleOffered(code, idx, offeredMissing, setOfferedMissing)
        }
        copyLabel={t('exchange.copyMissing')}
        copyLabelSelected={t('exchange.copyMissingSelected', { count: totalOfferedMiss })}
        onCopy={() => handleCopyOwn('missing')}
        onSelectAll={() => {
          const all = new Set<string>();
          ownList.missing.forEach((g) =>
            g.numbers.forEach((n) => all.add(`${g.prefix}${n}#0`))
          );
          setOfferedMissing(all);
        }}
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
            <ResolvedSummary
              resolved={resolved}
              selectedGive={selectedGive}
              selectedReceive={selectedReceive}
              onToggleGive={(code, idx) => {
                setSelectedGive((prev) => {
                  const next = new Set(prev);
                  const key = `${code}#${idx}`;
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
              onToggleReceive={(code) => {
                setSelectedReceive((prev) => {
                  const next = new Set(prev);
                  const key = `${code}#0`;
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
              collectionId={collectionId}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={handleApplyTrade}
                disabled={
                  buildCurrentTrade()?.give.length === 0 &&
                  buildCurrentTrade()?.receive.length === 0
                }
                data-testid="paste-apply"
              >
                {t('exchange.tradeConfirm', {
                  give: buildCurrentTrade()?.give.length ?? 0,
                  receive: buildCurrentTrade()?.receive.length ?? 0,
                })}
              </button>
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={handleReserveTrade}
                disabled={
                  buildCurrentTrade()?.give.length === 0 &&
                  buildCurrentTrade()?.receive.length === 0
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
        onReleaseSticker={releaseReservation}
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
  selected: Set<string>; // keys: `${code}#${copyIndex}`
  onToggle: (code: string, copyIndex: number) => void;
  copyLabel: string;
  copyLabelSelected: string;
  onCopy: () => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  emptyHint: string;
  testId: string;
  shareDisabled: boolean;
  onReserve?: (
    stickerId: string,
    code: string,
    displayPrefix: string,
    emoji: string,
    copyIndex: number
  ) => void;
  collectionId?: string;
  /** All stickers in the active collection — used to look up the
   *  stickerId from a chip code, so the reserve handler can build a
   *  complete reservation. */
  stickers?: Array<{ id: string; code: string; teamId?: string }>;
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
  collectionId,
  stickers,
}: OwnSectionProps) {
  const { t } = useTranslation();
  const totalGroups = groups.length;
  const hasAny = totalGroups > 0;

  // Render one chip per inventory copy. The `buildOwnList` helper
  // emits duplicate numbers N times when the user has N copies, so
  // iterating `g.numbers` already gives us one entry per slot.
  const chips: OwnChip[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.numbers.length; i++) {
      const n = g.numbers[i];
      const code = `${g.prefix}${n}`;
      // Pull the partner label for THIS specific copy index. We can't
      // get the exact instanceId from the chip alone, so we use the
      // helper that returns a single label per stickerId (any partner).
      // Future refinement: thread the instanceId through here.
      const partner = collectionId
        ? reservedPartnerFor(
            useReservationStore.getState().items,
            collectionId,
            code
          )
        : null;
      chips.push({
        code,
        copyIndex: i,
        totalCopies: g.numbers.length,
        reservedPartner: partner,
      });
    }
  }

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
            {chips.map((chip) => (
              <li
                key={`${chip.code}#${chip.copyIndex}`}
                className="flex flex-col items-start gap-1"
                data-testid={`${testId}-chip-${chip.code}#${chip.copyIndex}`}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onToggle(chip.code, chip.copyIndex)}
                    aria-pressed={selected.has(`${chip.code}#${chip.copyIndex}`)}
                    aria-label={chip.code}
                    data-selected={selected.has(`${chip.code}#${chip.copyIndex}`)}
                    className={`flex items-center gap-1 rounded-full border px-2.5
                      py-1 font-mono text-label-md transition-colors
                      ${
                        selected.has(`${chip.code}#${chip.copyIndex}`)
                          ? 'border-primary bg-primary-container text-on-primary-container'
                          : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-container'
                      }`}
                  >
                    <span aria-hidden="true">{groups[0]?.emoji || '·'}</span>
                    <span>{chip.code}</span>
                  </button>
                  {onReserve && !chip.reservedPartner && testId === 'duplicates-section' ? (
                    <button
                      type="button"
                      onClick={() => {
                        // Resolve stickerId from the first matching
                        // sticker (we don't track it on the chip — the
                        // buildOwnList output groups by prefix, so we
                        // look it up by code in the inventory-derived
                        // data. The caller will pass the right
                        // stickerId via the openReserveModal prop.)
                        const firstSticker = (stickers ?? []).find(
                          (s) => s.code === chip.code
                        );
                        if (firstSticker) {
                          onReserve(
                            firstSticker.id,
                            chip.code,
                            firstSticker.teamId ?? '',
                            groups[0]?.emoji ?? '',
                            chip.copyIndex
                          );
                        }
                      }}
                      className="rounded-full border border-outline-variant
                        bg-surface-container px-2 py-0.5 text-label-sm
                        text-on-surface-variant hover:bg-surface-container-high"
                      aria-label={t('exchange.reservations.reserveAction')}
                      title={t('exchange.reservations.reserveAction')}
                      data-testid={`${testId}-reserve-${chip.code}#${chip.copyIndex}`}
                    >
                      {t('exchange.reservations.reserveShort')}
                    </button>
                  ) : null}
                </div>
                {chip.reservedPartner ? (
                  <span
                    className="rounded-full bg-tertiary-container
                      px-1.5 py-0.5 text-label-sm text-on-tertiary-container"
                    data-testid={`${testId}-reserved-${chip.code}#${chip.copyIndex}`}
                  >
                    {t('exchange.reservations.reservedBadge', {
                      partner: chip.reservedPartner,
                    })}
                  </span>
                ) : null}
              </li>
            ))}
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

interface ResolvedSummaryProps {
  resolved: ResolvedExchange;
  selectedGive: Set<string>;
  selectedReceive: Set<string>;
  onToggleGive: (code: string, copyIndex: number) => void;
  onToggleReceive: (code: string) => void;
  collectionId: string;
}

function ResolvedSummary({
  resolved,
  selectedGive,
  selectedReceive,
  onToggleGive,
  onToggleReceive,
  collectionId,
}: ResolvedSummaryProps) {
  const { t } = useTranslation();
  const iCanGiveCount = resolved.iCanGive.length;
  const iNeedCount = resolved.iNeed.length;
  const myExtras = resolved.myExtras.length;
  const friendExtras = resolved.friendExtras.length;
  const unresolved = resolved.unresolved.length;
  const hasExtras = myExtras > 0 || friendExtras > 0;

  return (
    <div
      className="flex flex-col gap-2 rounded-md bg-surface-container-lowest p-3 text-body-sm"
      data-testid="paste-summary"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Bucket
          tone="give"
          title={t('exchange.resolved.iCanGive', { count: iCanGiveCount })}
          emptyHint={t('exchange.resolved.iCanGiveEmpty')}
          items={resolved.iCanGive.map((r) => ({
            ...r,
            chipKey: `${r.code}#0`,
            selected: selectedGive.has(`${r.code}#0`),
            onToggle: () => onToggleGive(r.code, 0),
            reservedPartner: reservedPartnerFor(
              useReservationStore.getState().items,
              collectionId,
              r.code
            ),
          }))}
        />
        <Bucket
          tone="receive"
          title={t('exchange.resolved.iNeed', { count: iNeedCount })}
          emptyHint={t('exchange.resolved.iNeedEmpty')}
          items={resolved.iNeed.map((r) => ({
            ...r,
            chipKey: `${r.code}#0`,
            selected: selectedReceive.has(`${r.code}#0`),
            onToggle: () => onToggleReceive(r.code),
            reservedPartner: null,
          }))}
        />
      </div>

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
              items={resolved.myExtras.map((r) => ({
                ...r,
                chipKey: `${r.code}#0`,
                selected: false,
                onToggle: () => undefined,
                reservedPartner: null,
              }))}
            />
            <Bucket
              tone="receive-extra"
              title={t('exchange.resolved.friendExtras', { count: friendExtras })}
              emptyHint={t('exchange.resolved.friendExtrasEmpty')}
              items={resolved.friendExtras.map((r) => ({
                ...r,
                chipKey: `${r.code}#0`,
                selected: false,
                onToggle: () => undefined,
                reservedPartner: null,
              }))}
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

interface BucketChip {
  stickerId: string;
  code: string;
  prefix: string;
  number: string;
  emoji: string;
  chipKey: string;
  selected: boolean;
  onToggle: () => void;
  reservedPartner: string | null;
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
  items: BucketChip[];
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
        <ul className="flex flex-col gap-1">
          {items.map((it) => (
            <li
              key={it.chipKey}
              className="flex flex-col items-start gap-0.5"
              data-testid={`paste-summary-row-${it.code}`}
            >
              {isMain ? (
                <button
                  type="button"
                  onClick={it.onToggle}
                  aria-pressed={it.selected}
                  className={`flex items-center gap-1 rounded-md border
                    px-1.5 py-0.5 font-mono text-label-md transition-colors
                    ${
                      it.selected
                        ? isGive
                          ? 'border-secondary bg-secondary-container text-on-secondary-container'
                          : 'border-primary bg-primary-container text-on-primary-container'
                        : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-container'
                    }`}
                >
                  <span aria-hidden="true">{it.emoji || '·'}</span>
                  <span>{it.code}</span>
                </button>
              ) : (
                <span className="flex items-center gap-1 rounded-md border border-outline-variant bg-surface px-1.5 py-0.5 font-mono text-label-md text-on-surface-variant">
                  <span aria-hidden="true">{it.emoji || '·'}</span>
                  <span>{it.code}</span>
                </span>
              )}
              {it.reservedPartner ? (
                <span
                  className="rounded-full bg-tertiary-container
                    px-1.5 py-0.5 text-label-sm text-on-tertiary-container"
                >
                  {it.reservedPartner}
                </span>
              ) : null}
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
  onReleaseSticker: (instanceId: string) => void;
}

function ReservationsSection({
  pendingTrades,
  stickerReservations,
  onConfirmTrade,
  onCancelTrade,
  onReleaseSticker,
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
                key={r.instanceId}
                className="flex items-center justify-between gap-2 rounded-md
                  bg-surface-container-lowest px-2 py-1 text-body-sm"
                data-testid={`sticker-reservation-${r.instanceId}`}
              >
                <p className="flex items-center gap-1 font-mono">
                  <span aria-hidden="true">{r.emoji || '·'}</span>
                  <span>{r.code}</span>
                  <span className="text-on-surface-variant">—</span>
                  <span>{r.partner}</span>
                </p>
                <button
                  type="button"
                  className="text-label-sm text-error underline underline-offset-2"
                  onClick={() => onReleaseSticker(r.instanceId)}
                  data-testid={`sticker-reservation-release-${r.instanceId}`}
                >
                  {t('exchange.reservations.releaseSticker')}
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
  selectedCodes: string[]
): { prefix: string; emoji: string; numbers: string[] }[] {
  const selected = new Set(selectedCodes);
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
