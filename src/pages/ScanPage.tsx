import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveCollection } from '@/hooks';
import { recognizeCodes, terminateOcr } from '@/services/ocrService';
import { addByCodes } from '@/services/inventoryService';
import { Spinner } from '@/components/feedback/Spinner';
import { NoActiveCollection } from '@/components/collections/NoActiveCollection';
import { EmptyState } from '@/components/feedback/EmptyState';
import { toast } from '@/stores/uiStore';
import { haptics } from '@/utils/haptics';

export function ScanPage() {
  const { t } = useTranslation();
  const { active, loading } = useActiveCollection();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);

  const collectionId = active?.id ?? null;

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
      void terminateOcr();
    };
  }, []);

  if (loading) return <Spinner />;
  if (!active || !collectionId) return <NoActiveCollection />;

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      toast.error(t('scan.cameraError'));
    }
  };

  const recognize = async (source: HTMLVideoElement | File) => {
    setProcessing(true);
    try {
      let input: HTMLCanvasElement | File;
      if (source instanceof File) {
        input = source;
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = source.videoWidth;
        canvas.height = source.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas context');
        ctx.drawImage(source, 0, 0);
        input = canvas;
      }
      const result = await recognizeCodes(input);
      setCodes(result.codes);
      if (result.codes.length === 0) {
        toast.warning(t('scan.noCodes'));
      } else {
        haptics.success();
      }
    } catch {
      toast.error(t('toast.error'));
    } finally {
      setProcessing(false);
    }
  };

  const addDetected = async () => {
    if (codes.length === 0) return;
    const report = await addByCodes(collectionId, codes, 'ocr-add');
    toast.success(
      t('bulk.result', {
        copies: report.addedCopies,
        matched: report.matchedCount,
      })
    );
    setCodes([]);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">{t('scan.ocrHint')}</p>

      <section className="card flex flex-col gap-3">
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`h-full w-full object-cover ${cameraOn ? '' : 'hidden'}`}
          />
          {!cameraOn ? (
            <div className="flex h-full items-center justify-center text-slate-500">
              📷
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {!cameraOn ? (
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => void startCamera()}
            >
              {t('scan.camera')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() =>
                  videoRef.current && void recognize(videoRef.current)
                }
                disabled={processing}
              >
                {t('scan.capture')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={stopCamera}
              >
                {t('common.close')}
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
            disabled={processing}
          >
            {t('scan.upload')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void recognize(file);
              e.target.value = '';
            }}
          />
        </div>
      </section>

      {processing ? <Spinner label={t('scan.processing')} /> : null}

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">
          {t('scan.detected')}
        </h2>
        {codes.length === 0 ? (
          <EmptyState title={t('scan.noCodes')} />
        ) : (
          <>
            <ul
              className="mb-3 flex flex-wrap gap-2"
              data-testid="detected-codes"
            >
              {codes.map((code, i) => (
                <li
                  key={`${code}-${i}`}
                  className="rounded-md bg-slate-100 px-2 py-1 font-mono text-sm dark:bg-slate-800"
                >
                  {code}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => void addDetected()}
            >
              {t('scan.addDetected')}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
