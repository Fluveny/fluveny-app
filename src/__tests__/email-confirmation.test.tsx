// Matriz da 2.2 (e-mail de confirmação no App): uma linha por teste.
import { focusManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, AppState, Platform } from 'react-native';

import { RootStack } from '../../app/_layout';
import ConfirmEmail, {
  CONFIRMED_BODY,
  CONFIRMED_TITLE,
  CONFIRMING_TEXT,
  CONTINUE_LABEL,
  GO_HOME_LABEL,
  INVALID_BODY,
  INVALID_TITLE,
  RETRY_LABEL,
} from '../../app/(public)/confirmar-email';
import ComingSoon from '../../app/(public)/em-breve';
import SignIn from '../../app/(public)/entrar';
import Root from '../../app/(public)/index';
import PrivacyPolicy from '../../app/(public)/privacidade';
import TermsOfUse from '../../app/(public)/termos';
import SignUp from '../../app/(student)/cadastro';
import StageTwoInvite from '../../app/(student)/convite';
import Player from '../../app/(student)/player';
import UpdateRequired from '../../app/atualize';
import { messageFor, NETWORK_ERROR } from '../api/errors';
import { mockResponse } from '../api/mocks/handlers';
import {
  forceMockResend,
  MOCK_CREATED,
  mockConfirmationToken,
  mockRoutes,
  resetMockStudents,
} from '../api/mocks/routes';
import { AppProviders, createQueryClient } from '../AppProviders';
import { forgetConfirmation } from '../auth/emailConfirmation';
import { forgetCachedSession } from '../auth/session';
import { STUDENT_QUERY_KEY, type StudentProfile } from '../auth/student';
import { confirmationResent, confirmationSent, RESEND_LABEL } from '../auth/StudentHome';
import { clearVisitorCache } from '../visitor/useVisitor';

jest.mock('../observability/sentry', () => {
  const actual = jest.requireActual('../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });

const CONFIRM = '/api/v1/account/email-confirmation';
const RESEND = '/api/v1/students/me/email-confirmation';
const ME = '/api/v1/students/me';

/** Troca a resposta de uma rota (`MÉTODO caminho`) por um teste; pode ser uma promessa. */
let override: Partial<Record<string, () => Response | Promise<Response>>> = {};

type Sent = { method: string; path: string; body: unknown };
const sent: Sent[] = [];

/** A API respondendo com os mocks de `routes.ts`. */
function apiResponds() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = new URL(url).pathname;
    sent.push({ method, path, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    const forced = override[`${method} ${path}`];
    if (forced) return forced();
    if (path === '/api/v1/meta') return json({ data: { minAppVersion: '0.0.0', activityTypes: [] } });
    const routes = mockRoutes as unknown as Record<string, Record<string, (request: Request) => unknown>>;
    const resolve = routes[path]?.[method.toLowerCase()];
    if (!resolve) return json({ code: 'NOT_FOUND' }, 404);
    const status = MOCK_CREATED.has(`${method} ${path}`) ? 201 : 200;
    return mockResponse(resolve, new Request(url, init), status);
  }) as jest.Mock;
}

const ofRoute = (method: string, path: string) =>
  sent.filter((request) => request.method === method && request.path === path);

async function openApp(initialUrl = '/', student?: StudentProfile) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  if (student) client.setQueryData(STUDENT_QUERY_KEY, student);
  await renderRouter(
    {
      _layout: () => (
        <AppProviders client={client}>
          <RootStack />
        </AppProviders>
      ),
      '(public)/index': Root,
      '(public)/em-breve': ComingSoon,
      '(public)/entrar': SignIn,
      '(public)/privacidade': PrivacyPolicy,
      '(public)/termos': TermsOfUse,
      '(public)/confirmar-email': ConfirmEmail,
      '(student)/player': Player,
      '(student)/convite': StageTwoInvite,
      '(student)/cadastro': SignUp,
      atualize: UpdateRequired,
    },
    { initialUrl },
  );
  return client;
}

const ADULT = {
  email: 'ana@exemplo.test',
  password: 'segredo123',
  birthDate: '1990-05-20',
  name: 'Ana',
  acceptedTermsVersion: '0.2',
  acceptedPrivacyVersion: '0.3',
};

/** Cria a conta no mock (e a sessão dele). No Android, guarda o token como o App guardaria. */
async function mockAccount(): Promise<StudentProfile> {
  const client = Platform.OS === 'web' ? 'web' : 'android';
  const created = await mockRoutes['/api/v1/auth/signup'].post(
    new Request('http://mock/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'X-Fluveny-Client': client },
      body: JSON.stringify(ADULT),
    }),
  );
  if (created.data.sessionToken) global.__secureStore.set('fluveny.session', created.data.sessionToken);
  forgetCachedSession();
  return created.data.student;
}

