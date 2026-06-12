import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveCollection } from '@/hooks';
import { useCollectionData } from '@/hooks/useCollectionData';
import {
  buildOwnPosition,
  computeMatch,
  decodeExchange,
  generateExchangeQr,
  positionToPayload,
  scanQrFromImageData,
  type OwnPosition,
} from '@/services/qrService';
import {
  matchFiguritasAppList,
  type FiguritasAppMatchResult,
  type FiguritasAppStickerMatch,
} from '@/services/figuritasAppMatcher';
import { buildDuplicatesList } from '@/services/figuritasAppParser';
import { adjustQuantity } from '@/services/inventoryService';
import type { ExchangeMatch } from '@/types/exchange';
import type { StoredSticker, StoredTeam } from '@/types/collection';
import { Spinner } from '@/components/feedback/Spinner';
import { NoActiveCollection } from '@/components/collections/NoActiveCollection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { toast } from '@/stores/uiStore';
import { imageToImageData, loadImageFromBlob } from '@/utils/file';

/** Default partner label used when the user pastes a list without naming someone. */
const DEFAULT_PARTNER = 'figuritas.app';

/**
 * Exchange — redesigned as a 3-step flow that keeps the surface area tiny:
 *   1. Generate a QR / scan a friend's QR (mutual best trade).
 *   2. Copy your duplicates list with a single button (no textarea preview).
 *   3. Paste a friend's list straight from the clipboard and tap the chips
 *      you want to swap. Confirm in one tap to apply deltas to your
 *      inventory (decrement each "give", increment each "receive").
 */
export function ExchangePage() {
  const { t } = useTranslation();
  const { active, loading } = useActiveCollection();
  const { stickers, teams, inventory } = useCollectionData(active?.id ?? null);

  const [qr, setQr] = useState<string | null>(null);
  const [position, setPosition] = useState<OwnPosition | null>(null);
  const [pastedQr, setPastedQr] = useState('');
  const [match, setMatch] = useState<ExchangeMatch | null>(null);

  // ---- Figuritas App paste flow ----
  const [partner, setPartner] = useState(DEFAULT_PARTNER);
  const [figuritasResult, setFiguritasResult] =
    useState<FiguritasAppMatchResult | null>(null);
  const [figuritasLoading, setFiguritasLoading] = useState(false);

  const collectionId = active?.id ?? null;

  useEffect(() => {
    setQr(null);
    setPosition(null);
    setMatch(null);
    setFiguritasResult(null);
  }, [collectionId]);

  if (loading) return <Spinner />;
  if (!active || !collectionId) return <NoActiveCollection />;

  const stickerLabel = (id: string) => {
    const s = stickers.find((x) => x.id === id);
    return s ? `${s.code}` : id;
  };

  const handleGenerate = async () => {
    try {
      const pos = await buildOwnPosition(collectionId);
      setPosition(pos);
      const dataUrl = await generateExchangeQr(positionToPayload(pos));
      setQr(dataUrl);
    } catch {
      toast.error(t('toast.error'));
    }
  };

  const runQrMatch = async (code: string) => {
    try {
      const payload = decodeExchange(code);
      const mine = position ?? (await buildOwnPosition(collectionId));
      if (!position) setPosition(mine);
      const result = computeMatch(mine, payload);
      if (!result.sameCollection) {
        toast.error(t('exchange.sameCollectionRequired'));
        return;
      }
      if (result.versionMismatch) toast.warning(t('exchange.versionMismatch'));
      setMatch(result);
    } catch {
      toast.error(t('toast.error'));
    }
  };

  const handleUploadQr = async (file: File) => {
    try {
      const img = await loadImageFromBlob(file);
      const data = await imageToImageData(img);
      const text = data ? scanQrFromImageData(data) : null;
      if (!text) {
        toast.error(t('toast.error'));
        return;
      }
      await runQrMatch(text);
    } catch {
      toast.error(t('toast.error'));
    }
  };

  const analyzeClipboard = async () => {
    setFiguritasLoading(true);
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
        toast.error(t('exchange.figuritasApp.pasteClipboardUnsupported'));
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error(t('exchange.figuritasApp.pasteClipboardEmpty'));
        return;
      }
      const result = await matchFiguritasAppList(collectionId, text);
      setFiguritasResult(result);
      toast.success(t('exchange.figuritasApp.pasteClipboardOk'));
    } catch {
      toast.error(t('exchange.figuritasApp.pasteClipboardError'));
    } finally {
      setFiguritasLoading(false);
    }
  };

  const clearFiguritas = () => {
    setFiguritasResult(null);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 1. My QR / scan theirs */}
      <section className="card flex flex-col items-center gap-3">
        <h2 className="text-label-md font-medium uppercase tracking-wide text-on-surface-variant">
          {t('exchange.myCode')}
        </h2>
        {qr ? (
          <img
            src={qr}
            alt={t('exchange.myCode')}
            className="h-64 w-64 rounded-xl bg-surface p-2"
            data-testid="exchange-qr"
          />
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleGenerate()}
          >
            {t('exchange.generate')}
          </button>
        )}
        {position ? (
          <p className="text-label-md text-on-surface-variant">
            {t('exchange.summary', {
              give: position.duplicates.length,
              receive: position.missing.length,
            })}
          </p>
        ) : null}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-label-md font-medium uppercase tracking-wide text-on-surface-variant">
          {t('exchange.scanTheirs')}
        </h2>
        <p className="text-body-sm text-on-surface-variant">
          {t('exchange.figuritasApp.scanQrHint')}
        </p>
        <input
          type="text"
          className="input py-2 font-mono text-body-sm"
          placeholder={t('exchange.pasteCode')}
          value={pastedQr}
          onChange={(e) => setPastedQr(e.target.value)}
          aria-label={t('exchange.pasteCode')}
          data-testid="exchange-paste"
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={() => void runQrMatch(pastedQr)}
            disabled={pastedQr.trim().length === 0}
          >
            {t('exchange.decode')}
          </button>
          <label className="btn-secondary cursor-pointer">
            {t('exchange.scanUpload')}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUploadQr(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </section>

      {match ? (
        <section
          className="card flex flex-col gap-4"
          data-testid="exchange-result"
        >
          <p className="text-center text-title-sm font-semibold text-primary">
            {t('exchange.mutual', { count: match.mutualCount })}
          </p>
          <div className="grid grid-cols-2 gap-4 text-body-md">
            <MatchList
              title={t('exchange.iCanGive')}
              ids={match.iCanGive}
              label={stickerLabel}
              tone="secondary"
            />
            <MatchList
              title={t('exchange.iCanReceive')}
              ids={match.iCanReceive}
              label={stickerLabel}
              tone="primary"
            />
          </div>
        </section>
      ) : null}

      {position && position.duplicates.length === 0 ? (
        <EmptyState title={t('exchange.noDuplicates')} />
      ) : null}

      {/* 2. Copy my duplicates — single button, no preview */}
      <MyDuplicatesSection
        stickers={stickers}
        teams={teams}
        inventory={inventory}
      />

      {/* 3. Paste partner list from clipboard + simple compare */}
      <CompareSection
        result={figuritasResult}
        loading={figuritasLoading}
        partner={partner}
        onPartnerChange={setPartner}
        collectionId={collectionId}
        inventory={inventory}
        onPasteFromClipboard={() => void analyzeClipboard()}
        onClear={clearFiguritas}
      />
    </div>
  );
}

