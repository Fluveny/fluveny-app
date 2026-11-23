// Matriz da 2.3 (entrar e sair no App): uma linha por teste.
import type { QueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, Platform } from 'react-native';

import { RootStack } from '../../app/_layout';
import ComingSoon from '../../app/(public)/em-breve';
import RecoverPassword, { RECOVER_TITLE } from '../../app/(public)/recuperar-senha';
import ResetPassword from '../../app/(public)/redefinir-senha';
import SignIn, {
  CREATE_ACCOUNT_LINK,
  EMAIL_EMPTY,
  EMAIL_FIELD,
  FORGOT_LINK,
  PASSWORD_EMPTY,
  PASSWORD_FIELD,
  SESSION_ENDED,
  SIGN_IN_LABEL,
  SIGN_IN_TITLE,
} from '../../app/(public)/entrar';
import ConfirmEmail from '../../app/(public)/confirmar-email';
import Root, { SIGN_IN, WELCOME_TITLE } from '../../app/(public)/index';
import PrivacyPolicy from '../../app/(public)/privacidade';
import TermsOfUse from '../../app/(public)/termos';
import SignUp, { SIGNUP_TITLE } from '../../app/(student)/cadastro';
import StageTwoInvite from '../../app/(student)/convite';
import Player from '../../app/(student)/player';
import { CLIENT_HEADER } from '../api/client';
import { GENERIC_MESSAGE, messageFor, NETWORK_ERROR } from '../api/errors';
import { mockResponse } from '../api/mocks/handlers';
import {
  deactivateMockAccount,
  expireMockSession,
  forceMockLogin,
  MOCK_CREATED,
  MOCK_NO_CONTENT,
  mockRoutes,
  resetMockStudents,
} from '../api/mocks/routes';
import { AppProviders, createQueryClient } from '../AppProviders';
import { returnPath } from '../auth/sessionEnd';
import { forgetCachedSession } from '../auth/session';
import { STUDENT_QUERY_KEY } from '../auth/student';
import { RESEND_LABEL, SIGN_OUT_BODY, SIGN_OUT_LABEL, SIGN_OUT_TITLE, studentGreeting } from '../auth/StudentHome';
import * as session from '../auth/session';
import { captureError } from '../observability/sentry';
import { visitorStore } from '../visitor/store';
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

const LOGIN = '/api/v1/auth/login';
const LOGOUT = '/api/v1/auth/logout';
const RESEND = '/api/v1/students/me/email-confirmation';
const ME = '/api/v1/students/me';

/** Troca a resposta de uma rota (`MÉTODO caminho`) por um teste; pode ser uma promessa. */
let override: Partial<Record<string, () => Response | Promise<Response>>> = {};

type Sent = { method: string; path: string; headers: Headers; credentials?: RequestCredentials; body: unknown };
const sent: Sent[] = [];

/** A API respondendo com os mocks de `routes.ts` (201 do cadastro, 204 do sair). */
function apiResponds() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = new URL(url).pathname;
    sent.push({
      method,
      path,
      headers: new Headers(init?.headers),
      credentials: init?.credentials,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const forced = override[`${method} ${path}`];
    if (forced) return forced();
    if (path === '/api/v1/meta') return json({ data: { minAppVersion: '0.0.0', activityTypes: [] } });
    const routes = mockRoutes as unknown as Record<string, Record<string, (request: Request) => unknown>>;
    const resolve = routes[path]?.[method.toLowerCase()];
    if (!resolve) return json({ code: 'NOT_FOUND' }, 404);
    const key = `${method} ${path}`;
    return mockResponse(resolve, new Request(url, init), MOCK_CREATED.has(key) ? 201 : 200, MOCK_NO_CONTENT.has(key));
  }) as jest.Mock;
}

const ofRoute = (method: string, path: string) =>
  sent.filter((request) => request.method === method && request.path === path);

let client: QueryClient;