/** Confirma a conta do mock por fora do App (o link aberto no navegador). */
async function confirmOutside() {
  await mockRoutes[CONFIRM].post(
    new Request('http://mock', { method: 'POST', body: JSON.stringify({ token: mockConfirmationToken() }) }),
  );
}

const os = Platform.OS;

function asWeb() {
  Platform.OS = 'web';
  const win = window as unknown as Record<string, unknown>;
  win.addEventListener ??= () => {};
  win.removeEventListener ??= () => {};
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  Platform.OS = 'android';
  global.__resetSqlite();
  global.__resetSecureStore();
  global.__resetNetwork();
  forgetCachedSession();
  clearVisitorCache();
  resetMockStudents();
  forgetConfirmation();
  override = {};
  sent.length = 0;
  apiResponds();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  Platform.OS = os;
  jest.restoreAllMocks();
});

describe('página /confirmar-email (2.2)', () => {
  it('confirmar: 1 POST com o token, "E-mail confirmado!" e a URL sem o token', async () => {
    asWeb();
    await mockAccount();
    const token = mockConfirmationToken()!;
    await openApp(`/confirmar-email?token=${token}`);
    expect(await screen.findByRole('header', { name: CONFIRMED_TITLE })).toBeTruthy();
    expect(screen.getByText(CONFIRMED_BODY)).toBeTruthy();
    expect(ofRoute('POST', CONFIRM)).toEqual([{ method: 'POST', path: CONFIRM, body: { token } }]);
    expect(screen).toHavePathname('/confirmar-email');
    expect(screen).toHaveSearchParams({});
  });

  it('enquanto envia: "Confirmando seu e-mail…"', async () => {
    let answer!: (response: Response) => void;
    override[`POST ${CONFIRM}`] = () => new Promise<Response>((resolve) => (answer = resolve));
    await openApp('/confirmar-email?token=abc');
    expect(await screen.findByText(CONFIRMING_TEXT)).toBeTruthy();
    await act(async () => answer(json({ data: null, message: 'E-mail confirmado.' })));
    expect(await screen.findByRole('header', { name: CONFIRMED_TITLE })).toBeTruthy();
  });

  it('confirmar logado: depois do 200, o perfil fica confirmado e CONTINUAR leva a / sem a faixa', async () => {
    const student = await mockAccount();
    await openApp(`/confirmar-email?token=${mockConfirmationToken()}`, student);
    expect(await screen.findByRole('header', { name: CONFIRMED_TITLE })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: CONTINUE_LABEL }));
    expect(await screen.findByTestId('student-home')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('email-confirmation-banner')).toBeNull());
    expect(screen).toHavePathname('/');
  });

  it('link inválido (410): "Este link não vale mais." e IR PARA O INÍCIO', async () => {
    await openApp('/confirmar-email?token=desconhecido');
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(screen.getByText(INVALID_BODY)).toBeTruthy();
    expect(ofRoute('POST', CONFIRM)).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: GO_HOME_LABEL }));
    await waitFor(() => expect(screen).toHavePathname('/'));
  });

  it('sem token: a mesma tela do 410, sem POST', async () => {
    await openApp('/confirmar-email');
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM)).toHaveLength(0);
  });

  it('sem rede: messageFor + TENTAR DE NOVO com o mesmo token', async () => {
    await mockAccount();
    const token = mockConfirmationToken()!;
    override[`POST ${CONFIRM}`] = () => Promise.reject(new TypeError('Network request failed'));
    await openApp(`/confirmar-email?token=${token}`);
    expect(await screen.findByRole('header', { name: messageFor(NETWORK_ERROR) })).toBeTruthy();
    expect(screen.getByRole('button', { name: GO_HOME_LABEL })).toBeTruthy();
    delete override[`POST ${CONFIRM}`];
    await fireEvent.press(screen.getByRole('button', { name: RETRY_LABEL }));
    expect(await screen.findByRole('header', { name: CONFIRMED_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM).map((request) => request.body)).toEqual([{ token }, { token }]);
  });

  it('429: a mensagem de TOO_MANY_REQUESTS com TENTAR DE NOVO', async () => {
    override[`POST ${CONFIRM}`] = () => json({ code: 'TOO_MANY_REQUESTS' }, 429);
    await openApp('/confirmar-email?token=abc');
    expect(await screen.findByRole('header', { name: messageFor('TOO_MANY_REQUESTS') })).toBeTruthy();
    expect(screen.getByRole('button', { name: RETRY_LABEL })).toBeTruthy();
  });

  it('saiu por outro caminho depois de confirmar: /confirmar-email sem token é o link inválido, sem POST', async () => {
    await mockAccount();
    await openApp(`/confirmar-email?token=${mockConfirmationToken()}`);
    expect(await screen.findByRole('header', { name: CONFIRMED_TITLE })).toBeTruthy();
    await act(async () => router.replace('/'));
    await act(async () => router.replace('/confirmar-email'));
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM)).toHaveLength(1);
  });

  it('link mexido (400 VALIDATION_FAILED): a tela do link inválido', async () => {
    override[`POST ${CONFIRM}`] = () => json({ code: 'VALIDATION_FAILED' }, 400);
    await openApp('/confirmar-email?token=abc');
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(screen.queryByRole('button', { name: RETRY_LABEL })).toBeNull();
  });

  it('token com mais de 128 caracteres: a tela do link inválido, sem POST', async () => {
    await openApp(`/confirmar-email?token=${'a'.repeat(129)}`);
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM)).toHaveLength(0);
  });

  it('remonte: a tela monta duas vezes (a segunda já sem o token na URL) e sai 1 POST só', async () => {
    let answer!: (response: Response) => void;
    override[`POST ${CONFIRM}`] = () => new Promise<Response>((resolve) => (answer = resolve));
    await openApp('/confirmar-email?token=abc');
    await screen.findByText(CONFIRMING_TEXT);
    // O `replace` troca a tela da pilha por outra instância: monta de novo, já sem o token na URL.
    await act(async () => router.replace('/confirmar-email'));
    await screen.findByText(CONFIRMING_TEXT);
    await act(async () => answer(json({ data: null })));
    expect(await screen.findByRole('header', { name: CONFIRMED_TITLE })).toBeTruthy();
    expect(ofRoute('POST', CONFIRM)).toHaveLength(1);
  });
});

