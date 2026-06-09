import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';

/**
 * M3 Snackbar / banner — prompt de actualización PWA.
 *
 * Posición M3 nativa (alineada con ToastViewport y con el FAB):
 *  - `bottom-[calc(80px+env(safe-area-inset-bottom))]` en todos los
 *    viewports. Esto es el equivalente M3 de `bottom-20` (80dp) usado
 *    por los tests e2e, pero respetando el safe-area-inset-bottom de
 *    iOS / Android con barra de gestos. 80dp deja aire suficiente
 *    arriba del BottomNav (64dp) y debajo del FAB (96dp) sin
 *    colisionar con ninguno.
 *
 * Estilo M3:
 *  - `inverse-surface` (alto emphasis) como fondo.
 *  - Botón filled M3 (primary) para la acción principal.
 *  - text-button con color `inverse-on-surface` para cerrar.
 *  - `pointer-events-none` en el wrapper y `pointer-events-auto` en
 *    el contenido — mismo patrón que ToastViewport para que el
 *    contenedor full-width no intercepte clicks que no son del
 *    propio banner (e.g. botones de modales que se renderizan detrás).
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
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3
        bottom-[calc(80px+env(safe-area-inset-bottom))]"
    >
      <div
        className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3
          rounded-xl bg-inverse-surface px-4 py-3 text-inverse-on-surface
          shadow-elev-3"
      >
        <span className="text-body-md">
          {needRefresh ? t('common.save') + ' →' : '✓'}{' '}
          {needRefresh ? 'New version available' : 'App ready to work offline'}
        </span>
        <div className="flex gap-2">
          {needRefresh ? (
            <button
              type="button"
              className="rounded-full bg-primary px-3 py-1.5 text-label-lg font-medium text-on-primary
                shadow-elev-1 transition-all duration-motion-short2 ease-standard
                hover:shadow-elev-2
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => updateServiceWorker(true)}
            >
              {t('common.apply')}
            </button>
          ) : null}
          <button
            type="button"
            data-testid="pwa-close"
            className="rounded-full px-3 py-1.5 text-label-lg font-medium text-inverse-on-surface
              transition-colors duration-motion-short2 ease-standard
              hover:bg-inverse-surface/60
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={close}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
