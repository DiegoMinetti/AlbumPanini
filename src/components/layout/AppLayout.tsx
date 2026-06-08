import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';

export function AppLayout() {
  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 pb-28">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
