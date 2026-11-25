// Matriz da 2.8 (recuperação de senha e aviso de e-mail não confirmado no App): uma linha por teste.
import type { QueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, Platform } from 'react-native';

import { RootStack } from '../../app/_layout';
import ConfirmEmail from '../../app/(public)/confirmar-email';
import ComingSoon from '../../app/(public)/em-breve';
import SignIn, {
  FORGOT_LINK,
  PASSWORD_CHANGED,
  PASSWORD_FIELD,
  EMAIL_FIELD as SIGN_IN_EMAIL_FIELD,
  SIGN_IN_LABEL,
  SIGN_IN_TITLE,
} from '../../app/(public)/entrar';
import Root from '../../app/(public)/index';
import PrivacyPolicy from '../../app/(public)/privacidade';
import RecoverPassword, {
  BACK_TO_SIGN_IN,
  EMAIL_EMPTY,
  EMAIL_FIELD,
  RECOVER_BODY,
  RECOVER_TITLE,
  SEND_AGAIN_LINK,
  SEND_LINK_LABEL,
  SENT_AGAIN,
  SENT_TITLE,
  sentBody,
  SIGN_IN_LINK,
} from '../../app/(public)/recuperar-senha';
import ResetPassword, {
  BACK_LABEL,
  GO_HOME_LABEL,
  INVALID_BODY,
  INVALID_TITLE,
  NEW_LINK_LABEL,
  NEW_PASSWORD_FIELD,
  RESET_TITLE,
  SAVE_PASSWORD_LABEL,
} from '../../app/(public)/redefinir-senha';
import TermsOfUse from '../../app/(public)/termos';
import SignUp from '../../app/(student)/cadastro';
import StageTwoInvite from '../../app/(student)/convite';
import Player from '../../app/(student)/player';
import { messageFor, NETWORK_ERROR } from '../api/errors';
import { mockResponse } from '../api/mocks/handlers';
import {
  forceMockRecovery,
  markMockConfirmationOverdue,
  MOCK_CREATED,
  MOCK_NO_CONTENT,
  mockConfirmationToken,
  mockPasswordResetToken,
  mockRoutes,
  resetMockStudents,
} from '../api/mocks/routes';
import { AppProviders, createQueryClient } from '../AppProviders';
import { forgetConfirmation } from '../auth/emailConfirmation';
import { forgetResetToken } from '../auth/passwordReset';
import { forgetCachedSession } from '../auth/session';
import { EMAIL_PROBLEM, PASSWORD_HINT, PASSWORD_PROBLEM } from '../auth/signupForm';
import { STUDENT_QUERY_KEY, type StudentProfile } from '../auth/student';
import { CONFIRM_TO_RECOVER, confirmationSent, RESEND_LABEL, studentGreeting } from '../auth/StudentHome';
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

const RECOVERY = '/api/v1/auth/password-recovery';
const RESET = '/api/v1/auth/password-reset';
const CONFIRM = '/api/v1/account/email-confirmation';

/** Troca a resposta de uma rota (`MÉTODO caminho`) por um teste; pode ser uma promessa. */
let override: Partial<Record<string, () => Response | Promise<Response>>> = {};

type Sent = { method: string; url: string; path: string; headers: Headers; body: unknown };
const sent: Sent[] = [];

