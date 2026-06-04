import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';

/**
 * Surfaces service-worker lifecycle to the user: an "offline ready" toast and
 * an actionable "update available" prompt (background updates with autoUpdate
 * still apply on next load; this lets the user refresh immediately).
 */
export function PwaUpdatePrompt() {
  const { t } = useTranslation();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 pb-safe-bottom">
      <div className="card flex w-full max-w-sm items-center justify-between gap-3">
        <span className="text-sm">
          {needRefresh ? t('common.save') + ' →' : '✓'}{' '}
          {needRefresh ? 'New version available' : 'App ready to work offline'}
        </span>
        <div className="flex gap-2">
          {needRefresh ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => updateServiceWorker(true)}
            >
              {t('common.apply')}
            </button>
          ) : null}
          <button type="button" className="btn-ghost" onClick={close}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
