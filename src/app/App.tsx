import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './queryClient';
import { router } from './router';
import { ToastViewport } from '@/components/feedback/ToastViewport';
import { PwaUpdatePrompt } from '@/components/feedback/PwaUpdatePrompt';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastViewport />
      <PwaUpdatePrompt />
    </QueryClientProvider>
  );
}
