import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './queryClient';
import { router } from './router';
import { ToastViewport } from '@/components/feedback/ToastViewport';
import { PwaUpdatePrompt } from '@/components/feedback/PwaUpdatePrompt';
import { useSettingsStore } from '@/stores/settingsStore';

const SESSION_LAUNCH_KEY = 'panini-launch-registered';

export function App() {
  const registerAppLaunch = useSettingsStore((s) => s.registerAppLaunch);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_LAUNCH_KEY) === '1') return;
      registerAppLaunch();
      sessionStorage.setItem(SESSION_LAUNCH_KEY, '1');
    } catch {
      registerAppLaunch();
    }
  }, [registerAppLaunch]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastViewport />
      <PwaUpdatePrompt />
    </QueryClientProvider>
  );
}