function MatchList({
  title,
  ids,
  label,
  tone,
}: {
  title: string;
  ids: string[];
  label: (id: string) => string;
  tone: 'primary' | 'secondary';
}) {
  const toneClass = tone === 'secondary' ? 'text-secondary' : 'text-primary';
  return (
    <div>
      <h3 className={`mb-2 font-semibold ${toneClass}`}>
        {title} ({ids.length})
      </h3>
      <ul className="flex flex-wrap gap-1">
        {ids.map((id) => (
          <li
            key={id}
            className="rounded-md bg-surface-container px-1.5 py-0.5 font-mono text-label-md text-on-surface"
          >
            {label(id)}
          </li>
        ))}
        {ids.length === 0 ? (
          <li className="text-on-surface-variant">—</li>
        ) : null}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* My duplicates — single copy button + simple visual breakdown        */
/* ------------------------------------------------------------------ */

interface MyDuplicatesSectionProps {
  stickers: StoredSticker[];
  teams: StoredTeam[];
  inventory: Map<string, number>;
}

function MyDuplicatesSection({
  stickers,
  teams,
  inventory,
}: MyDuplicatesSectionProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const built = useMemo(
    () =>
      buildDuplicatesList({
        stickers: stickers.map((s) => ({ code: s.code, teamId: s.teamId })),
        teams: teams.map((tm) => ({ id: tm.id, flag: tm.flag })),
        inventory,
      }),
    [stickers, teams, inventory]
  );

  const totalDuplicates = built.groups.reduce(
    (sum, g) => sum + g.numbers.length,
    0
  );

  const handleCopy = async () => {
    if (!built.text) {
      toast.error(t('exchange.figuritasApp.noDuplicates'));
      return;
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(built.text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = built.text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success(t('toast.copied'));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('toast.error'));
    }
  };

  return (
    <section
      className="card flex flex-col gap-3"
      data-testid="my-duplicates-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-label-md font-medium uppercase tracking-wide text-on-surface-variant">
          {t('exchange.figuritasApp.myDuplicatesTitle')}
        </h2>
        <p className="text-body-sm text-on-surface-variant">
          {t('exchange.figuritasApp.myDuplicatesDescription', {
            count: totalDuplicates,
          })}
        </p>
      </header>

      <button
        type="button"
        className="btn-primary"
        onClick={() => void handleCopy()}
        disabled={totalDuplicates === 0}
        data-testid="my-duplicates-copy"
      >
        {copied
          ? t('exchange.figuritasApp.copied')
          : t('exchange.figuritasApp.copyList')}
      </button>

      {totalDuplicates > 0 ? (
        <details
          className="rounded-md bg-surface-container-low p-2 text-body-sm"
          data-testid="my-duplicates-preview"
        >
          <summary className="cursor-pointer text-on-surface-variant">
            {t('exchange.figuritasApp.previewMyDuplicates')}
          </summary>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {built.groups.map((g) => (
              <li
                key={g.prefix}
                className="flex items-center gap-1 rounded-md
                  bg-surface-container px-1.5 py-0.5 font-mono
                  text-label-md text-on-surface"
              >
                <span aria-hidden="true">{g.emoji}</span>
                <span>{g.prefix}</span>
                <span className="text-on-surface-variant">·</span>
                <span>{g.numbers.length}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-label-sm text-on-surface-variant">
        {t('exchange.figuritasApp.shareHint')}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Compare with partner — clipboard paste + tap-to-trade chips         */
/* ------------------------------------------------------------------ */

interface CompareSectionProps {
  result: FiguritasAppMatchResult | null;
  loading: boolean;
  partner: string;
  onPartnerChange: (value: string) => void;
  collectionId: string;
  inventory: Map<string, number>;
  onPasteFromClipboard: () => void;
  onClear: () => void;
}

function CompareSection({
  result,
  loading,
  partner,
  onPartnerChange,
  collectionId,
  inventory,
  onPasteFromClipboard,
  onClear,
}: CompareSectionProps) {
  const { t } = useTranslation();
  const [giveIds, setGiveIds] = useState<Set<string>>(new Set());
  const [receiveIds, setReceiveIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Reset the in-progress trade whenever a new analysis is loaded.
  useEffect(() => {
    setGiveIds(new Set());
    setReceiveIds(new Set());
  }, [result]);

  const toggleGive = (id: string) =>
    setGiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleReceive = (id: string) =>
    setReceiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearSelection = () => {
    setGiveIds(new Set());
    setReceiveIds(new Set());
  };

  const totalGive = giveIds.size;
  const totalReceive = receiveIds.size;
  const balanced = totalGive > 0 && totalGive === totalReceive;
  const canConfirm = balanced && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      for (const id of giveIds) {
        await adjustQuantity(collectionId, id, -1);
      }
      for (const id of receiveIds) {
        await adjustQuantity(collectionId, id, 1);
      }
      toast.success(
        t('exchange.figuritasApp.tradeApplied', {
          give: totalGive,
          receive: totalReceive,
          partner: partner.trim() || DEFAULT_PARTNER,
        })
      );
      clearSelection();
    } catch {
      toast.error(t('toast.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card flex flex-col gap-3" data-testid="compare-section">
      <header className="flex flex-col gap-1">
        <h2 className="text-label-md font-medium uppercase tracking-wide text-on-surface-variant">
          {t('exchange.figuritasApp.compareTitle')}
        </h2>
        <p className="text-body-sm text-on-surface-variant">
          {t('exchange.figuritasApp.compareDescription')}
        </p>
        <a
          href="https://www.figuritas.app/es/descargar"
          target="_blank"
          rel="noopener noreferrer"
          className="text-label-md text-primary underline underline-offset-2"
        >
          {t('exchange.figuritasApp.downloadHint')}
        </a>
      </header>

      <label className="flex flex-col gap-1">
        <span className="text-label-md text-on-surface-variant">
          {t('exchange.figuritasApp.partnerLabel')}
        </span>
        <input
          type="text"
          className="input py-2"
          placeholder={t('exchange.figuritasApp.partnerPlaceholder')}
          value={partner}
          onChange={(e) => onPartnerChange(e.target.value)}
          aria-label={t('exchange.figuritasApp.partnerLabel')}
        />
      </label>

      <button
        type="button"
        className="btn-primary"
        onClick={onPasteFromClipboard}
        disabled={loading}
        data-testid="compare-paste"
      >
        {loading
          ? t('common.loading')
          : t('exchange.figuritasApp.pasteFromClipboard')}
      </button>
      <p className="text-label-sm text-on-surface-variant">
        {t('exchange.figuritasApp.pasteFromClipboardHint')}
      </p>

      {result ? (
        <button
          type="button"
          className="btn-secondary"
          onClick={onClear}
          data-testid="compare-clear"
        >
          {t('exchange.figuritasApp.clear')}
        </button>
      ) : null}

      {result ? (
        <CompareResult
          result={result}
          giveIds={giveIds}
          receiveIds={receiveIds}
          onToggleGive={toggleGive}
          onToggleReceive={toggleReceive}
          totalGive={totalGive}
          totalReceive={totalReceive}
          balanced={balanced}
          canConfirm={canConfirm}
          submitting={submitting}
          onConfirm={() => void handleConfirm()}
          onClearSelection={clearSelection}
        />
      ) : (
        <EmptyState
          title={t('exchange.figuritasApp.compareEmpty')}
          description={t('exchange.figuritasApp.compareEmptyHint')}
        />
      )}

      {result && balanced ? (
        <TradeInventoryPreview
          result={result}
          giveIds={giveIds}
          receiveIds={receiveIds}
          inventory={inventory}
        />
      ) : null}
    </section>
  );
}

interface CompareResultProps {
  result: FiguritasAppMatchResult;
  giveIds: Set<string>;
  receiveIds: Set<string>;
  onToggleGive: (id: string) => void;
  onToggleReceive: (id: string) => void;
  totalGive: number;
  totalReceive: number;
  balanced: boolean;
  canConfirm: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onClearSelection: () => void;
}

function CompareResult({
  result,
  giveIds,
  receiveIds,
  onToggleGive,
  onToggleReceive,
  totalGive,
  totalReceive,
  balanced,
  canConfirm,
  submitting,
  onConfirm,
  onClearSelection,
}: CompareResultProps) {
  const { t } = useTranslation();
  const noMatch = result.iCanGive.length === 0 && result.iNeed.length === 0;

  if (noMatch) {
    return <EmptyState title={t('exchange.figuritasApp.noMatch')} />;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="compare-result">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CompareColumn
          tone="give"
          title={t('exchange.figuritasApp.compareGiveHeader', {
            count: result.iCanGive.length,
          })}
          emptyHint={t('exchange.figuritasApp.tradeGiveEmpty')}
          items={result.iCanGive}
          selected={giveIds}
          onToggle={onToggleGive}
        />
        <CompareColumn
          tone="receive"
          title={t('exchange.figuritasApp.compareReceiveHeader', {
            count: result.iNeed.length,
          })}
          emptyHint={t('exchange.figuritasApp.tradeReceiveEmpty')}
          items={result.iNeed}
          selected={receiveIds}
          onToggle={onToggleReceive}
        />
      </div>

      <div
        className="flex flex-col gap-1 rounded-md bg-surface-container-lowest
          p-2 text-body-sm"
        data-testid="compare-summary"
      >
        <p className="flex items-center justify-between gap-2">
          <span className="text-secondary">
            {t('exchange.figuritasApp.tradeSummaryGive', { count: totalGive })}
          </span>
          <span className="text-on-surface-variant">↔</span>
          <span className="text-primary">
            {t('exchange.figuritasApp.tradeSummaryReceive', {
              count: totalReceive,
            })}
          </span>
        </p>
        {totalGive > 0 && totalReceive > 0 && !balanced ? (
          <p className="text-label-sm text-error" data-testid="compare-warning">
            {t('exchange.figuritasApp.tradeUnbalanced', {
              give: totalGive,
              receive: totalReceive,
            })}
          </p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={onConfirm}
          disabled={!canConfirm}
          data-testid="compare-confirm"
        >
          {submitting
            ? t('common.loading')
            : t('exchange.figuritasApp.tradeConfirm', {
                give: totalGive,
                receive: totalReceive,
              })}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={onClearSelection}
          disabled={totalGive === 0 && totalReceive === 0}
          data-testid="compare-clear-selection"
        >
          {t('exchange.figuritasApp.tradeClear')}
        </button>
      </div>
    </div>
  );
}

interface CompareColumnProps {
  tone: 'give' | 'receive';
  title: string;
  emptyHint: string;
  items: FiguritasAppStickerMatch[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function CompareColumn({
  tone,
  title,
  emptyHint,
  items,
  selected,
  onToggle,
}: CompareColumnProps) {
  const { t } = useTranslation();
  const titleClass = tone === 'give' ? 'text-secondary' : 'text-primary';

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-outline-variant
        bg-surface-container-lowest p-2"
      data-testid={`compare-column-${tone}`}
    >
      <h3 className={`text-label-md font-semibold ${titleClass}`}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-label-sm text-on-surface-variant">{emptyHint}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((s) => {
            const isSelected = selected.has(s.stickerId);
            return (
              <li key={`${tone}-${s.stickerId}`}>
                <button
                  type="button"
                  onClick={() => onToggle(s.stickerId)}
                  aria-pressed={isSelected}
                  aria-label={s.code}
                  title={
                    isSelected
                      ? t('exchange.figuritasApp.tapToRemove')
                      : t('exchange.figuritasApp.tapToSelect')
                  }
                  data-testid={`compare-chip-${tone}-${s.stickerId}`}
                  data-selected={isSelected}
                  className={`flex items-center gap-1 rounded-full border px-2.5
                    py-1 font-mono text-label-md transition-colors
                    ${
                      isSelected
                        ? tone === 'give'
                          ? 'border-secondary bg-secondary-container text-on-secondary-container'
                          : 'border-primary bg-primary-container text-on-primary-container'
                        : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-container'
                    }`}
                >
                  <span>{s.code}</span>
                  {tone === 'give' ? (
                    <span
                      className={`rounded-full px-1 text-label-sm ${
                        isSelected
                          ? 'bg-on-secondary-container/15 text-on-secondary-container'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {s.quantity}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface TradeInventoryPreviewProps {
  result: FiguritasAppMatchResult;
  giveIds: Set<string>;
  receiveIds: Set<string>;
  inventory: Map<string, number>;
}

/**
 * Tiny "before → after" sanity check for the trade-in-progress. Flags the
 * rare case where handing over a duplicate would leave a sticker with less
 * than one copy. Collapsed by default to keep the surface area small.
 */
function TradeInventoryPreview({
  result,
  giveIds,
  receiveIds,
  inventory,
}: TradeInventoryPreviewProps) {
  const { t } = useTranslation();
  const giveRows = result.iCanGive
    .filter((s) => giveIds.has(s.stickerId))
    .map((s) => {
      const current = inventory.get(s.stickerId) ?? 0;
      return { code: s.code, current, after: current - 1 };
    });
  const receiveRows = result.iNeed
    .filter((s) => receiveIds.has(s.stickerId))
    .map((s) => {
      const current = inventory.get(s.stickerId) ?? 0;
      return { code: s.code, current, after: current + 1 };
    });
  const unsafe = giveRows.some((r) => r.current - 1 < 1);
  const totalRows = giveRows.length + receiveRows.length;
  if (totalRows === 0) return null;

  return (
    <details
      className="rounded-md bg-surface-container-low p-2 text-body-sm"
      data-testid="compare-preview"
    >
      <summary className="cursor-pointer text-on-surface-variant">
        {t('exchange.figuritasApp.tradePreviewSummary', {
          give: giveRows.length,
          receive: receiveRows.length,
        })}
      </summary>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <h4 className="mb-1 text-label-md font-semibold text-secondary">
            {t('exchange.figuritasApp.tradeSummaryGive', {
              count: giveRows.length,
            })}
          </h4>
          <ul className="flex flex-col gap-0.5">
            {giveRows.map((r) => (
              <li
                key={r.code}
                className="flex items-center justify-between gap-2 font-mono text-label-sm"
              >
                <span>{r.code}</span>
                <span
                  className={unsafe ? 'text-error' : 'text-on-surface-variant'}
                >
                  {r.current} → {r.after}
                </span>
              </li>
            ))}
          </ul>
          {unsafe ? (
            <p
              className="mt-1 text-label-sm text-error"
              data-testid="compare-safety"
            >
              {t('exchange.figuritasApp.tradeSafetyWarning')}
            </p>
          ) : null}
        </div>
        <div>
          <h4 className="mb-1 text-label-md font-semibold text-primary">
            {t('exchange.figuritasApp.tradeSummaryReceive', {
              count: receiveRows.length,
            })}
          </h4>
          <ul className="flex flex-col gap-0.5">
            {receiveRows.map((r) => (
              <li
                key={r.code}
                className="flex items-center justify-between gap-2 font-mono text-label-sm"
              >
                <span>{r.code}</span>
                <span className="text-on-surface-variant">
                  {r.current} → {r.after}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
