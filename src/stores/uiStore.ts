import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Auto-dismiss delay in ms (0 = sticky). */
  duration: number;
}

interface UiState {
  toasts: Toast[];
  pushToast: (
    message: string,
    kind?: ToastKind,
    duration?: number
  ) => number;
  dismissToast: (id: number) => void;
}

let nextId = 1;

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  pushToast: (message, kind = 'info', duration = 3500) => {
    const id = nextId++;
    set((state) => ({
      toasts: [...state.toasts, { id, kind, message, duration }],
    }));
    if (duration > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helper for non-component code. */
export const toast = {
  success: (msg: string) => useUiStore.getState().pushToast(msg, 'success'),
  error: (msg: string) => useUiStore.getState().pushToast(msg, 'error', 5000),
  info: (msg: string) => useUiStore.getState().pushToast(msg, 'info'),
  warning: (msg: string) => useUiStore.getState().pushToast(msg, 'warning'),
};
