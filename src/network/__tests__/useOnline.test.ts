import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { isOnline, useOnline } from '../useOnline';

afterEach(() => global.__resetNetwork());

describe('isOnline', () => {
  it('só fica offline quando o sistema diz que caiu', () => {
    expect(isOnline({})).toBe(true);
    expect(isOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(isOnline({ isConnected: false })).toBe(false);
    expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });
});

describe('useOnline no nativo (expo-network)', () => {
  it('lê o estado inicial e acompanha a queda e a volta da rede', async () => {
    global.__setNetwork({ isConnected: false });
    const { result } = await renderHook(() => useOnline());
    await act(async () => {});
    expect(result.current).toBe(false);
    await act(async () => global.__setNetwork({ isConnected: true, isInternetReachable: true }));
    expect(result.current).toBe(true);
  });
});

describe('useOnline no web (navigator.onLine)', () => {
  const original = Platform.OS;
  const originalAdd = window.addEventListener;
  const originalRemove = window.removeEventListener;
  const listeners = new Map<string, Set<() => void>>();
  let onLine = true;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, get: () => onLine });
    Object.assign(window, {
      addEventListener: (type: string, fn: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
    });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
    delete (globalThis.navigator as { onLine?: boolean }).onLine;
    Object.assign(window, { addEventListener: originalAdd, removeEventListener: originalRemove });
    listeners.clear();
    onLine = true;
  });

  const emit = (type: string) => listeners.get(type)?.forEach((fn) => fn());

  it('segue os eventos offline e online', async () => {
    const { result, unmount } = await renderHook(() => useOnline());
    expect(result.current).toBe(true);
    onLine = false;
    await act(async () => emit('offline'));
    expect(result.current).toBe(false);
    onLine = true;
    await act(async () => emit('online'));
    expect(result.current).toBe(true);
    await unmount();
    expect(listeners.get('online')?.size ?? 0).toBe(0);
  });
});
