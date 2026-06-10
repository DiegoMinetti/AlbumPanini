import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';

/**
 * M3 Snackbar — prompt de instalación de PWA.
 *
 * Detección:
 *  - `display-mode: standalone` o `navigator.standalone === true` → ya
 *    instalada, no se muestra nada.
 *  - Android / Chrome (y la mayoría de los navegadores Chromium-based):
 *    escuchamos el evento `beforeinstallprompt` y exponemos un botón
 *    "Instalar" que dispara el prompt nativo.
 *  - iOS Safari: no expone `beforeinstallprompt`, así que mostramos
 *    instrucciones paso a paso en un modal.
 *  - Si no se cumple ninguno de los dos casos, no se muestra nada.
 *
 * Persistencia: una vez descartado, guardamos la marca en
 * `sessionStorage` para no volver a molestar en esta sesión. En la
 * siguiente visita (o pestaña) vuelve a aparecer.
 *
 * Posición M3 (mismo offset que `PwaUpdatePrompt` y `ToastViewport`):
 *  - `bottom-[calc(80px+env(safe-area-inset-bottom))]`
 *  - `inverse-surface` (alta emphasis).
 */

const DISMISS_KEY = 'panini-pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** True when the app is already running in standalone (installed) mode. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari exposes `navigator.standalone` for home-screen apps.
  // @ts-expect-error — non-standard but widely supported
  if (typeof navigator.standalone === 'boolean' && navigator.standalone) {
    return true;
  }
  // Android/Chrome and iOS 16.4+ use the standard `display-mode` media query.
  return window.matchMedia('(display-mode: standalone)').matches;
}

/** True when the user is on iOS Safari (not Chrome/Firefox/Edge on iOS). */
export function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  // Modern iPadOS reports as Mac with touch points.
  const isIpadOs =
    navigator.platform === 'MacIntel' &&
    (navigator.maxTouchPoints ?? 0) > 1 &&
    !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const isWebkit = /WebKit/.test(ua);
  // iOS browsers other than Safari (Chrome, Firefox, Edge) are just WebKit
  // shells — they don't allow installing PWAs as home-screen apps.
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return (isIos || isIpadOs) && isWebkit && !isOtherIosBrowser;
}

export function PwaInstallPrompt() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setInstalled(true);
      return;
    }
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* ignore */
    }

    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowSnackbar(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setShowSnackbar(false);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if (isIosSafari()) {
      // iOS Safari never fires `beforeinstallprompt`. After a short delay
      // (so we don't compete with the first render of the app), show a
      // subtle banner with a "How" link that opens the instructions.
      iosTimer = setTimeout(() => setShowSnackbar(true), 2000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
      }
    } catch {
      /* ignore */
    }
    dismiss();
  };

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setShowSnackbar(false);
    setShowIosHelp(false);
  };

  if (installed) return null;
  if (!showSnackbar && !showIosHelp) return null;

  const isIos = isIosSafari();

  return (
    <>
      {showSnackbar ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3
            bottom-[calc(80px+env(safe-area-inset-bottom))]"
          data-testid="pwa-install-snackbar"
        >
          <div
            className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3
              rounded-xl bg-inverse-surface px-4 py-3 text-inverse-on-surface
              shadow-elev-3"
          >
            <span className="flex items-center gap-2 text-body-md">
              <Icon name="share" size={20} aria-hidden />
              {t('pwaInstall.banner')}
            </span>
            <div className="flex gap-2">
              {isIos ? (
                <button
                  type="button"
                  className="rounded-full bg-primary px-3 py-1.5 text-label-lg font-medium text-on-primary
                    shadow-elev-1 transition-all duration-motion-short2 ease-standard
                    hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => setShowIosHelp(true)}
                  data-testid="pwa-install-how"
                >
                  {t('pwaInstall.how')}
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-full bg-primary px-3 py-1.5 text-label-lg font-medium text-on-primary
                    shadow-elev-1 transition-all duration-motion-short2 ease-standard
                    hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => void handleInstall()}
                  data-testid="pwa-install-button"
                >
                  {t('pwaInstall.install')}
                </button>
              )}
              <button
                type="button"
                data-testid="pwa-install-close"
                className="rounded-full px-3 py-1.5 text-label-lg font-medium text-inverse-on-surface
                  transition-colors duration-motion-short2 ease-standard
                  hover:bg-inverse-surface/60
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={dismiss}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={showIosHelp}
        onClose={() => setShowIosHelp(false)}
        title={t('pwaInstall.iosTitle')}
        footer={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowIosHelp(false)}
          >
            {t('common.close')}
          </button>
        }
      >
        <p className="text-body-md text-on-surface-variant">
          {t('pwaInstall.iosBody')}
        </p>
        <ol className="ml-5 mt-3 list-decimal space-y-2 text-body-md text-on-surface">
          <li>{t('pwaInstall.iosStep1')}</li>
          <li>{t('pwaInstall.iosStep2')}</li>
          <li>{t('pwaInstall.iosStep3')}</li>
        </ol>
        <p className="mt-4 text-label-md text-on-surface-variant">
          {t('pwaInstall.iosWhy')}
        </p>
      </Modal>
    </>
  );
}
