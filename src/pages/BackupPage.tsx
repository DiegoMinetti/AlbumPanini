import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  backupFilename,
  exportBackup,
  parseBackupFile,
  restoreBackup,
} from '@/services/backupService';
import {
  applySyncPayload,
  assembleSyncChunks,
  buildSyncPayload,
  buildSyncUrl,
  chunkSync,
  clearSyncSession,
  decodeSync,
  encodeSync,
  recordSyncChunk,
  renderSyncQr,
  type ApplySyncSummary,
  type ParsedSyncLink,
  type SyncChunks,
} from '@/services/syncService';
import type { SyncPayload } from '@/types/sync';
import type { BackupPayload } from '@/types/backup';
import { downloadBlob, readFileAsBytes } from '@/utils/file';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { isStandaloneDisplay } from '@/components/feedback/pwaDetection';
import {
  SyncReceiveDialog,
  type SyncReceiveMode,
} from '@/components/backup/SyncReceiveDialog';
import { toast } from '@/stores/uiStore';

/**
 * Backup — usa M3 tokens (text-on-surface-variant) en lugar de slate.
 * Mantiene data-testid y la API de SegmentedControl.
 *
 * Also hosts the device-to-device sync over QR codes. The flow:
 *  - "Generate" turns the current DB into one or more QR codes whose
 *    payload is a deep-link to the same page with `?sync=…` set.
 *  - When the user opens such a link (or re-opens the page after a
 *    chunk was added to the local session buffer) we decode the
 *    payload and offer a merge / replace apply.
 *
 * When the user opens a `?sync=…` link in the regular browser tab
 * (because the PWA is not installed on that device, or the OS does
 * not route QR scans to the installed PWA) we show a dialog explaining
 * the situation and offering to install the PWA / copy the URL.
 */
