import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking, Platform } from 'react-native';

import UpdateRequired, {
  clearReloadMark,
  RELOAD_KEY,
  RELOAD_RETRY_MS,
  reloadOnce,
  STORE_FAILED,
  storeUrl,
  UPDATE_BUTTON,
  UPDATE_PENDING,
} from '../../app/atualize';
import * as sentry from '../observability/sentry';

const appJson = require('../../app.json');

jest.mock('../observability/sentry', () => {
  const actual = jest.requireActual('../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const brokenStorage = () => ({
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
});

let openURL: jest.SpyInstance;
const originalStoreUrl = process.env.EXPO_PUBLIC_STORE_URL;

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_STORE_URL;
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  (sentry.captureError as jest.Mock).mockClear();
  clearReloadMark(brokenStorage());
});

afterEach(() => openURL.mockRestore());

afterAll(() => {
  process.env.EXPO_PUBLIC_STORE_URL = originalStoreUrl;
});

describe('botão ATUALIZAR (nativo)', () => {
  it('abre a URL de EXPO_PUBLIC_STORE_URL', async () => {
    process.env.EXPO_PUBLIC_STORE_URL = 'https://loja.exemplo.test/fluveny';
    try {
      await render(<UpdateRequired />);
      await fireEvent.press(screen.getByRole('button', { name: UPDATE_BUTTON }));
      expect(openURL).toHaveBeenCalledWith('https://loja.exemplo.test/fluveny');
    } finally {
      delete process.env.EXPO_PUBLIC_STORE_URL;
    }
  });

  it('sem a variável, abre a página do pacote do app.json na Play', async () => {
    const expected = `https://play.google.com/store/apps/details?id=${appJson.expo.android.package}`;
    expect(storeUrl()).toBe(expected);
    await render(<UpdateRequired />);
    await fireEvent.press(screen.getByRole('button', { name: UPDATE_BUTTON }));
    expect(openURL).toHaveBeenCalledWith(expected);
  });

  it('a loja não abre: vai para o Sentry e mostra o aviso da loja', async () => {
    openURL.mockRejectedValue(new Error('no handler'));
    await render(<UpdateRequired />);
    await fireEvent.press(screen.getByRole('button', { name: UPDATE_BUTTON }));
    expect(await screen.findByText(STORE_FAILED)).toBeTruthy();
    expect(screen.queryByText(UPDATE_PENDING)).toBeNull();
    expect(sentry.captureError).toHaveBeenCalled();
  });

  it('o botão fica desabilitado enquanto a atualização está em andamento', async () => {
    let finish: () => void = () => {};
    openURL.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await render(<UpdateRequired />);
    // O primeiro toque fica pendurado na loja: não dá para esperar por ele aqui.
    const first = fireEvent.press(screen.getByRole('button', { name: UPDATE_BUTTON }));
    await waitFor(() => expect(screen.getByRole('button', { name: UPDATE_BUTTON })).toBeDisabled());
    const second = fireEvent.press(screen.getByRole('button', { name: UPDATE_BUTTON }));
    expect(openURL).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second]);
    await waitFor(() => expect(screen.getByRole('button', { name: UPDATE_BUTTON })).toBeEnabled());
  });
});

describe('botão ATUALIZAR (web)', () => {
  const platform = Platform.OS;
  let storage: ReturnType<typeof memoryStorage>;
  let reload: jest.Mock;
  let originalWindow: PropertyDescriptor | undefined;

  beforeEach(() => {
    Platform.OS = 'web';
    storage = memoryStorage();
    reload = jest.fn();
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { ...globalThis, sessionStorage: storage, location: { reload } },
    });
  });

  afterEach(() => {
    Platform.OS = platform;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  });

  it('1º toque recarrega; 2º toque, na mesma sessão, mostra o aviso', async () => {
    await render(<UpdateRequired />);
    await fireEvent.press(screen.getByRole('button', { name: UPDATE_BUTTON }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(RELOAD_KEY)).not.toBeNull();
    expect(screen.queryByText(UPDATE_PENDING)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: UPDATE_BUTTON }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(UPDATE_PENDING)).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
  });
});

describe('reloadOnce', () => {
  it('recarrega na primeira vez e grava o horário', () => {
    const storage = memoryStorage();
    const reload = jest.fn();
    expect(reloadOnce(storage, reload, 1_000)).toBe(true);
    expect(storage.getItem(RELOAD_KEY)).toBe('1000');
  });

  it('não recarrega de novo antes de 5 min; depois, recarrega', () => {
    const storage = memoryStorage();
    const reload = jest.fn();
    reloadOnce(storage, reload, 1_000);
    expect(reloadOnce(storage, reload, 1_000 + RELOAD_RETRY_MS - 1)).toBe(false);
    expect(reloadOnce(storage, reload, 1_000 + RELOAD_RETRY_MS)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('clearReloadMark libera o reload na hora', () => {
    const storage = memoryStorage();
    const reload = jest.fn();
    reloadOnce(storage, reload, 1_000);
    clearReloadMark(storage);
    expect(storage.getItem(RELOAD_KEY)).toBeNull();
    expect(reloadOnce(storage, reload, 2_000)).toBe(true);
  });

  it('sessionStorage que lança: usa a marca em memória', () => {
    const storage = brokenStorage();
    const reload = jest.fn();
    expect(reloadOnce(storage, reload, 1_000)).toBe(true);
    expect(reloadOnce(storage, reload, 2_000)).toBe(false);
    clearReloadMark(storage);
    expect(reloadOnce(storage, reload, 3_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