/** A API respondendo com os mocks de `routes.ts` (201 do cadastro, 204 do sair e da redefinição). */
function apiResponds() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = new URL(url).pathname;
    sent.push({
      method,
      url,
      path,
      headers: new Headers(init?.headers),
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

async function openApp(initialUrl = '/', student?: StudentProfile) {
  client = createQueryClient();
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
      '(public)/recuperar-senha': RecoverPassword,
      '(public)/redefinir-senha': ResetPassword,
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
const NEW_PASSWORD = 'novasenha42';

/** Cria a conta no mock (e a sessão dele). No Android, guarda o token como o App guardaria. */
async function mockAccount(): Promise<StudentProfile> {
  const kind = Platform.OS === 'web' ? 'web' : 'android';
  const created = await mockRoutes['/api/v1/auth/signup'].post(
    new Request('http://mock/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'X-Fluveny-Client': kind },
      body: JSON.stringify(ADULT),
    }),
  );
  if (created.data.sessionToken) global.__secureStore.set('fluveny.session', created.data.sessionToken);
  forgetCachedSession();
  return created.data.student;
}

/** Conta confirmada com um link de redefinição emitido pelo mock; devolve o token. */
async function accountWithResetLink(): Promise<string> {
  await mockAccount();
  await mockRoutes[CONFIRM].post(
    new Request('http://mock', { method: 'POST', body: JSON.stringify({ token: mockConfirmationToken() }) }),
  );
  await mockRoutes[RECOVERY].post(
    new Request('http://mock', { method: 'POST', body: JSON.stringify({ email: ADULT.email }) }),
  );
  return mockPasswordResetToken()!;
}

const button = (name: string) => screen.getByRole('button', { name });

async function typeEmail(email: string) {
  await screen.findByRole('header', { name: RECOVER_TITLE });
  await fireEvent.changeText(screen.getByLabelText(EMAIL_FIELD), email);
}

async function typePassword(password: string) {
  await screen.findByRole('header', { name: RESET_TITLE });
  await fireEvent.changeText(screen.getByLabelText(NEW_PASSWORD_FIELD), password);
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
  forgetResetToken();
  override = {};
  sent.length = 0;
  apiResponds();
  (captureError as jest.Mock).mockClear();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  Platform.OS = os;
  jest.restoreAllMocks();
});

describe('Recuperar senha (2.8)', () => {
  it('atalho: "I forgot my password" abre /recuperar-senha com o campo vazio e o texto', async () => {
    await openApp('/entrar');
    await screen.findByRole('header', { name: SIGN_IN_TITLE });
    await fireEvent.press(button(FORGOT_LINK));
    expect(await screen.findByRole('header', { name: RECOVER_TITLE })).toBeTruthy();
    expect(screen).toHavePathname('/recuperar-senha');
    expect(screen.getByText(RECOVER_BODY)).toBeTruthy();
    const field = screen.getByLabelText(EMAIL_FIELD);
    expect(field.props.value).toBe('');
    expect(field.props.keyboardType).toBe('email-address');
    expect(field.props.autoCapitalize).toBe('none');
    expect(field.props.autoComplete).toBe('email');
    expect(field.props.returnKeyType).toBe('go');
  });

  it('pedir (202): 1 POST com o e-mail e o estado enviado com o e-mail digitado', async () => {
    await mockAccount();
    await openApp('/recuperar-senha');
    await typeEmail(` ${ADULT.email} `);
    await fireEvent.press(button(SEND_LINK_LABEL));
    expect(await screen.findByRole('header', { name: SENT_TITLE })).toBeTruthy();
    expect(screen.getByText(sentBody(ADULT.email))).toBeTruthy();
    expect(ofRoute('POST', RECOVERY).map((request) => request.body)).toEqual([{ email: ADULT.email }]);
    expect(screen).toHavePathname('/recuperar-senha');
    expect(screen).toHaveSearchParams({});
  });

  it('e-mail sem conta (202): a mesma tela', async () => {
    await openApp('/recuperar-senha');
    await typeEmail('ninguem@exemplo.test');
    await fireEvent(screen.getByLabelText(EMAIL_FIELD), 'submitEditing');
    expect(await screen.findByRole('header', { name: SENT_TITLE })).toBeTruthy();
    expect(screen.getByText(sentBody('ninguem@exemplo.test'))).toBeTruthy();
  });

  it('vazio e mal formado: não envia, e o campo explica', async () => {
    await openApp('/recuperar-senha');
    await screen.findByRole('header', { name: RECOVER_TITLE });
    await fireEvent.press(button(SEND_LINK_LABEL));
    expect(await screen.findByText(EMAIL_EMPTY)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(EMAIL_FIELD), 'ana@');
    await fireEvent.press(button(SEND_LINK_LABEL));
    expect(await screen.findByText(EMAIL_PROBLEM)).toBeTruthy();
    expect(ofRoute('POST', RECOVERY)).toHaveLength(0);
  });

  it('toque duplo em ENVIAR LINK: 1 POST', async () => {
    let answer!: (response: Response) => void;
    override[`POST ${RECOVERY}`] = () => new Promise<Response>((resolve) => (answer = resolve));
    await openApp('/recuperar-senha');
    await typeEmail(ADULT.email);
    await act(async () => {
      fireEvent.press(button(SEND_LINK_LABEL));
      fireEvent.press(button(SEND_LINK_LABEL));
    });
    expect(ofRoute('POST', RECOVERY)).toHaveLength(1);
    await act(async () => answer(new Response(null, { status: 202 })));
    expect(await screen.findByRole('header', { name: SENT_TITLE })).toBeTruthy();
  });

  it('enviar de novo: outro POST com o mesmo e-mail e "We sent it again."; VOLTAR PARA ENTRAR', async () => {
    await openApp('/recuperar-senha');
    await typeEmail(ADULT.email);
    await fireEvent.press(button(SEND_LINK_LABEL));
    await screen.findByRole('header', { name: SENT_TITLE });
    await fireEvent.press(button(SEND_AGAIN_LINK));
    expect(await screen.findByText(SENT_AGAIN)).toBeTruthy();
    expect(ofRoute('POST', RECOVERY).map((request) => request.body)).toEqual([
      { email: ADULT.email },
      { email: ADULT.email },
    ]);
    await fireEvent.press(button(BACK_TO_SIGN_IN));
    expect(await screen.findByRole('header', { name: SIGN_IN_TITLE })).toBeTruthy();
    expect(screen).toHavePathname('/entrar');
  });

  it('429 em "Send again": messageFor(TOO_MANY_REQUESTS), sem "We sent it again."', async () => {
    await openApp('/recuperar-senha');
    await typeEmail(ADULT.email);
    await fireEvent.press(button(SEND_LINK_LABEL));
    await screen.findByRole('header', { name: SENT_TITLE });
    forceMockRecovery('TOO_MANY_REQUESTS');
    await fireEvent.press(button(SEND_AGAIN_LINK));
    expect(await screen.findByText(messageFor('TOO_MANY_REQUESTS'))).toBeTruthy();
    expect(screen.queryByText(SENT_AGAIN)).toBeNull();
    expect(screen.getByRole('header', { name: SENT_TITLE })).toBeTruthy();
  });

  it('IP no limite (429): messageFor e o campo mantido', async () => {
    forceMockRecovery('TOO_MANY_REQUESTS');
    await openApp('/recuperar-senha');
    await typeEmail(ADULT.email);
    await fireEvent.press(button(SEND_LINK_LABEL));
    expect(await screen.findByText(messageFor('TOO_MANY_REQUESTS'))).toBeTruthy();
    expect(screen.getByLabelText(EMAIL_FIELD).props.value).toBe(ADULT.email);
    expect(screen.queryByRole('header', { name: SENT_TITLE })).toBeNull();
  });

  it('sem rede: messageFor(NETWORK_ERROR) e o campo mantido', async () => {
    override[`POST ${RECOVERY}`] = () => Promise.reject(new TypeError('Network request failed'));
    await openApp('/recuperar-senha');
    await typeEmail(ADULT.email);
    await fireEvent.press(button(SEND_LINK_LABEL));
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    expect(screen.getByLabelText(EMAIL_FIELD).props.value).toBe(ADULT.email);
  });

  it('"Sign in" no rodapé leva a /entrar', async () => {
    await openApp('/recuperar-senha');
    await screen.findByRole('header', { name: RECOVER_TITLE });
    await fireEvent.press(button(SIGN_IN_LINK));
    expect(await screen.findByRole('header', { name: SIGN_IN_TITLE })).toBeTruthy();
    expect(screen).toHavePathname('/entrar');
  });
});

describe('/redefinir-senha (2.8)', () => {
  it('abrir o link: a URL perde o token, o formulário aparece e nenhum POST sai', async () => {
    await openApp('/redefinir-senha?token=ok');
    expect(await screen.findByRole('header', { name: RESET_TITLE })).toBeTruthy();
    await waitFor(() => expect(screen).toHaveSearchParams({}));
    expect(screen).toHavePathname('/redefinir-senha');
    const field = screen.getByLabelText(NEW_PASSWORD_FIELD);
    expect(field.props.secureTextEntry).toBe(true);
    expect(field.props.autoComplete).toBe('new-password');
    expect(field.props.textContentType).toBe('newPassword');
    expect(screen.getByText(PASSWORD_HINT, { includeHiddenElements: true })).toBeTruthy();
    expect(ofRoute('POST', RESET)).toHaveLength(0);
  });

  it('redefinir (204): 1 POST com token e senha, Entrar com o aviso sem voltar ao formulário, e o login com a senha nova', async () => {
    asWeb();
    const token = await accountWithResetLink();
    await openApp(`/redefinir-senha?token=${token}`);
    await typePassword(NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(PASSWORD_CHANGED)).toBeTruthy();
    expect(screen).toHavePathname('/entrar');
    expect(screen).toHaveSearchParams({ motivo: 'senha' });
    expect(router.canGoBack()).toBe(false);
    expect(ofRoute('POST', RESET).map((request) => request.body)).toEqual([{ token, password: NEW_PASSWORD }]);
    await fireEvent.changeText(screen.getByLabelText(SIGN_IN_EMAIL_FIELD), ADULT.email);
    await fireEvent.changeText(screen.getByLabelText(PASSWORD_FIELD), NEW_PASSWORD);
    await fireEvent.press(button(SIGN_IN_LABEL));
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
  });

  it('o aviso some na primeira tentativa de entrar', async () => {
    override['POST /api/v1/auth/login'] = () => json({ code: 'INVALID_CREDENTIALS' }, 401);
    await openApp('/entrar?motivo=senha');
    expect(await screen.findByText(PASSWORD_CHANGED)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(SIGN_IN_EMAIL_FIELD), ADULT.email);
    await fireEvent.changeText(screen.getByLabelText(PASSWORD_FIELD), 'errada123');
    await fireEvent.press(button(SIGN_IN_LABEL));
    expect(await screen.findByText(messageFor('INVALID_CREDENTIALS'))).toBeTruthy();
    expect(screen.queryByText(PASSWORD_CHANGED)).toBeNull();
  });

  it('redefinir logado (Android): Aluno null, token apagado, loja mantida e Entrar com o aviso', async () => {
    const token = await accountWithResetLink();
    const student = { ...(await mockAccountProfile()) };
    await visitorStore.setVariable('name', 'Ana');
    expect(global.__secureStore.size).toBe(1);
    await openApp(`/redefinir-senha?token=${token}`, student);
    await typePassword(NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(PASSWORD_CHANGED)).toBeTruthy();
    expect(client.getQueryData(STUDENT_QUERY_KEY)).toBeNull();
    expect(global.__secureStore.size).toBe(0);
    expect(await visitorStore.variables()).toEqual(expect.objectContaining({ name: 'Ana' }));
  });

  it('sem Aluno no cache e com token guardado (Android, partida a frio): o 204 apaga o token e o Aluno fica null', async () => {
    const token = await accountWithResetLink();
    expect(global.__secureStore.size).toBe(1);
    await openApp(`/redefinir-senha?token=${token}`);
    expect(client.getQueryData(STUDENT_QUERY_KEY)).toBeUndefined();
    await typePassword(NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(PASSWORD_CHANGED)).toBeTruthy();
    expect(global.__secureStore.size).toBe(0);
    expect(client.getQueryData(STUDENT_QUERY_KEY)).toBeNull();
  });

  it('Voltar da tela esquece o token: abrir /redefinir-senha de novo sem token é o link inválido', async () => {
    await openApp('/redefinir-senha?token=ok');
    await screen.findByRole('header', { name: RESET_TITLE });
    await fireEvent.press(button(BACK_LABEL));
    await waitFor(() => expect(screen).toHavePathname('/'));
    await act(async () => router.replace('/redefinir-senha'));
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
  });

  it('voltar do aparelho ou do navegador esquece o token', async () => {
    await openApp('/');
    await act(async () => router.push('/redefinir-senha?token=ok'));
    await screen.findByRole('header', { name: RESET_TITLE });
    await act(async () => router.back());
    await waitFor(() => expect(screen).toHavePathname('/'));
    await act(async () => router.replace('/redefinir-senha'));
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(ofRoute('POST', RESET)).toHaveLength(0);
  });

  it('depois do 204, abrir /redefinir-senha sem token é o link inválido', async () => {
    const token = await accountWithResetLink();
    await openApp(`/redefinir-senha?token=${token}`);
    await typePassword(NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    await screen.findByText(PASSWORD_CHANGED);
    await act(async () => router.replace('/redefinir-senha'));
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(ofRoute('POST', RESET)).toHaveLength(1);
  });

  it('remonte: a tela monta de novo sem o token na URL e o token guardado vale', async () => {
    const token = await accountWithResetLink();
    await openApp(`/redefinir-senha?token=${token}`);
    await screen.findByRole('header', { name: RESET_TITLE });
    await act(async () => router.replace('/redefinir-senha'));
    await typePassword(NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(PASSWORD_CHANGED)).toBeTruthy();
    expect(ofRoute('POST', RESET).map((request) => request.body)).toEqual([{ token, password: NEW_PASSWORD }]);
  });

  it('sem token: o link inválido, sem POST; PEDIR OUTRO LINK leva a /recuperar-senha', async () => {
    await openApp('/redefinir-senha');
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(screen.getByText(INVALID_BODY)).toBeTruthy();
    expect(screen.getByRole('button', { name: GO_HOME_LABEL })).toBeTruthy();
    await fireEvent.press(button(NEW_LINK_LABEL));
    expect(await screen.findByRole('header', { name: RECOVER_TITLE })).toBeTruthy();
    expect(screen).toHavePathname('/recuperar-senha');
    expect(ofRoute('POST', RESET)).toHaveLength(0);
  });

  it('token com mais de 128 caracteres: o link inválido, sem POST; IR PARA O INÍCIO leva a /', async () => {
    await openApp(`/redefinir-senha?token=${'a'.repeat(129)}`);
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(ofRoute('POST', RESET)).toHaveLength(0);
    await fireEvent.press(button(GO_HOME_LABEL));
    await waitFor(() => expect(screen).toHavePathname('/'));
  });

  it('senha fraca: não envia e explica a regra', async () => {
    await openApp('/redefinir-senha?token=ok');
    await typePassword('abc');
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(PASSWORD_PROBLEM)).toBeTruthy();
    expect(ofRoute('POST', RESET)).toHaveLength(0);
  });

  it('toque duplo em SALVAR SENHA: 1 POST', async () => {
    let answer!: (response: Response) => void;
    override[`POST ${RESET}`] = () => new Promise<Response>((resolve) => (answer = resolve));
    await openApp('/redefinir-senha?token=ok');
    await typePassword(NEW_PASSWORD);
    await act(async () => {
      fireEvent.press(button(SAVE_PASSWORD_LABEL));
      fireEvent.press(button(SAVE_PASSWORD_LABEL));
    });
    expect(ofRoute('POST', RESET)).toHaveLength(1);
    await act(async () => answer(new Response(null, { status: 204 })));
    expect(await screen.findByText(PASSWORD_CHANGED)).toBeTruthy();
  });

  it('link usado ou vencido (410): o link inválido; voltar sem token também', async () => {
    const token = await accountWithResetLink();
    await openApp(`/redefinir-senha?token=${token}x`);
    await typePassword(NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(messageFor('PASSWORD_RESET_LINK_INVALID')).toBe("This reset link doesn't work anymore. Ask for a new one.");
    await act(async () => router.replace('/redefinir-senha'));
    expect(await screen.findByRole('header', { name: INVALID_TITLE })).toBeTruthy();
    expect(ofRoute('POST', RESET)).toHaveLength(1);
  });

  it('recusa da API (400): messageFor, a senha fica, e o próximo envio usa o mesmo token', async () => {
    const token = await accountWithResetLink();
    override[`POST ${RESET}`] = () => json({ code: 'VALIDATION_FAILED' }, 400);
    await openApp(`/redefinir-senha?token=${token}`);
    await typePassword(NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(messageFor('VALIDATION_FAILED'))).toBeTruthy();
    expect(screen.getByLabelText(NEW_PASSWORD_FIELD).props.value).toBe(NEW_PASSWORD);
    delete override[`POST ${RESET}`];
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(PASSWORD_CHANGED)).toBeTruthy();
    expect(ofRoute('POST', RESET).map((request) => request.body)).toEqual([
      { token, password: NEW_PASSWORD },
      { token, password: NEW_PASSWORD },
    ]);
  });

  it('429 ao salvar: messageFor', async () => {
    override[`POST ${RESET}`] = () => json({ code: 'TOO_MANY_REQUESTS' }, 429);
    await openApp('/redefinir-senha?token=ok');
    await typePassword(NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(messageFor('TOO_MANY_REQUESTS'))).toBeTruthy();
  });

  it('sem rede ao salvar: messageFor e o mesmo token no próximo envio', async () => {
    const token = await accountWithResetLink();
    override[`POST ${RESET}`] = () => Promise.reject(new TypeError('Network request failed'));
    await openApp(`/redefinir-senha?token=${token}`);
    await typePassword(NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    delete override[`POST ${RESET}`];
    await fireEvent(screen.getByLabelText(NEW_PASSWORD_FIELD), 'submitEditing');
    expect(await screen.findByText(PASSWORD_CHANGED)).toBeTruthy();
    expect(ofRoute('POST', RESET).map((request) => (request.body as { token: string }).token)).toEqual([token, token]);
  });

  it('privacidade: o token, a senha e o e-mail não vão a URL, cabeçalho, loja, armazenamento ou Sentry', async () => {
    asWeb();
    const token = await accountWithResetLink();
    sent.length = 0;
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    storage?.clear();
    await openApp('/recuperar-senha');
    await typeEmail(ADULT.email);
    await fireEvent.press(button(SEND_LINK_LABEL));
    await screen.findByRole('header', { name: SENT_TITLE });
    override[`POST ${RESET}`] = () => Promise.reject(new TypeError('Network request failed'));
    await act(async () => router.replace(`/redefinir-senha?token=${token}`));
    await typePassword(NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    await screen.findByText(messageFor(NETWORK_ERROR));
    delete override[`POST ${RESET}`];
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    await screen.findByText(PASSWORD_CHANGED);

    const secrets = [token, NEW_PASSWORD, ADULT.email];
    for (const request of sent) {
      const headers = [...request.headers.entries()].map(([name, value]) => `${name}: ${value}`).join('\n');
      for (const secret of secrets) {
        expect(request.url).not.toContain(secret);
        expect(headers).not.toContain(secret);
      }
      // Só o corpo da rota certa leva o dado: o e-mail no pedido, o token e a senha na redefinição.
      const body = JSON.stringify(request.body ?? null);
      if (request.path === RECOVERY) expect(request.body).toEqual({ email: ADULT.email });
      else if (request.path === RESET) expect(request.body).toEqual({ token, password: NEW_PASSWORD });
      else for (const secret of secrets) expect(body).not.toContain(secret);
    }
    const stored = [
      ...(storage ? Object.keys(storage).map((key) => `${key}=${storage.getItem(key)}`) : []),
      ...[...global.__secureStore.values()],
      JSON.stringify(await visitorStore.variables()),
    ].join('\n');
    for (const secret of [token, NEW_PASSWORD, ADULT.email]) expect(stored).not.toContain(secret);
    const reported = JSON.stringify((captureError as jest.Mock).mock.calls, (_, value) =>
      value instanceof Error ? `${value.name}: ${value.message}` : value,
    );
    for (const secret of secrets) expect(reported).not.toContain(secret);
    expect(screen).toHaveSearchParams({ motivo: 'senha' });
  });
});

/** O perfil do Aluno da sessão do mock, como o App o teria no cache depois de entrar. */
async function mockAccountProfile(): Promise<StudentProfile> {
  const token = global.__secureStore.get('fluveny.session');
  const { data } = mockRoutes['/api/v1/students/me'].get(
    new Request('http://mock', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  );
  return data;
}

describe('faixa do e-mail não confirmado depois dos 7 dias (2.8, UX-DR117)', () => {
  it('vencida: "Confirm your email so you can recover your password." com REENVIAR, e o reenvio da 2.2', async () => {
    await mockAccount();
    markMockConfirmationOverdue(ADULT.email);
    const student = await mockAccountProfile();
    expect(student.emailConfirmationOverdue).toBe(true);
    await openApp('/', student);
    expect(await screen.findByText(CONFIRM_TO_RECOVER)).toBeTruthy();
    expect(screen.queryByText(confirmationSent(ADULT.email))).toBeNull();
    await fireEvent.press(button(RESEND_LABEL));
    expect(await screen.findByText(/We sent another link to/)).toBeTruthy();
  });

  it('recente: o texto da 2.2', async () => {
    const student = await mockAccount();
    expect(student.emailConfirmationOverdue).toBe(false);
    await openApp('/', student);
    expect(await screen.findByText(confirmationSent(ADULT.email))).toBeTruthy();
    expect(screen.queryByText(CONFIRM_TO_RECOVER)).toBeNull();
  });

  it('confirmado: sem faixa', async () => {
    const student = await mockAccount();
    await openApp('/', { ...student, emailConfirmed: true, emailConfirmationOverdue: false });
    expect(await screen.findByTestId('student-dashboard')).toBeTruthy();
    expect(screen.queryByTestId('email-confirmation-banner')).toBeNull();
  });
});