export function BackupPage() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const applySettings = useSettingsStore((s) => s.applySettings);
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'replace' | 'merge'>('merge');
  const [pending, setPending] = useState<{
    payload: BackupPayload;
    migratedFrom?: number;
  } | null>(null);

  // --- Sync state --------------------------------------------------------
  const [searchParams, setSearchParams] = useSearchParams();
  const [syncChunks, setSyncChunks] = useState<SyncChunks | null>(null);
  const [syncChunkIdx, setSyncChunkIdx] = useState(0);
  const [syncQrUrl, setSyncQrUrl] = useState<string | null>(null);
  // Plain-text URL encoded into the QR. Kept in state so we can show it
  // alongside the image and let the user copy it as a fallback (or paste
  // it into the receiver device manually when scanning isn't an option).
  const [syncUrl, setSyncUrl] = useState<string | null>(null);
  const [generatingSync, setGeneratingSync] = useState(false);

  // Incoming payload (decoded from one or more scanned QRs).
  const [incoming, setIncoming] = useState<{
    payload: SyncPayload;
    summary: ApplySyncSummary;
  } | null>(null);
  const [receiveMode, setReceiveMode] = useState<SyncReceiveMode>('merge');
  const [receiveApplying, setReceiveApplying] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  // Multi-chunk progress (waiting for more QRs from the sender).
  const [pendingSession, setPendingSession] = useState<{
    sid: string;
    total: number;
    received: number;
  } | null>(null);

  // Shown when the page was opened with `?sync=…` in the regular browser
  // tab (i.e. the PWA is not installed in standalone mode). iOS and some
  // Android setups always route scanned QR URLs to the browser, so this
  // dialog helps the user understand why the link opened in a regular tab
  // and how to make the QR open the app directly.
  const [browserSyncHelpOpen, setBrowserSyncHelpOpen] = useState(false);

  // -------------------------------------------------------------------------
  // Backup import/export
  // -------------------------------------------------------------------------

  const handleExport = async () => {
    try {
      const blob = await exportBackup({
        theme: settings.theme,
        language: settings.language,
        haptics: settings.haptics,
        stickerView: settings.stickerView,
        activeCollectionId: settings.activeCollectionId,
        showImages: settings.showImages,
        stickerGrouped: settings.stickerGrouped,
        editMode: settings.editMode,
        appLaunchCount: settings.appLaunchCount,
        donationLinkOpened: settings.donationLinkOpened,
        defaultCollectionSeeded: settings.defaultCollectionSeeded,
      });
      downloadBlob(blob, backupFilename());
      toast.success(t('backup.exported'));
    } catch {
      toast.error(t('toast.error'));
    }
  };

  const handleFile = async (file: File) => {
    try {
      const bytes = await readFileAsBytes(file);
      const parsed = parseBackupFile(bytes);
      setPending(parsed);
    } catch {
      toast.error(t('backup.invalid'));
    }
  };

  const confirmRestore = async () => {
    if (!pending) return;
    try {
      const { summary, settings: restored } = await restoreBackup(
        pending.payload,
        { mode, migratedFrom: pending.migratedFrom }
      );
      applySettings(restored);
      if (summary.migratedFrom) {
        toast.info(t('backup.migrated', { from: summary.migratedFrom }));
      }
      toast.success(
        t('backup.restored', {
          collections: summary.collections,
          stickers: summary.stickers,
        })
      );
    } catch {
      toast.error(t('toast.error'));
    } finally {
      setPending(null);
    }
  };

  // -------------------------------------------------------------------------
  // Sync (sender)
  // -------------------------------------------------------------------------

  const hasAnyData = useMemo(() => {
    // Used to decide whether the "Generate" button should be enabled.
    // We re-compute via the same query the service uses, but cheaply on
    // every render — there's no DB hit because the service caches.
    return syncChunks !== null;
  }, [syncChunks]);

  const generateSync = useCallback(async () => {
    setGeneratingSync(true);
    try {
      const payload = await buildSyncPayload({
        theme: settings.theme,
        language: settings.language,
        haptics: settings.haptics,
        stickerView: settings.stickerView,
        activeCollectionId: settings.activeCollectionId,
        showImages: settings.showImages,
        stickerGrouped: settings.stickerGrouped,
        editMode: settings.editMode,
        appLaunchCount: settings.appLaunchCount,
        donationLinkOpened: settings.donationLinkOpened,
        defaultCollectionSeeded: settings.defaultCollectionSeeded,
      });
      const totalCollections = payload.c.length;
      const totalItems = payload.c.reduce(
        (acc, c) => acc + c.q.length + c.s.length,
        0
      );
      if (totalCollections === 0 || totalItems === 0) {
        toast.warning(t('backup.sync.noData'));
        setSyncChunks(null);
        setSyncQrUrl(null);
        setSyncUrl(null);
        return;
      }
      const encoded = encodeSync(payload);
      const chunks = chunkSync(encoded);
      setSyncChunks(chunks);
      setSyncChunkIdx(0);
      const url = buildSyncUrl({
        sid: chunks.sid,
        idx: 1,
        total: chunks.total,
        data: chunks.pieces[0],
      });
      const dataUrl = await renderSyncQr(url, { size: 320 });
      setSyncQrUrl(dataUrl);
      setSyncUrl(url);
    } catch {
      toast.error(t('toast.error'));
    } finally {
      setGeneratingSync(false);
    }
  }, [settings, t]);

  // Re-render the QR when the user navigates between chunks.
  useEffect(() => {
    if (!syncChunks) return;
    const piece = syncChunks.pieces[syncChunkIdx];
    if (!piece) return;
    let cancelled = false;
    (async () => {
      try {
        const url = buildSyncUrl({
          sid: syncChunks.sid,
          idx: syncChunkIdx + 1,
          total: syncChunks.total,
          data: piece,
        });
        const dataUrl = await renderSyncQr(url, { size: 320 });
        if (!cancelled) {
          setSyncQrUrl(dataUrl);
          setSyncUrl(url);
        }
      } catch {
        if (!cancelled) toast.error(t('toast.error'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncChunks, syncChunkIdx, t]);

  const copySyncUrl = async () => {
    if (!syncUrl) return;
    try {
      await navigator.clipboard.writeText(syncUrl);
      toast.success(t('toast.copied'));
    } catch {
      // Fallback for browsers without async clipboard (e.g. older WebViews).
      const ta = document.createElement('textarea');
      ta.value = syncUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        toast.success(t('toast.copied'));
      } catch {
        toast.error(t('toast.error'));
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  // -------------------------------------------------------------------------
  // Sync (receiver)
  // -------------------------------------------------------------------------

  /**
   * Handle an incoming sync URL. Either records the chunk in the in-flight
   * session, or — when the session completes — decodes the assembled
   * payload and opens the confirmation dialog.
   */
  const handleIncomingLink = useCallback(
    async (link: ParsedSyncLink) => {
      // If the page was reached in the regular browser (PWA not installed)
      // we still want to process the sync, but we also offer the user a
      // hint about why the link opened in a tab instead of the app.
      if (!isStandaloneDisplay() && typeof window !== 'undefined') {
        setBrowserSyncHelpOpen(true);
      }
      const result = recordSyncChunk(link);
      if (!result) {
        // Stale / out of order: just clear and ask the user to rescan.
        clearSyncSession();
        setSearchParams({}, { replace: true });
        toast.error(t('toast.error'));
        return;
      }
      if (!result.isComplete) {
        setPendingSession({
          sid: result.session.sid,
          total: result.session.total,
          received: result.session.chunks.size,
        });
        // Keep the URL params in place so the user can keep scanning
        // from the same page; only the dialog opens once all chunks arrive.
        return;
      }
      const assembled = assembleSyncChunks(result.session);
      if (!assembled) {
        toast.error(t('toast.error'));
        return;
      }
      try {
        const payload = decodeSync(assembled);
        // Compute which collections are missing locally before opening
        // the dialog so we can warn the user up-front.
        const local = await fetchLocalCollectionIds();
        const missing = payload.c
          .filter((c) => !local.has(c.i))
          .map((c) => c.i);
        setIncoming({
          payload,
          summary: {
            collections: payload.c.length,
            inventoryItems: payload.c.reduce((acc, c) => acc + c.q.length, 0),
            scenarios: payload.c.reduce((acc, c) => acc + c.s.length, 0),
            matchResults: payload.c.reduce(
              (acc, c) => acc + c.s.reduce((a, s) => a + s.r.length, 0),
              0
            ),
            knockoutPicks: payload.c.reduce(
              (acc, c) => acc + c.s.reduce((a, s) => a + s.p.length, 0),
              0
            ),
            settingsApplied: !!payload.st,
            missingCollections: missing,
          },
        });
        setPendingSession(null);
        setReceiveOpen(true);
        // Strip the sync query so a reload doesn't reopen the dialog.
        setSearchParams({}, { replace: true });
        clearSyncSession();
      } catch {
        toast.error(t('toast.error'));
        setSearchParams({}, { replace: true });
      }
    },
    [setSearchParams, t]
  );

  // Detect a sync query on mount and after URL changes (e.g. when the
  // user scans the next chunk from the camera app and re-opens the page).
  useEffect(() => {
    const raw = searchParams.get('sync');
    if (!raw) return;
    const link: ParsedSyncLink = {
      isSingle: (searchParams.get('n') ?? '1') === '1',
      sid: raw,
      idx: Number(searchParams.get('i') ?? '1'),
      total: Number(searchParams.get('n') ?? '1'),
      data: searchParams.get('c') ?? '',
    };
    if (!link.data) return;
    void handleIncomingLink(link);
  }, [searchParams, handleIncomingLink]);

  // If a session is in-flight (user scanned chunk 1/N and navigated away)
  // and then returns, the searchParams effect above re-fires. We also
  // expose a way to re-trigger a chunked scan manually via "scan next".

  const confirmReceive = async () => {
    if (!incoming) return;
    setReceiveApplying(true);
    try {
      const summary = await applySyncPayload(incoming.payload, {
        mode: receiveMode,
      });
      if (incoming.payload.st) applySettings(incoming.payload.st);
      toast.success(
        t('backup.sync.received.appliedSummary', {
          items: summary.inventoryItems,
          scenarios: summary.scenarios,
        })
      );
      if (summary.settingsApplied || incoming.payload.st) {
        toast.info(t('backup.sync.received.settingsApplied'));
      }
      if (summary.missingCollections.length > 0) {
        toast.warning(
          t('backup.sync.received.missingWarning', {
            count: summary.missingCollections.length,
            ids: summary.missingCollections.join(', '),
          })
        );
      }
    } catch {
      toast.error(t('toast.error'));
    } finally {
      setReceiveApplying(false);
      setReceiveOpen(false);
      setIncoming(null);
    }
  };

  const cancelReceive = () => {
    setReceiveOpen(false);
    setIncoming(null);
    clearSyncSession();
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const showSyncQr = !!syncChunks && !!syncQrUrl;
  const noSyncData =
    !generatingSync && syncChunks === null && hasAnyData === false;

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-3">
        <h2 className="text-title-md font-semibold text-on-surface">
          {t('backup.export')}
        </h2>
        <p className="text-body-md text-on-surface-variant">
          {t('backup.exportDesc')}
        </p>
        <button
          type="button"
          className="btn-primary self-start"
          onClick={() => void handleExport()}
          data-testid="export-backup"
        >
          {t('backup.export')}
        </button>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-title-md font-semibold text-on-surface">
          {t('backup.import')}
        </h2>
        <p className="text-body-md text-on-surface-variant">
          {t('backup.importDesc')}
        </p>

        <div>
          <label className="mb-1 block text-label-md text-on-surface-variant">
            {t('backup.mode')}
          </label>
          <SegmentedControl
            ariaLabel={t('backup.mode')}
            options={[
              { value: 'merge', label: t('backup.modeMerge') },
              { value: 'replace', label: t('backup.modeReplace') },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>

        <button
          type="button"
          className="btn-secondary self-start"
          onClick={() => fileRef.current?.click()}
          data-testid="import-backup"
        >
          {t('backup.import')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".albumbackup,application/gzip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-title-md font-semibold text-on-surface">
          {t('backup.sync.title')}
        </h2>
        <p className="text-body-md text-on-surface-variant">
          {t('backup.sync.desc')}
        </p>

        {showSyncQr && syncChunks ? (
          <div
            className="flex flex-col items-center gap-3"
            data-testid="sync-qr-block"
          >
            <p className="text-label-md uppercase tracking-wide text-on-surface-variant">
              {t('backup.sync.showQr')}
            </p>
            <img
              src={syncQrUrl ?? undefined}
              alt={t('backup.sync.title')}
              className="h-64 w-64 rounded-xl bg-surface p-2"
              data-testid="sync-qr-image"
            />
            {syncChunks.total > 1 ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-label-md text-on-surface-variant">
                  {t('backup.sync.chunk', {
                    idx: syncChunkIdx + 1,
                    total: syncChunks.total,
                  })}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setSyncChunkIdx((i) => Math.max(0, i - 1))}
                    disabled={syncChunkIdx === 0}
                  >
                    {t('backup.sync.prevChunk')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() =>
                      setSyncChunkIdx((i) =>
                        Math.min(syncChunks.total - 1, i + 1)
                      )
                    }
                    disabled={syncChunkIdx >= syncChunks.total - 1}
                  >
                    {t('backup.sync.nextChunk')}
                  </button>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSyncChunks(null);
                setSyncQrUrl(null);
                setSyncUrl(null);
                setSyncChunkIdx(0);
                void generateSync();
              }}
            >
              {t('backup.sync.regenerate')}
            </button>

            {/* Fallback: plain-text URL + copy button.
                Useful when the QR can't be scanned (camera dirty, low light)
                or the receiver device routes the link to the browser tab
                instead of the installed PWA. */}
            {syncUrl ? (
              <div
                className="mt-2 w-full max-w-md rounded-lg border border-outline-variant
                  bg-surface-container p-3"
                data-testid="sync-url-block"
              >
                <p className="mb-1 text-label-md text-on-surface-variant">
                  {t('backup.sync.urlLabel')}
                </p>
                <p
                  className="mb-2 break-all font-mono text-label-md text-on-surface"
                  data-testid="sync-url-text"
                >
                  {syncUrl}
                </p>
                <button
                  type="button"
                  className="btn-secondary self-start"
                  onClick={() => void copySyncUrl()}
                  data-testid="sync-url-copy"
                >
                  <Icon name="content_copy" size={16} className="mr-1" />
                  {t('backup.sync.urlCopy')}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="btn-primary self-start"
            onClick={() => void generateSync()}
            disabled={generatingSync}
            data-testid="generate-sync"
          >
            {generatingSync ? t('common.loading') : t('backup.sync.generate')}
          </button>
        )}

        {noSyncData ? null : null}
      </section>

      {pendingSession && pendingSession.received < pendingSession.total ? (
        <section
          className="card flex flex-col gap-2"
          data-testid="sync-progress"
        >
          <h2 className="text-title-sm font-semibold text-on-surface">
            {t('backup.sync.progress.title')}
          </h2>
          <p className="text-body-md text-on-surface-variant">
            {t('backup.sync.progress.received', {
              received: pendingSession.received,
              total: pendingSession.total,
            })}
          </p>
          <p className="text-label-md text-on-surface-variant">
            {t('backup.sync.progress.hint')}
          </p>
          <button
            type="button"
            className="btn-secondary self-start"
            onClick={() => {
              clearSyncSession();
              setPendingSession(null);
              setSearchParams({}, { replace: true });
            }}
          >
            {t('backup.sync.progress.cancel')}
          </button>
        </section>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        danger={mode === 'replace'}
        message={t('backup.restoreConfirm')}
        confirmLabel={t('backup.import')}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmRestore()}
      />

      <SyncReceiveDialog
        open={receiveOpen}
        payload={incoming?.payload ?? null}
        mode={receiveMode}
        onChangeMode={setReceiveMode}
        summary={incoming?.summary ?? null}
        applying={receiveApplying}
        onApply={() => void confirmReceive()}
        onCancel={cancelReceive}
      />

      <Modal
        open={browserSyncHelpOpen}
        onClose={() => setBrowserSyncHelpOpen(false)}
        title={t('backup.sync.browserHelp.title')}
        footer={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setBrowserSyncHelpOpen(false)}
          >
            {t('common.close')}
          </button>
        }
      >
        <p className="text-body-md text-on-surface-variant">
          {t('backup.sync.browserHelp.body')}
        </p>
        <p className="mt-3 text-body-md text-on-surface-variant">
          {t('backup.sync.browserHelp.hint')}
        </p>
      </Modal>
    </div>
  );
}

/** Helper: return the set of collection ids the local DB has installed. */
async function fetchLocalCollectionIds(): Promise<Set<string>> {
  const { db } = await import('@/db');
  const rows = await db.collections.toArray();
  return new Set(rows.map((r) => r.id));
}