describe('faixa e reenvio na tela inicial (2.2)', () => {
  it('faixa: com emailConfirmed false, o e-mail e REENVIAR', async () => {
    const student = await mockAccount();
    await openApp('/', student);
    expect(await screen.findByText(confirmationSent(student.email))).toBeTruthy();
    expect(screen.getByRole('button', { name: RESEND_LABEL })).toBeTruthy();
  });

  it('sem faixa: com emailConfirmed true', async () => {
    const student = await mockAccount();
    await openApp('/', { ...student, emailConfirmed: true });
    expect(await screen.findByTestId('student-home')).toBeTruthy();
    expect(screen.queryByTestId('email-confirmation-banner')).toBeNull();
  });

  it('reenviar (202): "Enviamos outro link para {email}…", um POST só mesmo com toque duplo', async () => {
    const student = await mockAccount();
    let answer!: (response: Response) => void;
    override[`POST ${RESEND}`] = () => new Promise<Response>((resolve) => (answer = resolve));
    await openApp('/', student);
    const resend = await screen.findByRole('button', { name: RESEND_LABEL });
    await fireEvent.press(resend);
    expect(screen.getByRole('button', { name: RESEND_LABEL })).toBeDisabled();
    await fireEvent.press(resend);
    await act(async () => answer(new Response(null, { status: 202 })));
    expect(await screen.findByText(confirmationResent(student.email))).toBeTruthy();
    expect(ofRoute('POST', RESEND)).toHaveLength(1);
    expect(ofRoute('POST', RESEND)[0]!.body).toBeUndefined();
  });

  it('já confirmado (409): o perfil é buscado de novo e a faixa some', async () => {
    const student = await mockAccount();
    await confirmOutside();
    await openApp('/', student);
    await fireEvent.press(await screen.findByRole('button', { name: RESEND_LABEL }));
    await waitFor(() => expect(screen.queryByTestId('email-confirmation-banner')).toBeNull());
    expect(ofRoute('GET', ME).length).toBeGreaterThan(0);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(messageFor('EMAIL_ALREADY_CONFIRMED'));
  });

  it('já confirmado (409) e a nova busca do perfil falha: a faixa avisa que o e-mail já está confirmado', async () => {
    const student = await mockAccount();
    forceMockResend('EMAIL_ALREADY_CONFIRMED');
    override[`GET ${ME}`] = () => Promise.reject(new TypeError('Network request failed'));
    await openApp('/', student);
    await fireEvent.press(await screen.findByRole('button', { name: RESEND_LABEL }));
    expect(await screen.findByText(messageFor('EMAIL_ALREADY_CONFIRMED'))).toBeTruthy();
    expect(ofRoute('GET', ME).length).toBeGreaterThan(0);
  });

  it('reenviar demais (429): a mensagem de TOO_MANY_REQUESTS', async () => {
    const student = await mockAccount();
    forceMockResend('TOO_MANY_REQUESTS');
    await openApp('/', student);
    await fireEvent.press(await screen.findByRole('button', { name: RESEND_LABEL }));
    expect(await screen.findByText(messageFor('TOO_MANY_REQUESTS'))).toBeTruthy();
    expect(screen.getByRole('button', { name: RESEND_LABEL })).toBeTruthy();
  });

  it('volta ao App (Android): confirmou no navegador, o App volta ao primeiro plano e a faixa some', async () => {
    let onChange: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'change') onChange = listener as (state: string) => void;
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
    const student = await mockAccount();
    await openApp('/', student);
    expect(await screen.findByTestId('email-confirmation-banner')).toBeTruthy();
    await confirmOutside();
    await act(async () => {
      onChange?.('background');
      onChange?.('active');
    });
    await waitFor(() => expect(screen.queryByTestId('email-confirmation-banner')).toBeNull());
    expect(onChange).toBeDefined();
  });

  it('volta ao App com o e-mail já confirmado: não busca o perfil de novo', async () => {
    let onChange: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'change') onChange = listener as (state: string) => void;
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
    const student = await mockAccount();
    await openApp('/', { ...student, emailConfirmed: true });
    expect(await screen.findByTestId('student-home')).toBeTruthy();
    await act(async () => {
      onChange?.('background');
      onChange?.('active');
    });
    expect(onChange).toBeDefined();
    expect(ofRoute('GET', ME)).toHaveLength(0);
  });

  it('aba volta (web): o visibilitychange busca o perfil de novo', async () => {
    asWeb();
    const listeners = new Map<string, () => void>();
    const win = window as unknown as Record<string, unknown>;
    const [addBefore, removeBefore] = [win.addEventListener, win.removeEventListener];
    win.addEventListener = (type: string, listener: () => void) => listeners.set(type, listener);
    win.removeEventListener = () => {};
    const hadDocument = 'document' in globalThis;
    const doc = { visibilityState: 'visible' };
    if (!hadDocument) (globalThis as Record<string, unknown>).document = doc;
    const visibility = hadDocument
      ? jest
          .spyOn(document, 'visibilityState', 'get')
          .mockImplementation(() => doc.visibilityState as DocumentVisibilityState)
      : null;
    try {
      const student = await mockAccount();
      await openApp('/', student);
      expect(await screen.findByTestId('email-confirmation-banner')).toBeTruthy();
      await confirmOutside();
      await act(async () => {
        doc.visibilityState = 'hidden';
        listeners.get('visibilitychange')?.();
        doc.visibilityState = 'visible';
        listeners.get('visibilitychange')?.();
      });
      await waitFor(() => expect(screen.queryByTestId('email-confirmation-banner')).toBeNull());
      expect(listeners.has('visibilitychange')).toBe(true);
    } finally {
      win.addEventListener = addBefore;
      win.removeEventListener = removeBefore;
      visibility?.mockRestore();
      if (!hadDocument) delete (globalThis as Record<string, unknown>).document;
      focusManager.setFocused(undefined);
    }
  });

  it('volta ao App (web): o foco da janela busca o perfil de novo', async () => {
    asWeb();
    const listeners = new Map<string, () => void>();
    const win = window as unknown as Record<string, unknown>;
    const [addBefore, removeBefore] = [win.addEventListener, win.removeEventListener];
    win.addEventListener = (type: string, listener: () => void) => listeners.set(type, listener);
    win.removeEventListener = () => {};
    try {
      const student = await mockAccount();
      await openApp('/', student);
      expect(await screen.findByTestId('email-confirmation-banner')).toBeTruthy();
      await confirmOutside();
      await act(async () => {
        listeners.get('blur')?.();
        listeners.get('focus')?.();
      });
      await waitFor(() => expect(screen.queryByTestId('email-confirmation-banner')).toBeNull());
    } finally {
      win.addEventListener = addBefore;
      win.removeEventListener = removeBefore;
      focusManager.setFocused(undefined);
    }
  });
});
