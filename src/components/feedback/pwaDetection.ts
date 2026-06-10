/**
 * Helpers de detección para la PWA.
 *
 * Funciones puras (sin estado ni side effects) que permiten saber en qué
 * contexto se está ejecutando la app:
 *  - Si ya está instalada y corriendo en modo standalone.
 *  - Si el navegador es iOS Safari (que no expone `beforeinstallprompt`).
 *
 * Se mantienen en un archivo separado de `PwaInstallPrompt.tsx` para que
 * el componente sea el único export y el fast refresh de Vite funcione
 * correctamente (regla `react-refresh/only-export-components`).
 */

export interface BeforeInstallPromptEvent extends Event {
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