async function openApp(initialUrl = '/') {
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  await renderRouter(
    {
      _layout: () => (
        <AppProviders client={client}>
          <RootStack />
        </AppProviders>
      ),
      '(public)/index': Root,
      '(public)/em-breve': ComingSoon,
      '(public)/recuperar-senha': RecoverPassword,
      '(public)/redefinir-senha': ResetPassword,
      '(public)/entrar': SignIn,
      '(public)/privacidade': PrivacyPolicy,
      '(public)/termos': TermsOfUse,
      '(public)/confirmar-email': ConfirmEmail,
      '(student)/player': Player,
      '(student)/convite': StageTwoInvite,
      '(student)/cadastro': SignUp,
    },
    { initialUrl },
  );
}

const ADULT = {
  email: 'ana@exemplo.test',
  password: 'segredo123',
  birthDate: '1990-05-20',
  name: 'Ana',
  acceptedTermsVersion: '0.2',
  acceptedPrivacyVersion: '0.3',
};

/** Uma conta no mock, sem sessão aberta (o aluno entra pela tela). */
async function mockAccount(account: typeof ADULT = ADULT) {
  await mockRoutes['/api/v1/auth/signup'].post(
    new Request('http://mock/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'X-Fluveny-Client': 'web' },
      body: JSON.stringify(account),
    }),
  );
  expireMockSession();
}

const button = (name: string) => screen.getByRole('button', { name });

async function fill(email = ADULT.email, password = ADULT.password) {
  await screen.findByRole('header', { name: SIGN_IN_TITLE });
  await fireEvent.changeText(screen.getByLabelText(EMAIL_FIELD), email);
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_FIELD), password);
}

/** Abre a boas-vindas, toca ENTRAR, preenche e envia. */
async function signInFromWelcome(email?: string, password?: string) {
  await openApp();
  await fireEvent.press(await screen.findByRole('button', { name: SIGN_IN }));
  await fill(email, password);
  await fireEvent.press(button(SIGN_IN_LABEL));
}

const os = Platform.OS;

function asWeb() {
  Platform.OS = 'web';
  const win = window as unknown as Record<string, unknown>;
  win.addEventListener ??= () => {};
  win.removeEventListener ??= () => {};
}

let consoleError: jest.SpyInstance;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  Platform.OS = 'android';
  global.__resetSqlite();
  global.__resetSecureStore();
  global.__resetNetwork();
  forgetCachedSession();
  clearVisitorCache();
  resetMockStudents();
  override = {};
  sent.length = 0;
  apiResponds();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  consoleError = jest.spyOn(console, 'error');
});

afterEach(() => {
  const setStateInRender = consoleError.mock.calls.filter((args) => /Cannot update a component/.test(String(args[0])));
  expect(setStateInRender).toEqual([]);
  Platform.OS = os;
  jest.restoreAllMocks();
});

