import { useEffect, useMemo, useRef, useState } from 'react';
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
  type FiguritasAppLineMatch,
  type FiguritasAppMatchResult,
  type FiguritasAppStickerMatch,
} from '@/services/figuritasAppMatcher';
import { buildDuplicatesList } from '@/services/figuritasAppParser';
import {
  totalReservedFor,
  useReservationStore,
} from '@/stores/reservationStore';
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
 * Exchange — M3 tokens, redesigned with a "Figuritas App" paste section that
 * tells the user at a glance which of their duplicates can be traded and lets
 * them emit a `figuritas.app`–style list of their own duplicates to share.
 */
export function ExchangePage() {
  const { t } = useTranslation();
  const { active, loading } = useActiveCollection();
  const { stickers, teams, inventory } = useCollectionData(
    active?.id ?? null
  );

  const [qr, setQr] = useState<string | null>(null);
  const [position, setPosition] = useState<OwnPosition | null>(null);
  const [pasted, setPasted] = useState('');
  const [match, setMatch] = useState<ExchangeMatch | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- Figuritas App paste flow ----
  const [figuritasText, setFiguritasText] = useState('');
  const [figuritasPartner, setFiguritasPartner] = useState(DEFAULT_PARTNER);
  const [figuritasResult, setFiguritasResult] =
    useState<FiguritasAppMatchResult | null>(null);
  const [figuritasLoading, setFiguritasLoading] = useState(false);
  const reservations = useReservationStore((s) => s.reservations);

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

  const runMatch = async (code: string) => {
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

  const handleUpload = async (file: File) => {
    try {
      const img = await loadImageFromBlob(file);
      const data = await imageToImageData(img);
      const text = data ? scanQrFromImageData(data) : null;
      if (!text) {
        toast.error(t('toast.error'));
        return;
      }
      await runMatch(text);
    } catch {
      toast.error(t('toast.error'));
    }
  };

  const handleAnalyzeFiguritas = async () => {
    if (!figuritasText.trim()) return;
    setFiguritasLoading(true);
    try {
      const result = await matchFiguritasAppList(collectionId, figuritasText);
      setFiguritasResult(result);
    } catch {
      toast.error(t('toast.error'));
    } finally {
      setFiguritasLoading(false);
    }
  };

  const handleClearFiguritas = () => {
    setFiguritasText('');
    setFiguritasResult(null);
  };

  return (
    <div className="flex flex-col gap-5">
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
        <textarea
          className="input min-h-[80px] resize-y py-2 font-mono text-body-sm"
          placeholder={t('exchange.pasteCode')}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          aria-label={t('exchange.pasteCode')}
          data-testid="exchange-paste"
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={() => void runMatch(pasted)}
            disabled={pasted.trim().length === 0}
          >
            {t('exchange.decode')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            {t('exchange.scanUpload')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = '';
            }}
          />
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

      <MyDuplicatesSection
        stickers={stickers}
        teams={teams}
        inventory={inventory}
      />

      <FiguritasAppSection
        text={figuritasText}
        onTextChange={setFiguritasText}
        partner={figuritasPartner}
        onPartnerChange={setFiguritasPartner}
        loading={figuritasLoading}
        result={figuritasResult}
        collectionId={collectionId}
        inventory={inventory}
        reservations={reservations}
        onAnalyze={handleAnalyzeFiguritas}
        onClear={handleClearFiguritas}
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
/* My duplicates — generate + copy a figuritas.app–style list         */
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

  const handleCopy = async () => {
    if (!built.text) return;
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(built.text);
      } else {
        // Fallback for older browsers / non-secure contexts.
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

  const totalDuplicates = built.groups.reduce(
    (sum, g) => sum + g.numbers.length,
    0
  );

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

      {built.text ? (
        <>
          <textarea
            className="input min-h-[140px] resize-y py-2 font-mono text-body-sm"
            value={built.text}
            readOnly
            aria-label={t('exchange.figuritasApp.myDuplicatesTitle')}
            data-testid="my-duplicates-text"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => void handleCopy()}
              data-testid="my-duplicates-copy"
            >
              {copied
                ? t('exchange.figuritasApp.copied')
                : t('exchange.figuritasApp.copyList')}
            </button>
          </div>
          <p className="text-label-sm text-on-surface-variant">
            {t('exchange.figuritasApp.shareHint')}
          </p>
        </>
      ) : (
        <EmptyState
          title={t('exchange.figuritasApp.noDuplicates')}
          description={t('exchange.figuritasApp.noDuplicatesHint')}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Figuritas App paste flow                                            */
/* ------------------------------------------------------------------ */

interface FiguritasAppSectionProps {
  text: string;
  onTextChange: (value: string) => void;
  partner: string;
  onPartnerChange: (value: string) => void;
  loading: boolean;
  result: FiguritasAppMatchResult | null;
  collectionId: string;
  inventory: Map<string, number>;
  reservations: { collectionId: string; stickerId: string; partner: string }[];
  onAnalyze: () => void;
  onClear: () => void;
}

function FiguritasAppSection({
  text,
  onTextChange,
  partner,
  onPartnerChange,
  loading,
  result,
  collectionId,
  inventory,
  reservations,
  onAnalyze,
  onClear,
}: FiguritasAppSectionProps) {
  const { t } = useTranslation();
  const reservationsForCollection = useMemo(
    () => reservations.filter((r) => r.collectionId === collectionId),
    [reservations, collectionId]
  );

  return (
    <section
      className="card flex flex-col gap-3"
      data-testid="figuritas-app-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-label-md font-medium uppercase tracking-wide text-on-surface-variant">
          {t('exchange.figuritasApp.title')}
        </h2>
        <p className="text-body-sm text-on-surface-variant">
          {t('exchange.figuritasApp.description')}
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

      <textarea
        className="input min-h-[140px] resize-y py-2 font-mono text-body-sm"
        placeholder={t('exchange.figuritasApp.placeholder')}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        aria-label={t('exchange.figuritasApp.paste')}
        data-testid="figuritas-app-paste"
      />

      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={onAnalyze}
          disabled={text.trim().length === 0 || loading}
          data-testid="figuritas-app-analyze"
        >
          {loading ? t('common.loading') : t('exchange.figuritasApp.analyze')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={onClear}
          disabled={text.length === 0 && !result}
        >
          {t('exchange.figuritasApp.clear')}
        </button>
      </div>

      {result ? (
        <FiguritasAppResult
          result={result}
          collectionId={collectionId}
          inventory={inventory}
          reservations={reservationsForCollection}
          partner={partner.trim() || DEFAULT_PARTNER}
        />
      ) : null}
    </section>
  );
}

interface FiguritasAppResultProps {
  result: FiguritasAppMatchResult;
  collectionId: string;
  inventory: Map<string, number>;
  reservations: { collectionId: string; stickerId: string; partner: string }[];
  partner: string;
}

function FiguritasAppResult({
  result,
  collectionId,
  inventory,
  reservations,
  partner,
}: FiguritasAppResultProps) {
  const { t } = useTranslation();
  const addReservation = useReservationStore((s) => s.addReservation);
  const removeReservation = useReservationStore((s) => s.removeReservation);

  if (
    result.iCanGive.length === 0 &&
    result.iNeed.length === 0 &&
    result.unresolved.length === 0
  ) {
    return <EmptyState title={t('exchange.figuritasApp.noMatch')} />;
  }

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="figuritas-app-result"
    >
      {result.byLine.map((line, idx) => (
        <FiguritasAppLine
          key={`${line.prefix}-${idx}`}
          line={line}
          collectionId={collectionId}
          inventory={inventory}
          reservations={reservations}
          partner={partner}
          onReserve={(sticker) => {
            addReservation({
              collectionId,
              stickerId: sticker.stickerId,
              partner,
              code: sticker.code,
              displayPrefix: sticker.displayPrefix,
              emoji: sticker.emoji,
            });
            toast.success(
              t('exchange.figuritasApp.reservedFor', { partner })
            );
          }}
          onUnreserve={(sticker) => {
            removeReservation(
              collectionId,
              sticker.stickerId,
              partner
            );
          }}
        />
      ))}
    </div>
  );
}

interface FiguritasAppLineProps {
  line: FiguritasAppLineMatch;
  collectionId: string;
  inventory: Map<string, number>;
  reservations: { collectionId: string; stickerId: string; partner: string }[];
  partner: string;
  onReserve: (sticker: FiguritasAppStickerMatch) => void;
  onUnreserve: (sticker: FiguritasAppStickerMatch) => void;
}

function FiguritasAppLine({
  line,
  collectionId,
  inventory,
  reservations,
  partner,
  onReserve,
  onUnreserve,
}: FiguritasAppLineProps) {
  const { t } = useTranslation();

  if (
    line.iCanGive.length === 0 &&
    line.iNeed.length === 0 &&
    line.iOwn.length === 0 &&
    line.unresolved.length === 0
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3">
      <h3 className="flex items-center gap-2 text-title-sm font-semibold text-on-surface">
        <span aria-hidden="true">{line.emoji}</span>
        <span className="font-mono">{line.prefix}</span>
      </h3>

      {line.iCanGive.length > 0 ? (
        <FiguritasAppStickerList
          tone="secondary"
          title={t('exchange.figuritasApp.canGiveHeader', {
            count: line.iCanGive.length,
          })}
          items={line.iCanGive}
          collectionId={collectionId}
          inventory={inventory}
          reservations={reservations}
          partner={partner}
          onReserve={onReserve}
          onUnreserve={onUnreserve}
        />
      ) : null}

      {line.iNeed.length > 0 ? (
        <FiguritasAppStickerList
          tone="primary"
          title={t('exchange.figuritasApp.canReceiveHeader', {
            count: line.iNeed.length,
          })}
          items={line.iNeed}
          collectionId={collectionId}
          inventory={inventory}
          reservations={reservations}
          partner={partner}
          onReserve={onReserve}
          onUnreserve={onUnreserve}
          readOnly
        />
      ) : null}

      {line.iOwn.length > 0 ? (
        <FiguritasAppStickerList
          tone="muted"
          title={t('exchange.figuritasApp.alreadyOwnHeader', {
            count: line.iOwn.length,
          })}
          items={line.iOwn}
          collectionId={collectionId}
          inventory={inventory}
          reservations={reservations}
          partner={partner}
          onReserve={onReserve}
          onUnreserve={onUnreserve}
          readOnly
        />
      ) : null}

      {line.unresolved.length > 0 ? (
        <details className="rounded-md bg-surface-container-low p-2 text-body-sm">
          <summary className="cursor-pointer text-on-surface-variant">
            {t('exchange.figuritasApp.unresolvedHeader', {
              count: line.unresolved.length,
            })}
          </summary>
          <ul className="mt-2 flex flex-wrap gap-1">
            {line.unresolved.map((u) => (
              <li
                key={u.number}
                className="rounded-md bg-surface-container px-1.5 py-0.5 font-mono text-label-md text-on-surface"
                title={u.candidates.join(', ')}
              >
                {u.number}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

interface FiguritasAppStickerListProps {
  title: string;
  items: FiguritasAppStickerMatch[];
  tone: 'primary' | 'secondary' | 'muted';
  collectionId: string;
  inventory: Map<string, number>;
  reservations: { collectionId: string; stickerId: string; partner: string }[];
  partner: string;
  onReserve: (sticker: FiguritasAppStickerMatch) => void;
  onUnreserve: (sticker: FiguritasAppStickerMatch) => void;
  readOnly?: boolean;
}

function FiguritasAppStickerList({
  title,
  items,
  tone,
  collectionId,
  inventory,
  reservations,
  partner,
  onReserve,
  onUnreserve,
  readOnly = false,
}: FiguritasAppStickerListProps) {
  const { t } = useTranslation();

  // The "Ya la tenés" list (muted) is rendered with a disabled greyed-out
  // look — no border accent, reduced opacity, no reserve controls. The other
  // tones keep their full contrast because they're actionable.
  const containerClass =
    tone === 'muted'
      ? 'flex flex-col items-stretch gap-1 rounded-md border border-dashed'
      : 'flex flex-col items-stretch gap-1 rounded-md border border-outline-variant bg-surface-container-lowest p-2';
  const codeClass =
    tone === 'muted'
      ? 'font-mono text-label-md text-on-surface-variant line-through'
      : 'font-mono text-label-md text-on-surface';
  const toneClass =
    tone === 'secondary'
      ? 'text-secondary'
      : tone === 'primary'
        ? 'text-primary'
        : 'text-on-surface-variant';

  return (
    <div>
      <h4 className={`mb-1 text-label-md font-semibold ${toneClass}`}>
        {title}
      </h4>
      <ul
        className={
          tone === 'muted'
            ? 'flex flex-wrap gap-1.5 opacity-60'
            : 'flex flex-wrap gap-2'
        }
      >
        {items.map((s) => {
          const total = inventory.get(s.stickerId) ?? 0;
          const reserved = totalReservedFor(
            reservations as never,
            collectionId,
            s.stickerId
          );
          // Duplicates the user can still earmark for this/other partners.
          const availableToGive = Math.max(0, total - 1 - reserved);
          // Existing reservation for the *current* partner (if any).
          const myReservation = reservations.find(
            (r) => r.stickerId === s.stickerId && r.partner === partner
          );
          // A reservation belonging to a *different* partner.
          const otherReservation = reservations.find(
            (r) => r.stickerId === s.stickerId && r.partner !== partner
          );
          const canReserve = !readOnly && availableToGive > 0;

          return (
            <li
              key={`${s.stickerId}-${s.number}`}
              data-testid={`figuritas-row-${s.stickerId}`}
              data-tone={tone}
              aria-disabled={tone === 'muted' || undefined}
              className={containerClass}
            >
              <div className="flex items-center gap-2 p-2">
                <span className={codeClass}>{s.code}</span>
                {tone === 'muted' ? (
                  <span
                    className="rounded-full bg-surface-container px-2 py-0.5
                      text-label-sm text-on-surface-variant"
                  >
                    {t('exchange.figuritasApp.ownedBadge')}
                  </span>
                ) : null}
                {tone !== 'muted' && reserved > 0 ? (
                  <span
                    className="rounded-full bg-tertiary-container px-2 py-0.5
                      text-label-sm text-on-tertiary-container"
                    title={t('exchange.figuritasApp.reserved')}
                  >
                    {t('exchange.figuritasApp.reserved')}
                  </span>
                ) : null}
              </div>
              {readOnly || tone === 'muted' ? null : myReservation ? (
                <button
                  type="button"
                  className="btn-secondary m-2 mt-0"
                  onClick={() => onUnreserve(s)}
                  data-testid={`unreserve-${s.stickerId}`}
                >
                  {t('exchange.figuritasApp.unreserve')}
                </button>
              ) : canReserve ? (
                <button
                  type="button"
                  className="btn-primary m-2 mt-0"
                  onClick={() => onReserve(s)}
                  data-testid={`reserve-${s.stickerId}`}
                >
                  {t('exchange.figuritasApp.reserve')}
                </button>
              ) : (
                <span className="m-2 mt-0 text-label-sm text-on-surface-variant">
                  {otherReservation
                    ? t('exchange.figuritasApp.reservedForSomeone')
                    : '—'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
