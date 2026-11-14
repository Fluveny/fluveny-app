import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { META_SPLASH_TIMEOUT_MS, queryClient, RootLayout } from '../../app/_layout';
import Home from '../../app/(public)/index';
import UpdateRequired, { UPDATE_TITLE } from '../../app/atualize';
import { ApiError } from '../api/client';
import * as sentry from '../observability/sentry';

jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: jest.fn(() => [true, null]),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../observability/sentry', () => {
  const actual = jest.requireActual('../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const openApp = () =>
  renderRouter({ _layout: RootLayout, '(public)/index': Home, atualize: UpdateRequired }, { initialUrl: '/' });

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
let warn: jest.SpyInstance;

beforeEach(() => {
  queryClient.clear();
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  (useFonts as jest.Mock).mockReturnValue([true, null]);
  (SplashScreen.hideAsync as jest.Mock).mockClear();
  (sentry.captureError as jest.Mock).mockClear();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  jest.useRealTimers();
});

afterAll(() => {
  // O cliente é do módulo: limpar tira os timers de gc e deixa o jest sair.
  queryClient.clear();
  process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
});

describe('RootLayout', () => {
  it('com falha de fonte: renderiza o App, manda o erro ao Sentry e esconde a splash', async () => {
    (useFonts as jest.Mock).mockReturnValue([false, new Error('fonte não carregou')]);
    global.fetch = jest.fn().mockResolvedValue(json({ data: { minAppVersion: '0.0.0', activityTypes: [] } }));
    await openApp();
    expect(await screen.findByLabelText('Fluveny')).toBeTruthy();
    await waitFor(() => expect(SplashScreen.hideAsync).toHaveBeenCalled());
    expect(sentry.captureError).toHaveBeenCalledWith(expect.objectContaining({ message: 'fonte não carregou' }));
  });

  it('/meta pendente: nada aparece e a splash fica; depois do teto, a Home aparece e a splash some', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(() => new Promise(() => {}));
    await openApp();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(META_SPLASH_TIMEOUT_MS - 1);
    });
    expect(screen.queryByLabelText('Fluveny')).toBeNull();
    expect(screen.queryByText(UPDATE_TITLE)).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByLabelText('Fluveny')).toBeTruthy();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it('minAppVersion 99.0.0: o logo nunca aparece, só a tela de atualizar', async () => {
    global.fetch = jest.fn().mockResolvedValue(json({ data: { minAppVersion: '99.0.0', activityTypes: [] } }));
    const seenLogo = jest.fn();
    await openApp();
    await waitFor(() => {
      if (screen.queryByLabelText('Fluveny')) seenLogo();
      expect(screen.getByText(UPDATE_TITLE)).toBeTruthy();
    });
    expect(seenLogo).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Fluveny')).toBeNull();
    expect(screen).toHavePathname('/atualize');
  });

  it('/meta falha: com o SplashGate e a pilha usando o /meta, o erro vai uma vez só ao log e ao Sentry', async () => {
    global.fetch = jest.fn(async () => new Response('Bad Gateway', { status: 502 }));
    await openApp();
    expect(await screen.findByLabelText('Fluveny', {}, { timeout: 4000 })).toBeTruthy();
    const apiErrors = (sentry.captureError as jest.Mock).mock.calls.filter(([e]) => e instanceof ApiError);
    expect(apiErrors).toHaveLength(1);
    expect(warn.mock.calls.filter(([m]) => String(m).includes('[meta]'))).toHaveLength(1);
    // Uma tentativa e um retry, sem refazer ao montar a pilha.
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
