import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore, toast } from './uiStore';

beforeEach(() => {
  useUiStore.setState({ toasts: [] });
});

describe('uiStore', () => {
  it('pushes and dismisses toasts', () => {
    const id = useUiStore.getState().pushToast('hello', 'info', 0);
    expect(useUiStore.getState().toasts).toHaveLength(1);
    useUiStore.getState().dismissToast(id);
    expect(useUiStore.getState().toasts).toHaveLength(0);
  });

  it('exposes typed helpers', () => {
    toast.success('ok');
    toast.error('bad');
    const kinds = useUiStore.getState().toasts.map((t) => t.kind);
    expect(kinds).toContain('success');
    expect(kinds).toContain('error');
  });
});