describe('Entrar (2.3)', () => {
  it('web: 200, sessão só no cookie, Aluno no cache e "Hi, {nome}!" na raiz, sem Entrar na pilha', async () => {
    asWeb();
    await mockAccount();
    await signInFromWelcome();
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
    const [login] = ofRoute('POST', LOGIN);
    expect(login!.body).toEqual({ email: ADULT.email, password: ADULT.password });
    expect(login!.headers.get(CLIENT_HEADER)).toBe('web');
    expect(login!.credentials).toBe('include');
    expect(global.__secureStore.size).toBe(0);
    expect(client.getQueryData(STUDENT_QUERY_KEY)).toEqual(expect.objectContaining({ email: ADULT.email }));
  });

  it('Android: token no expo-secure-store e as próximas chamadas com Bearer', async () => {
    await mockAccount();
    await signInFromWelcome();
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    const token = global.__secureStore.get('fluveny.session');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await fireEvent.press(button(RESEND_LABEL));
    await waitFor(() => expect(ofRoute('POST', RESEND)).toHaveLength(1));
    expect(ofRoute('POST', RESEND)[0]!.headers.get('Authorization')).toBe(`Bearer ${token}`);
  });

  it('senha errada (401): mensagem genérica, campos preenchidos e nada de ir a Entrar de novo', async () => {
    await mockAccount();
    await signInFromWelcome(ADULT.email, 'errada123');
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeTruthy();
    expect(messageFor('INVALID_CREDENTIALS')).toBe('E-mail ou senha incorretos.');
    expect(screen.getByLabelText(EMAIL_FIELD).props.value).toBe(ADULT.email);
    expect(screen.getByLabelText(PASSWORD_FIELD).props.value).toBe('errada123');
    expect(screen).toHavePathname('/entrar');
    expect(screen).toHaveSearchParams({});
    expect(screen.queryByText(SESSION_ENDED)).toBeNull();
  });

  it('conta desativada (403): "Esta conta está desativada."', async () => {
    await mockAccount();
    deactivateMockAccount(ADULT.email);
    await signInFromWelcome();
    expect(await screen.findByText('Esta conta está desativada.')).toBeTruthy();
  });

  it('atraso (429 LOGIN_THROTTLED): a mensagem de espera', async () => {
    await mockAccount();
    forceMockLogin('LOGIN_THROTTLED');
    await signInFromWelcome();
    expect(await screen.findByText('Muitas tentativas seguidas. Espere um pouco e tente de novo.')).toBeTruthy();
  });

  it('sem rede: messageFor(NETWORK_ERROR), e os campos ficam', async () => {
    override[`POST ${LOGIN}`] = () => Promise.reject(new TypeError('Network request failed'));
    await signInFromWelcome();
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    expect(screen.getByLabelText(PASSWORD_FIELD).props.value).toBe(ADULT.password);
  });

  it('vazio: não envia, e cada campo explica', async () => {
    await openApp('/entrar');
    await screen.findByRole('header', { name: SIGN_IN_TITLE });
    await fireEvent.press(button(SIGN_IN_LABEL));
    expect(await screen.findByText(EMAIL_EMPTY)).toBeTruthy();
    expect(screen.getByText(PASSWORD_EMPTY)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(EMAIL_FIELD), ADULT.email);
    await fireEvent.press(button(SIGN_IN_LABEL));
    expect(screen.queryByText(EMAIL_EMPTY)).toBeNull();
    expect(screen.getByText(PASSWORD_EMPTY)).toBeTruthy();
    expect(ofRoute('POST', LOGIN)).toHaveLength(0);
  });

  it('toque duplo: um POST só', async () => {
    await mockAccount();
    let answer!: (response: Response) => void;
    override[`POST ${LOGIN}`] = () => new Promise<Response>((resolve) => (answer = resolve));
    await openApp('/entrar');
    await fill();
    await act(async () => {
      fireEvent.press(button(SIGN_IN_LABEL));
      fireEvent.press(button(SIGN_IN_LABEL));
    });
    expect(ofRoute('POST', LOGIN)).toHaveLength(1);
    await act(async () => answer(json({ code: 'INVALID_CREDENTIALS' }, 401)));
    expect(await screen.findByText(messageFor('INVALID_CREDENTIALS'))).toBeTruthy();
  });

  it('volta=/player: depois do 200, o player; o aviso só com motivo=sessao, e some na tentativa', async () => {
    await mockAccount();
    await openApp('/entrar?volta=%2Fplayer&motivo=sessao');
    expect(await screen.findByText(SESSION_ENDED)).toBeTruthy();
    await fill();
    await fireEvent.press(button(SIGN_IN_LABEL));
    await waitFor(() => expect(screen).toHavePathname('/player'));
  });

  it('volta externa ou fora da lista: a raiz', async () => {
    expect(returnPath('https://mal.exemplo.test/')).toBe('/');
    expect(returnPath('//mal.exemplo.test')).toBe('/');
    expect(returnPath('/cadastro')).toBe('/');
    expect(returnPath(undefined)).toBe('/');
    expect(returnPath(['/player', '/'])).toBe('/player');
    await mockAccount();
    await openApp('/entrar?volta=https%3A%2F%2Fmal.exemplo.test%2F');
    await fill();
    await fireEvent.press(button(SIGN_IN_LABEL));
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(screen).toHavePathname('/');
  });

  it('aberta à mão com volta e sem motivo: sem o aviso; ele também some depois de uma tentativa', async () => {
    await openApp('/entrar?volta=%2F');
    await screen.findByRole('header', { name: SIGN_IN_TITLE });
    expect(screen.queryByText(SESSION_ENDED)).toBeNull();
    override[`POST ${LOGIN}`] = () => json({ code: 'INVALID_CREDENTIALS' }, 401);
    await act(async () => router.setParams({ motivo: 'sessao' }));
    expect(await screen.findByText(SESSION_ENDED)).toBeTruthy();
    await fill();
    await fireEvent.press(button(SIGN_IN_LABEL));
    expect(await screen.findByText(messageFor('INVALID_CREDENTIALS'))).toBeTruthy();
    expect(screen.queryByText(SESSION_ENDED)).toBeNull();
  });

  it('senha errada e depois a certa: entra (2 POSTs)', async () => {
    await mockAccount();
    await signInFromWelcome(ADULT.email, 'errada123');
    expect(await screen.findByText(messageFor('INVALID_CREDENTIALS'))).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(PASSWORD_FIELD), ADULT.password);
    await fireEvent.press(button(SIGN_IN_LABEL));
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(ofRoute('POST', LOGIN)).toHaveLength(2);
  });

  it('teclado: o e-mail leva à senha, e "ir" na senha envia', async () => {
    await mockAccount();
    await openApp('/entrar');
    await fill();
    expect(screen.getByLabelText(EMAIL_FIELD).props.returnKeyType).toBe('next');
    expect(screen.getByLabelText(PASSWORD_FIELD).props.returnKeyType).toBe('go');
    await fireEvent(screen.getByLabelText(PASSWORD_FIELD), 'submitEditing');
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(ofRoute('POST', LOGIN)).toHaveLength(1);
  });

  it('com Aluno no cache: /entrar vai direto ao destino, sem formulário e sem POST', async () => {
    await mockAccount();
    await signInFromWelcome();
    await screen.findByRole('header', { name: studentGreeting('Ana') });
    await act(async () => router.navigate('/entrar?volta=%2Fplayer'));
    await waitFor(() => expect(screen).toHavePathname('/player'));
    expect(ofRoute('POST', LOGIN)).toHaveLength(1);
  });

  it('erro fora da API depois do 200 (armazenamento seguro): Sentry e a mensagem genérica, não "sem rede"', async () => {
    await mockAccount();
    jest.spyOn(session, 'saveSessionToken').mockRejectedValue(new Error('keystore'));
    await signInFromWelcome();
    expect(await screen.findByText(GENERIC_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(messageFor(NETWORK_ERROR))).toBeNull();
    expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ message: 'keystore' }));
  });

  it('"Esqueci minha senha" leva a Recuperar senha (2.8); "Criar conta", ao cadastro', async () => {
    await openApp();
    await fireEvent.press(await screen.findByRole('button', { name: SIGN_IN }));
    await screen.findByRole('header', { name: SIGN_IN_TITLE });
    await fireEvent.press(button(FORGOT_LINK));
    expect(await screen.findByRole('header', { name: RECOVER_TITLE })).toBeTruthy();
    expect(screen).toHavePathname('/recuperar-senha');
    await act(async () => router.back());
    await fireEvent.press(await screen.findByRole('button', { name: CREATE_ACCOUNT_LINK }));
    expect(await screen.findByRole('header', { name: SIGNUP_TITLE })).toBeTruthy();
    expect(screen).toHavePathname('/cadastro');
  });
});

