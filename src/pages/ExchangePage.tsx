import { useEffect, useRef, useState } from 'react';
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
import type { ExchangeMatch } from '@/types/exchange';
import { Spinner } from '@/components/feedback/Spinner';
import { NoActiveCollection } from '@/components/collections/NoActiveCollection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { toast } from '@/stores/uiStore';
import { imageToImageData, loadImageFromBlob } from '@/utils/file';

export function ExchangePage() {
  const { t } = useTranslation();
  const { active, loading } = useActiveCollection();
  const { stickers, inventory } = useCollectionData(active?.id ?? null);

  const [qr, setQr] = useState<string | null>(null);
  const [position, setPosition] = useState<OwnPosition | null>(null);
  const [pasted, setPasted] = useState('');
  const [match, setMatch] = useState<ExchangeMatch | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const collectionId = active?.id ?? null;

  useEffect(() => {
    setQr(null);
    setPosition(null);
    setMatch(null);
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

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-500">
          {t('exchange.myCode')}
        </h2>
        {qr ? (
          <img
            src={qr}
            alt={t('exchange.myCode')}
            className="h-64 w-64 rounded-xl bg-white p-2"
            data-testid="exchange-qr"
          />
        ) : (
          <button type="button" className="btn-primary" onClick={() => void handleGenerate()}>
            {t('exchange.generate')}
          </button>
        )}
        {position ? (
          <p className="text-xs text-slate-500">
            {t('exchange.summary', {
              give: position.duplicates.length,
              receive: position.missing.length,
            })}
          </p>
        ) : null}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-500">
          {t('exchange.scanTheirs')}
        </h2>
        <textarea
          className="input min-h-[80px] resize-y py-2 font-mono text-xs"
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
        <section className="card flex flex-col gap-4" data-testid="exchange-result">
          <p className="text-center text-sm font-semibold text-brand-600">
            {t('exchange.mutual', { count: match.mutualCount })}
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <MatchList
              title={t('exchange.iCanGive')}
              ids={match.iCanGive}
              label={stickerLabel}
              tone="emerald"
            />
            <MatchList
              title={t('exchange.iCanReceive')}
              ids={match.iCanReceive}
              label={stickerLabel}
              tone="brand"
            />
          </div>
        </section>
      ) : null}

      {position && position.duplicates.length === 0 ? (
        <EmptyState title={t('exchange.noDuplicates')} />
      ) : null}
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
  tone: 'emerald' | 'brand';
}) {
  const toneClass =
    tone === 'emerald' ? 'text-emerald-600' : 'text-brand-600';
  return (
    <div>
      <h3 className={`mb-2 font-semibold ${toneClass}`}>
        {title} ({ids.length})
      </h3>
      <ul className="flex flex-wrap gap-1">
        {ids.map((id) => (
          <li
            key={id}
            className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800"
          >
            {label(id)}
          </li>
        ))}
        {ids.length === 0 ? <li className="text-slate-400">—</li> : null}
      </ul>
    </div>
  );
}
