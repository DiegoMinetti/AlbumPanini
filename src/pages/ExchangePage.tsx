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
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { toast } from '@/stores/uiStore';
import {
  pendingTradesFor,
  reservationForSlot,
  stickerReservationsFor,
  stickerSlotId,
  useReservationStore,
  type PendingTrade,
  type StickerReservation,
  type TradeStickerRef,
} from '@/stores/reservationStore';
import type { TournamentGroup } from '@/types/tournament';
import type { StoredTeam } from '@/types/collection';

/** Default partner label used when the user pastes a list without naming someone. */
const DEFAULT_PARTNER = 'amigo';

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

  // Tournament groups for the 2-level grouping (group → team).
  const tournamentGroups = active?.tournament?.groups ?? null;

  // Pick the codes (deduped) that the user has selected for sharing.
  // A code is "shareable" when at least one tradeable chip (copyIndex
  // >= 1) for that code is checked. The first copy (copyIndex 0) is the
  // album copy and never counts, even if it somehow ended up in the
  // selection set. Computed as a useMemo so the handler closures don't
  // capture stale state.
  const shareableDupCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const g of ownList.duplicates) {
      for (let i = 0; i < g.numbers.length; i++) {
        if (i === 0) continue;
        if (offeredDuplicates.has(`${g.prefix}${g.numbers[i]}#${i}`)) {
          codes.add(`${g.prefix}${g.numbers[i]}`);
        }
      }
    }
    return codes;
  }, [ownList.duplicates, offeredDuplicates]);

  const shareableMissCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const g of ownList.missing) {
      // Missing stickers have no inventory copy to trade away, so all
      // chips are "wishes" — the copyIndex-0 album copy distinction
      // doesn't apply. We just include any chip the user marked.
      for (let i = 0; i < g.numbers.length; i++) {
        if (offeredMissing.has(`${g.prefix}${g.numbers[i]}#${i}`)) {
          codes.add(`${g.prefix}${g.numbers[i]}`);
        }
      }
    }
    return codes;
  }, [ownList.missing, offeredMissing]);

  if (loading) return <Spinner />;
  if (!active || !collectionId) return <NoActiveCollection />;

  // Total counts of tradeable copies. For duplicates, the first entry
  // in each group (copyIndex 0) is the album copy and is never tradeable,
  // so we subtract one per group. For missing, every entry is a wish
  // (no inventory to lock away) so all of them count.
  const totalDuplicates = ownList.duplicates.reduce(
    (sum, g) => sum + Math.max(0, g.numbers.length - 1),
    0
  );
  const totalMissing = ownList.missing.reduce((sum, g) => sum + g.numbers.length, 0);

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
      headingDuplicates: t('exchange.sharedHeadingDuplicates'),
      headingMissing: t('exchange.sharedHeadingMissing'),
      headerTitle: active
        ? t('exchange.sharedHeaderTitle', { album: active.name })
        : t('exchange.sharedHeaderNoAlbum'),
    };
    const duplicates =
      section === 'duplicates'
        ? pickSelected(ownList.duplicates, [...shareableDupCodes])
        : [];
    const missing =
      section === 'missing' ? pickSelected(ownList.missing, [...shareableMissCodes]) : [];
    const text = buildExchangeText({ labels, collectionId, duplicates, missing });
    void writeClipboard(text).then((ok) => {
      if (!ok) toast.error(t('toast.error'));
      else toast.success(t('exchange.copied'));
    });
  };

  const handleCopyBoth = () => {
    const labels = {
      headingDuplicates: t('exchange.sharedHeadingDuplicates'),
      headingMissing: t('exchange.sharedHeadingMissing'),
      headerTitle: active
        ? t('exchange.sharedHeaderTitle', { album: active.name })
        : t('exchange.sharedHeaderNoAlbum'),
    };
    const duplicates = pickSelected(ownList.duplicates, [...shareableDupCodes]);
    const missing = pickSelected(ownList.missing, [...shareableMissCodes]);
    const text = buildExchangeText({ labels, collectionId, duplicates, missing });
    void writeClipboard(text).then((ok) => {
      if (!ok) toast.error(t('toast.error'));
      else toast.success(t('exchange.copied'));
    });
  };

  const handleShareBoth = async () => {
    const labels = {
      headingDuplicates: t('exchange.sharedHeadingDuplicates'),
      headingMissing: t('exchange.sharedHeadingMissing'),
      headerTitle: active
        ? t('exchange.sharedHeaderTitle', { album: active.name })
        : t('exchange.sharedHeaderNoAlbum'),
    };
    const duplicates = pickSelected(ownList.duplicates, [...shareableDupCodes]);
    const missing = pickSelected(ownList.missing, [...shareableMissCodes]);
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
      instanceId: stickerSlotId(
        collectionId,
        reserveTarget.stickerId,
        reserveTarget.copyIndex
      ),
      collectionId,
      stickerId: reserveTarget.stickerId,
      slotIndex: reserveTarget.copyIndex,
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
      {/* ============== 1. REPETIDAS / FALTAN (tabs) ============== */}
      <OwnTabsCard
        tournamentGroups={tournamentGroups}
        teams={teams}
        duplicates={ownList.duplicates}
        missing={ownList.missing}
        duplicatesCount={totalDuplicates}
        missingCount={totalMissing}
        duplicatesSelected={offeredDuplicates}
        missingSelected={offeredMissing}
        onToggleDuplicate={(code, idx) =>
          toggleOffered(code, idx, offeredDuplicates, setOfferedDuplicates)
        }
        onToggleMissing={(code, idx) =>
          toggleOffered(code, idx, offeredMissing, setOfferedMissing)
        }
        onSelectAllDuplicates={() => {
          const all = new Set<string>();
          ownList.duplicates.forEach((g) =>
            g.numbers.forEach((n, idx) => {
              all.add(`${g.prefix}${n}#${idx}`);
            })
          );
          setOfferedDuplicates(all);
        }}
        onSelectNoneDuplicates={() => setOfferedDuplicates(new Set())}
        onSelectAllMissing={() => {
          const all = new Set<string>();
          ownList.missing.forEach((g) =>
            g.numbers.forEach((n) => all.add(`${g.prefix}${n}#0`))
          );
          setOfferedMissing(all);
        }}
        onSelectNoneMissing={() => setOfferedMissing(new Set())}
        onCopyDuplicates={() => handleCopyOwn('duplicates')}
        onCopyMissing={() => handleCopyOwn('missing')}
        onCopyBoth={handleCopyBoth}
        onShareBoth={handleShareBoth}
        onReserve={openReserveModal}
        onReleaseSticker={releaseReservation}
        collectionId={collectionId}
        stickers={stickers.map((s) => ({
          id: s.id,
          code: s.code,
          normalizedCode: s.normalizedCode,
          teamId: s.teamId,
        }))}
      />

      {/* ============== 3. PASTE FROM A FRIEND ============== */}
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
/* Own Tabs Card — Repetidas / Faltan with 2-level grouping            */
/* ------------------------------------------------------------------ */

interface OwnTabsCardProps {
  tournamentGroups: TournamentGroup[] | null;
  teams: StoredTeam[];
  duplicates: { prefix: string; emoji: string; numbers: string[] }[];
  missing: { prefix: string; emoji: string; numbers: string[] }[];
  duplicatesCount: number;
  missingCount: number;
  duplicatesSelected: Set<string>;
  missingSelected: Set<string>;
  onToggleDuplicate: (code: string, copyIndex: number) => void;
  onToggleMissing: (code: string, copyIndex: number) => void;
  onSelectAllDuplicates: () => void;
  onSelectNoneDuplicates: () => void;
  onSelectAllMissing: () => void;
  onSelectNoneMissing: () => void;
  onCopyDuplicates: () => void;
  onCopyMissing: () => void;
  onCopyBoth: () => void;
  onShareBoth: () => void;
  onReserve: (
    stickerId: string,
    code: string,
    displayPrefix: string,
    emoji: string,
    copyIndex: number
  ) => void;
  onReleaseSticker: (instanceId: string) => void;
  collectionId: string;
  stickers: Array<{ id: string; code: string; teamId?: string }>;
}

type TabKey = 'duplicates' | 'missing';

/**
 * Group chips by (tournament group letter, then by team prefix).
 *
 * - When `tournamentGroups` is provided (collections like World Cup
 *   2026 that have a `tournament` block), chips are nested two levels
 *   deep: top-level = group letter (A, B, C…), sub-level = team
 *   prefix (USA, MEX, …).
 * - When the collection has no tournament, the whole list lives under
 *   a single synthetic "section" so the UI doesn't have to special-case
 *   the layout.
 */
type OwnListItem = { prefix: string; emoji: string; numbers: string[] };
type GroupedSection = {
  /** Either the group letter ("A") or null for the ungrouped fallback. */
  groupKey: string | null;
  /** Per-team buckets. */
  teams: { prefix: string; emoji: string; numbers: string[] }[];
};

function buildGroupedSections(
  groups: OwnListItem[],
  tournamentGroups: TournamentGroup[] | null
): GroupedSection[] {
  if (groups.length === 0) return [];
  const teamByPrefix = new Map<string, { emoji: string }>();
  for (const g of groups) teamByPrefix.set(g.prefix, { emoji: g.emoji });

  // Map prefix → group letter (if any).
  const prefixToGroup = new Map<string, string>();
  if (tournamentGroups) {
    for (const tg of tournamentGroups) {
      for (const teamId of tg.teamIds) {
        prefixToGroup.set(teamId.toUpperCase(), tg.id);
      }
    }
  }

  // Bucket groups by group letter.
  const byGroup = new Map<string, OwnListItem[]>();
  const ungrouped: OwnListItem[] = [];
  for (const g of groups) {
    const letter = prefixToGroup.get(g.prefix.toUpperCase());
    if (letter) {
      if (!byGroup.has(letter)) byGroup.set(letter, []);
      byGroup.get(letter)!.push(g);
    } else {
      ungrouped.push(g);
    }
  }

  // Build sections in group-letter order, then ungrouped at the end.
  const sections: GroupedSection[] = [];
  const orderedLetters = tournamentGroups?.map((g) => g.id) ?? [];
  for (const letter of orderedLetters) {
    const teamBuckets = byGroup.get(letter);
    if (!teamBuckets || teamBuckets.length === 0) continue;
    sections.push({
      groupKey: letter,
      teams: teamBuckets.map((b) => ({
        prefix: b.prefix,
        emoji: b.emoji,
        numbers: b.numbers,
      })),
    });
  }
  if (ungrouped.length > 0) {
    sections.push({
      groupKey: null,
      teams: ungrouped.map((b) => ({
        prefix: b.prefix,
        emoji: b.emoji,
        numbers: b.numbers,
      })),
    });
  }
  return sections;
}

function OwnTabsCard({
  tournamentGroups,
  duplicates,
  missing,
  duplicatesCount,
  missingCount,
  duplicatesSelected,
  missingSelected,
  onToggleDuplicate,
  onToggleMissing,
  onSelectAllDuplicates,
  onSelectNoneDuplicates,
  onSelectAllMissing,
  onSelectNoneMissing,
  onCopyDuplicates,
  onCopyMissing,
  onCopyBoth,
  onShareBoth,
  onReserve,
  onReleaseSticker,
  collectionId,
  stickers,
}: OwnTabsCardProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>('duplicates');

  const dupSections = useMemo(
    () => buildGroupedSections(duplicates, tournamentGroups),
    [duplicates, tournamentGroups]
  );
  const missSections = useMemo(
    () => buildGroupedSections(missing, tournamentGroups),
    [missing, tournamentGroups]
  );

  const isDup = tab === 'duplicates';
  const activeSections = isDup ? dupSections : missSections;
  const activeSelected = isDup ? duplicatesSelected : missingSelected;
  const emptyHint = isDup
    ? t('exchange.noDuplicatesHint')
    : t('exchange.noMissingHint');
  const testId = isDup ? 'duplicates-section' : 'missing-section';

  return (
    <section
      className="card flex flex-col gap-3"
      data-testid="own-tabs-card"
    >
      <SegmentedControl
        ariaLabel={t('exchange.tabsLabel')}
        value={tab}
        onChange={(v: TabKey) => setTab(v)}
        options={[
          {
            value: 'duplicates',
            label: (
              <span className="flex items-center justify-center gap-1.5">
                <span>{t('exchange.duplicatesTitle')}</span>
                <span className="rounded-full bg-surface-container-high px-1.5 text-label-sm">
                  {duplicatesCount}
                </span>
              </span>
            ),
          },
          {
            value: 'missing',
            label: (
              <span className="flex items-center justify-center gap-1.5">
                <span>{t('exchange.missingTitle')}</span>
                <span className="rounded-full bg-surface-container-high px-1.5 text-label-sm">
                  {missingCount}
                </span>
              </span>
            ),
          },
        ]}
      />

      <p
        className="text-body-sm text-on-surface-variant"
        data-testid={`${testId}-description`}
      >
        {isDup
          ? t('exchange.duplicatesDescription', { count: duplicatesCount })
          : t('exchange.missingDescription', { count: missingCount })}
      </p>

      {activeSections.length === 0 ? (
        <EmptyState title={t('exchange.noItems')} description={emptyHint} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={isDup ? onSelectAllDuplicates : onSelectAllMissing}
              data-testid={`${testId}-select-all`}
            >
              {t('exchange.selectAll')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={isDup ? onSelectNoneDuplicates : onSelectNoneMissing}
              data-testid={`${testId}-select-none`}
            >
              {t('exchange.selectNone')}
            </button>
          </div>

          <div
            className="flex flex-col gap-3"
            data-testid={`${testId}-groups`}
          >
            {activeSections.map((section) => (
              <TeamGroup
                key={section.groupKey ?? 'ungrouped'}
                section={section}
                testId={testId}
                selected={activeSelected}
                onToggle={isDup ? onToggleDuplicate : onToggleMissing}
                onReserve={onReserve}
                onReleaseSticker={onReleaseSticker}
                stickers={stickers}
                collectionId={collectionId}
                hideTeamHeaders={activeSections.length === 1 && section.groupKey === null}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={isDup ? onCopyDuplicates : onCopyMissing}
              disabled={activeSelected.size === 0}
              data-testid={`${testId}-copy`}
            >
              {activeSelected.size > 0
                ? isDup
                  ? t('exchange.copyDuplicatesSelected', {
                      count: activeSelected.size,
                    })
                  : t('exchange.copyMissingSelected', {
                      count: activeSelected.size,
                    })
                : isDup
                  ? t('exchange.copyDuplicates')
                  : t('exchange.copyMissing')}
            </button>
          </div>
        </>
      )}

      {/* Always-visible footer: copy both + share, even when one tab
       *  has no items. This is the discoverable entry point for the
       *  "share both" flow. */}
      <div className="flex flex-col gap-2 border-t border-outline-variant pt-3 sm:flex-row">
        <button
          type="button"
          className="btn-secondary flex-1"
          onClick={onCopyBoth}
          disabled={duplicatesCount === 0 && missingCount === 0}
          data-testid="share-both-copy"
        >
          {t('exchange.copyBoth')}
        </button>
        <button
          type="button"
          className="btn-secondary flex-1"
          onClick={onShareBoth}
          disabled={duplicatesCount === 0 && missingCount === 0}
          data-testid="share-both-share"
        >
          {t('exchange.shareBothShare')}
        </button>
      </div>
    </section>
  );
}

function TeamGroup({
  section,
  testId,
  selected,
  onToggle,
  onReserve,
  onReleaseSticker,
  stickers,
  collectionId,
  hideTeamHeaders,
}: {
  section: GroupedSection;
  testId: string;
  selected: Set<string>;
  onToggle: (code: string, copyIndex: number) => void;
  onReserve: (
    stickerId: string,
    code: string,
    displayPrefix: string,
    emoji: string,
    copyIndex: number
  ) => void;
  onReleaseSticker: (instanceId: string) => void;
  stickers: Array<{ id: string; code: string; teamId?: string }>;
  collectionId: string;
  hideTeamHeaders: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-col gap-2"
      data-testid={`${testId}-group-${section.groupKey ?? 'ungrouped'}`}
    >
      {section.groupKey !== null ? (
        <h3
          className="text-label-md font-semibold uppercase tracking-wide
            text-on-surface-variant"
          data-testid={`${testId}-group-header-${section.groupKey}`}
        >
          {t('exchange.groupHeader', { letter: section.groupKey })}
        </h3>
      ) : null}
      <div className="flex flex-col gap-1.5">
        {section.teams.map((teamBucket) => (
          <TeamRow
            key={teamBucket.prefix}
            testId={testId}
            prefix={teamBucket.prefix}
            emoji={teamBucket.emoji}
            numbers={teamBucket.numbers}
            selected={selected}
            onToggle={onToggle}
            onReserve={onReserve}
            onReleaseSticker={onReleaseSticker}
            stickers={stickers}
            collectionId={collectionId}
            hideHeader={hideTeamHeaders}
          />
        ))}
      </div>
    </div>
  );
}

function TeamRow({
  testId,
  prefix,
  emoji,
  numbers,
  selected,
  onToggle,
  onReserve,
  onReleaseSticker,
  stickers,
  collectionId,
  hideHeader,
}: {
  testId: string;
  prefix: string;
  emoji: string;
  numbers: string[];
  selected: Set<string>;
  onToggle: (code: string, copyIndex: number) => void;
  onReserve: (
    stickerId: string,
    code: string,
    displayPrefix: string,
    emoji: string,
    copyIndex: number
  ) => void;
  onReleaseSticker: (instanceId: string) => void;
  stickers: Array<{ id: string; code: string; normalizedCode?: string; teamId?: string }>;
  collectionId: string;
  hideHeader: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-col gap-1"
      data-testid={`${testId}-team-${prefix}`}
    >
      {!hideHeader ? (
        <p
          className="text-label-md font-semibold text-on-surface"
          data-testid={`${testId}-team-header-${prefix}`}
        >
          {emoji ? <span aria-hidden="true">{emoji} </span> : null}
          {prefix}
        </p>
      ) : null}
      <ul className="flex flex-wrap gap-2">
        {numbers.map((n, copyIndex) => {
          // The first copy (copyIndex 0) of every sticker is the
          // "album copy" — the one that goes into the physical album.
          // It is not tradable, so we don't render it at all here.
          // Only the extras (copyIndex >= 1) are visible.
          if (copyIndex === 0) return null;
          const code = `${prefix}${n}`;
          const key = `${code}#${copyIndex}`;
          // The displayed `code` is prefix+number with no separator (e.g.
          // "ARG1"). The stored sticker row keeps the original printed
          // code (e.g. "ARG 1") and a separate `normalizedCode` for
          // lookups. Match against either so the lookup survives
          // collections that don't have `normalizedCode` populated.
          const firstSticker = (stickers ?? []).find(
            (s) =>
              s.code === code ||
              s.normalizedCode === code ||
              s.code.replace(/\s+/g, '') === code
          );
          const reservation = reservationForSlot(
            useReservationStore.getState().items,
            collectionId,
            firstSticker?.id ?? code,
            copyIndex
          );
          const partner = reservation?.partner ?? null;
          const reservationKind = reservation?.kind ?? null;
          const reservationInstanceId = reservation?.instanceId ?? null;
          const isSelected = selected.has(key);
          const releaseLabel = t('exchange.reservations.releaseSticker');
          return (
            <li
              key={key}
              data-testid={`${testId}-chip-${key}`}
              className={`flex w-[72px] flex-col items-stretch overflow-hidden
                rounded-lg border transition-colors
                ${
                  isSelected
                    ? 'border-primary bg-primary-container text-on-primary-container'
                    : 'border-outline-variant bg-surface text-on-surface'
                }`}
            >
              {/* Top: the sticker chip (toggleable selection). */}
              <button
                type="button"
                onClick={() => onToggle(code, copyIndex)}
                aria-pressed={isSelected}
                aria-label={code}
                data-selected={isSelected}
                className={`flex w-full items-center justify-center gap-1
                  px-1.5 py-3 font-mono text-label-md transition-colors
                  ${
                    isSelected
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-surface text-on-surface hover:bg-surface-container'
                  }`}
              >
                {emoji ? (
                  <span aria-hidden="true" className="text-base leading-none">
                    {emoji}
                  </span>
                ) : null}
                <span className="truncate">{code}</span>
              </button>

              {/* Bottom: reservation action. Either a "Reserve" button
                  (free copy) or a "Para María" badge (taken copy). The
                  divider line gives the mini-card a clean two-row look. */}
              {partner ? (
                reservationKind === 'sticker' && reservationInstanceId ? (
                  <button
                    type="button"
                    onClick={() => onReleaseSticker(reservationInstanceId)}
                    aria-label={releaseLabel}
                    title={releaseLabel}
                    data-testid={`${testId}-reserved-${key}`}
                    className="w-full truncate border-t border-tertiary/30
                      bg-tertiary-container px-1.5 py-2 text-center
                      text-label-sm text-on-tertiary-container
                      underline-offset-2 hover:underline"
                  >
                    {t('exchange.reservations.reservedFor', { partner })}
                  </button>
                ) : (
                  <span
                    data-testid={`${testId}-reserved-${key}`}
                    className="w-full truncate border-t border-tertiary/30
                      bg-tertiary-container px-1.5 py-1.5 text-center
                      text-label-sm text-on-tertiary-container"
                  >
                    {t('exchange.reservations.reservedFor', { partner })}
                  </span>
                )
              ) : testId === 'duplicates-section' && firstSticker ? (
                <button
                  type="button"
                  onClick={() => {
                    onReserve(firstSticker.id, code, prefix, emoji, copyIndex);
                  }}
                  aria-label={t('exchange.reservations.reserveAction')}
                  title={t('exchange.reservations.reserveAction')}
                  data-testid={`${testId}-reserve-${key}`}
                  className="w-full truncate border-t
                    border-outline-variant bg-surface-container
                    px-1.5 py-2 text-center text-label-sm
                    text-on-surface-variant hover:bg-surface-container-high"
                >
                  {t('exchange.reservations.reserveShort')}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
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
            reservedPartner:
              reservationForSlot(
                useReservationStore.getState().items,
                collectionId,
                r.stickerId,
                0
              )?.partner ?? null,
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