/** Entra pela tela e fica na tela inicial do Aluno, com Progresso no aparelho. */
async function signedIn() {
  await mockAccount();
  await visitorStore.setVariable('name', 'Ana');
  await visitorStore.recordProgress({ activityKey: 'a1', outcome: 'completed', xp: 10 });
  await visitorStore.recordReceipt('a1', 'v1.recibo');
  await visitorStore.markSeen('speech-privacy');
  await signInFromWelcome();
  expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
  return visitorStore.deviceId();
}

/** Toca "Sair" e confirma SAIR na folha. */
async function confirmSignOut() {
  await fireEvent.press(button(SIGN_OUT_LABEL));
  await fireEvent.press(await screen.findByTestId('sign-out-sheet-confirm'));
}

describe('Sair (2.3)', () => {
  it('"Sair" abre a folha; CANCELAR fecha sem POST e sem apagar nada', async () => {
    await signedIn();
    await fireEvent.press(button(SIGN_OUT_LABEL));
    expect(await screen.findByText(`${SIGN_OUT_TITLE} ${SIGN_OUT_BODY}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sign-out-sheet-decline'));
    await waitFor(() => expect(screen.queryByText(`${SIGN_OUT_TITLE} ${SIGN_OUT_BODY}`)).toBeNull());
    expect(ofRoute('POST', LOGOUT)).toHaveLength(0);
    expect(screen.getByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(global.__secureStore.size).toBe(1);
    expect(await visitorStore.progress()).toHaveLength(1);
  });

  it('toque duplo em SAIR da folha: um POST só', async () => {
    await signedIn();
    let answer!: (response: Response) => void;
    override[`POST ${LOGOUT}`] = () => new Promise<Response>((resolve) => (answer = resolve));
    await fireEvent.press(button(SIGN_OUT_LABEL));
    const confirm = await screen.findByTestId('sign-out-sheet-confirm');
    await act(async () => {
      fireEvent.press(confirm);
      fireEvent.press(confirm);
    });
    expect(ofRoute('POST', LOGOUT)).toHaveLength(1);
    await act(async () => answer(new Response(null, { status: 204 })));
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
  });

  it('sem rede e depois com rede: sai na segunda (2 POSTs)', async () => {
    await signedIn();
    override[`POST ${LOGOUT}`] = () => Promise.reject(new TypeError('Network request failed'));
    await confirmSignOut();
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    delete override[`POST ${LOGOUT}`];
    await confirmSignOut();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(ofRoute('POST', LOGOUT)).toHaveLength(2);
    expect(global.__secureStore.size).toBe(0);
  });

  it('204: token, cache e loja apagados (o deviceId fica); boas-vindas, sem voltar ao Aluno', async () => {
    const deviceId = await signedIn();
    expect(global.__secureStore.size).toBe(1);
    const token = global.__secureStore.get('fluveny.session');
    client.setQueryData(['outra', 'consulta'], 1);
    await confirmSignOut();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    const [logout] = ofRoute('POST', LOGOUT);
    expect(logout!.headers.get('Authorization')).toBe(`Bearer ${token}`);
    expect(logout!.body).toBeUndefined();
    expect(global.__secureStore.size).toBe(0);
    expect(client.getQueryData(STUDENT_QUERY_KEY)).toBeNull();
    expect(client.getQueryData(['outra', 'consulta'])).toBeUndefined();
    expect(await visitorStore.variables()).toEqual({});
    expect(await visitorStore.progress()).toEqual([]);
    expect(await visitorStore.receipts()).toEqual([]);
    expect(await visitorStore.seen('speech-privacy')).toBe(false);
    expect(await visitorStore.deviceId()).toBe(deviceId);
    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
    // Sem sessão: nada de perguntar o perfil de novo.
    expect(ofRoute('GET', ME)).toHaveLength(0);
  });

  it('web: o sair vai com o cookie (credentials) e a raiz mostra a boas-vindas', async () => {
    asWeb();
    await signedIn();
    await confirmSignOut();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(ofRoute('POST', LOGOUT)[0]!.credentials).toBe('include');
    expect(ofRoute('POST', LOGOUT)[0]!.headers.get(CLIENT_HEADER)).toBe('web');
  });

  it('401 no sair: a sessão já tinha acabado, apaga o local do mesmo jeito', async () => {
    await signedIn();
    override[`POST ${LOGOUT}`] = () => json({ code: 'UNAUTHENTICATED' }, 401);
    await confirmSignOut();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen).toHavePathname('/');
    expect(global.__secureStore.size).toBe(0);
  });

  it('sem rede: a mensagem, e continua logado (token, cache e loja ficam)', async () => {
    await signedIn();
    override[`POST ${LOGOUT}`] = () => Promise.reject(new TypeError('Network request failed'));
    await confirmSignOut();
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    expect(screen.getByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(global.__secureStore.size).toBe(1);
    expect(await visitorStore.progress()).toHaveLength(1);
    expect(screen.getByTestId('dashboard-play')).toBeTruthy();
  });
});

describe('sessão que vence no uso (2.3)', () => {
  it('401 UNAUTHENTICATED com Aluno no cache: Entrar com o aviso e volta=/, loja mantida; entrar volta', async () => {
    await signedIn();
    expireMockSession();
    await fireEvent.press(button(RESEND_LABEL));
    expect(await screen.findByText(SESSION_ENDED)).toBeTruthy();
    expect(screen).toHavePathname('/entrar');
    expect(screen).toHaveSearchParams({ volta: '/', motivo: 'sessao' });
    expect(global.__secureStore.size).toBe(0);
    expect(client.getQueryData(STUDENT_QUERY_KEY)).toBeNull();
    expect(await visitorStore.progress()).toHaveLength(1);
    await fill();
    await fireEvent.press(button(SIGN_IN_LABEL));
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(screen).toHavePathname('/');
  });

  it('no player: volta=/player com a Unidade, o Estágio e a Atividade na tela (2.5)', async () => {
    await signedIn();
    await fireEvent.press(await screen.findByTestId('dashboard-play'));
    await waitFor(() => expect(screen).toHavePathname('/player'));
    const first = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data
      .activities[0]!.activityKey;
    await waitFor(() => expect(screen).toHaveSearchParams({ unidade: 'unit-1', estagio: 'stage-1', atividade: first }));
    expireMockSession();
    // Uma chamada de sessão qualquer no meio do uso (o perfil refeito).
    await act(async () => {
      await client.refetchQueries({ queryKey: STUDENT_QUERY_KEY });
    });
    expect(await screen.findByText(SESSION_ENDED)).toBeTruthy();
    expect(screen).toHaveSearchParams({
      volta: `/player?unidade=unit-1&estagio=stage-1&atividade=${first}`,
      motivo: 'sessao',
    });
  });

  it('outra conta entra depois da sessão vencida: loja e cache do Aluno anterior saem antes', async () => {
    await signedIn();
    await mockAccount({ ...ADULT, email: 'bia@exemplo.test', name: 'Bia' });
    client.setQueryData(['outra', 'consulta'], 1);
    expireMockSession();
    await fireEvent.press(button(RESEND_LABEL));
    expect(await screen.findByText(SESSION_ENDED)).toBeTruthy();
    expect(await visitorStore.progress()).toHaveLength(1);
    await fill('bia@exemplo.test', ADULT.password);
    await fireEvent.press(button(SIGN_IN_LABEL));
    expect(await screen.findByRole('header', { name: studentGreeting('Bia') })).toBeTruthy();
    expect(await visitorStore.variables()).toEqual({});
    expect(await visitorStore.progress()).toEqual([]);
    expect(await visitorStore.receipts()).toEqual([]);
    expect(client.getQueryData(['outra', 'consulta'])).toBeUndefined();
  });

  it('a mesma conta entra de novo: a loja fica', async () => {
    await signedIn();
    expireMockSession();
    await fireEvent.press(button(RESEND_LABEL));
    expect(await screen.findByText(SESSION_ENDED)).toBeTruthy();
    await fill('ANA@exemplo.test', ADULT.password);
    await fireEvent.press(button(SIGN_IN_LABEL));
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(await visitorStore.progress()).toHaveLength(1);
  });

  it('abertura com a sessão vencida: boas-vindas, como na 2.1 (sem ir a Entrar)', async () => {
    await mockAccount();
    global.__secureStore.set('fluveny.session', 'v'.repeat(43));
    forgetCachedSession();
    await openApp();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen).toHavePathname('/');
    expect(screen.queryByText(SESSION_ENDED)).toBeNull();
  });
});
