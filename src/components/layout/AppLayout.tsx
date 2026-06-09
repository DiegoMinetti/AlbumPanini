import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { NavigationRail } from './NavigationRail';

/**
 * Layout raíz de la app — "frame" tipo M3:
 *  - `<TopBar />` M3 translúcido con surface-tint al scroll (todas las pantallas).
 *  - `<main>` con scroll nativo y padding-bottom que respeta la nav bar inferior
 *    (móvil) o el padding lateral que respeta el NavigationRail (tablet/desktop).
 *  - `<BottomNav />` M3 NavigationBar translúcida (móvil < md).
 *  - `<NavigationRail />` M3 NavigationRail lateral (≥ md).
 *
 * El contenedor raíz ocupa `100dvh` (dynamic viewport height) y se siente como
 * una app nativa — no hay "salto" al ocultar/mostrar la barra de URL en iOS.
 *
 * El padding lateral en `md+` deja sitio al NavigationRail (80dp) y permite
 * que el contenido principal crezca hasta `max-w-2xl` centrado (móvil) o
 * `max-w-3xl` (desktop) sin tocar el rail.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar />

      {/*
        M3 Window-size class — el contenido principal vive entre TopBar y
        NavigationBar (móvil) o entre TopBar y el borde derecho (≥ md,
        con NavigationRail a la izquierda). Usamos `pb-[calc(64px+env(safe-area-inset-bottom))]`
        en móvil para que el último item de cada vista nunca quede tapado por
        la nav bar translúcida.
      */}
      <main
        className="mx-auto w-full max-w-2xl flex-1 px-3 py-4
          pb-[calc(64px+env(safe-area-inset-bottom))]
          md:max-w-3xl md:pl-[100px] md:pr-4
          md:pb-4"
      >
        <Outlet />
      </main>

      <BottomNav />
      <NavigationRail />
    </div>
  );
}
