// Matriz da 2.1 (cadastro do Aluno adulto no App): uma linha por teste.
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, Platform } from 'react-native';

import { RootStack } from '../../app/_layout';
import SignUp, {
  ACCEPT_LABEL,
  BIRTH_FIELD,
  CREATE_LABEL,
  EMAIL_FIELD,
  INVITE_NOTICE,
  NAME_FIELD,
  PASSWORD_FIELD,
  PRONOUNS_CONTINUE,
  PRONOUNS_LATER,
  PRONOUNS_TITLE,
  RECOVER_LINK,
  SIGN_IN_LINK,
  SIGNUP_TITLE,
} from '../../app/(student)/cadastro';
import StageTwoInvite from '../../app/(student)/convite';
import ComingSoon from '../../app/(public)/em-breve';
import RecoverPassword, { RECOVER_TITLE } from '../../app/(public)/recuperar-senha';
import ResetPassword from '../../app/(public)/redefinir-senha';
import SignIn, { SIGN_IN_TITLE } from '../../app/(public)/entrar';
import ConfirmEmail from '../../app/(public)/confirmar-email';
import Root, { SIGN_UP, WELCOME_TITLE } from '../../app/(public)/index';
import Player from '../../app/(student)/player';
import PrivacyPolicy from '../../app/(public)/privacidade';
import TermsOfUse from '../../app/(public)/termos';
import { CLIENT_HEADER } from '../api/client';
import { messageFor, NETWORK_ERROR } from '../api/errors';
import { mockResponse } from '../api/mocks/handlers';
import { MOCK_CREATED, mockRoutes, resetMockStudents } from '../api/mocks/routes';
import { AppProviders, createQueryClient } from '../AppProviders';
import { forgetCachedSession } from '../auth/session';
import { ADULT_ONLY_TEXT, AGE_BELOW_TEXT, DATE_PROBLEM, PASSWORD_PROBLEM } from '../auth/signupForm';
import { studentGreeting } from '../auth/StudentHome';
import { DASHBOARD_START } from '../dashboard/StudentDashboard';
import { PRIVACY_LINK, TERMS_LINK } from '../legal/paths';
import { PRIVACY_POLICY } from '../legal/privacy';
import { TERMS_OF_USE } from '../legal/terms';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal/versions';
import { openPlayer } from '../visitor/events';
import { visitorStore } from '../visitor/store';
import { clearVisitorCache } from '../visitor/useVisitor';

jest.mock('../visitor/events', () => {
  const actual = jest.requireActual('../visitor/events');
  return { ...actual, openPlayer: jest.fn(actual.openPlayer) };
});

jest.mock('../observability/sentry', () => {
  const actual = jest.requireActual('../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });

type Route = '/api/v1/auth/signup' | '/api/v1/students/me';
/** Troca a resposta de uma rota (`MÉTODO caminho`) por um teste. */
let override: Partial<Record<string, () => Response>> = {};

/** As requisições feitas à API: método, URL, cabeçalhos, credenciais e corpo. */
type Sent = { method: string; url: string; headers: Headers; credentials?: RequestCredentials; body: unknown };
const sent: Sent[] = [];

/** A API respondendo com os mocks de `routes.ts` (o cadastro e a sessão do mock). */
function apiResponds() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = new URL(url).pathname;
    sent.push({
      method,
      url,
      headers: new Headers(init?.headers),
      credentials: init?.credentials,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const forced = override[`${method} ${path}`]?.();
    if (forced) return forced;
    if (path === '/api/v1/meta') return json({ data: { minAppVersion: '0.0.0', activityTypes: [] } });
    const routes = mockRoutes as unknown as Record<string, Record<string, (request: Request) => unknown>>;
    const resolve = routes[path]?.[method.toLowerCase()];
    if (!resolve) return json({ code: 'NOT_FOUND' }, 404);
    const status = MOCK_CREATED.has(`${method} ${path}`) ? 201 : 200;
    return mockResponse(resolve, new Request(url, init), status);
  }) as jest.Mock;
}

const ofRoute = (method: string, route: Route) =>
  sent.filter((request) => request.method === method && new URL(request.url).pathname === route);

async function openApp(initialUrl = '/') {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return renderRouter(
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
      '(student)/player': Player,
      '(student)/convite': StageTwoInvite,
      '(student)/cadastro': SignUp,
      '(public)/confirmar-email': ConfirmEmail,
    },
    { initialUrl },
  );
}

/** "Reabrir o App": o processo novo esquece a cópia do token em memória. */
async function reopenApp() {
  forgetCachedSession();
  clearVisitorCache();
  return openApp();
}

const button = (name: string) => screen.getByRole('button', { name });

/** `DD/MM/AAAA` de quem faz `years` anos daqui a `days` dias (negativo: já fez). */
function birthDate(years: number, days = 0): string {
  const today = new Date();
  const date = new Date(today.getFullYear() - years, today.getMonth(), today.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

const ADULT = { name: 'Ana', email: 'Ana@Exemplo.test ', birthDate: '20/05/1990', password: 'segredo123' };

/** Preenche o formulário (a data como o aluno digita: só os números). */
async function fill(values: Partial<typeof ADULT> = {}, accept = true) {
  const form = { ...ADULT, ...values };
  await screen.findByRole('header', { name: SIGNUP_TITLE });
  await fireEvent.changeText(screen.getByLabelText(NAME_FIELD), form.name);
  await fireEvent.changeText(screen.getByLabelText(EMAIL_FIELD), form.email);
  await fireEvent.changeText(screen.getByLabelText(BIRTH_FIELD), form.birthDate.replace(/\D/g, ''));
  await fireEvent.changeText(screen.getByLabelText(PASSWORD_FIELD), form.password);
  if (accept) await fireEvent.press(screen.getByRole('checkbox', { name: ACCEPT_LABEL }));
}

async function signUpFromWelcome(values: Partial<typeof ADULT> = {}) {
  await openApp();
  await fireEvent.press(await screen.findByRole('button', { name: SIGN_UP }));
  await fill(values);
  await fireEvent.press(button(CREATE_LABEL));
}

const os = Platform.OS;

/**
 * O App do web: `Platform.OS` vira `web` (o cliente manda `X-Fluveny-Client:
 * web` e `credentials`), e a janela ganha os eventos de rede que o `useOnline`
 * do web escuta. As lojas seguem as do nativo (o jest não troca os `.web.ts`).
 */
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
  override = {};
  sent.length = 0;
  (openPlayer as jest.Mock).mockClear();
  apiResponds();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  consoleError = jest.spyOn(console, 'error');
});

let consoleError: jest.SpyInstance;

afterEach(() => {
  // A raiz não pode se atualizar no meio do render da tela do Aluno (achado no Android).
  const setStateInRender = consoleError.mock.calls.filter((args) => /Cannot update a component/.test(String(args[0])));
  expect(setStateInRender).toEqual([]);
  Platform.OS = os;
  jest.restoreAllMocks();
});

describe('cadastro do Aluno adulto (2.1)', () => {
  it('web: 201, sessão só no cookie (credentials, X-Fluveny-Client: web, nada guardado), pronomes e tela inicial', async () => {
    asWeb();
    await signUpFromWelcome();
    expect(await screen.findByRole('header', { name: PRONOUNS_TITLE })).toBeTruthy();
    expect(screen.queryByText(/Gênero/)).toBeNull();

    const [signup] = ofRoute('POST', '/api/v1/auth/signup');
    expect(signup!.body).toEqual({
      email: 'Ana@Exemplo.test',
      password: 'segredo123',
      birthDate: '1990-05-20',
      name: 'Ana',
      acceptedTermsVersion: TERMS_VERSION,
      acceptedPrivacyVersion: PRIVACY_VERSION,
    });
    expect(TERMS_VERSION).toBe(TERMS_OF_USE.version);
    expect(PRIVACY_VERSION).toBe(PRIVACY_POLICY.version);
    expect(global.__secureStore.size).toBe(0);

    await fireEvent.press(screen.getByRole('radio', { name: /^she\/her/ }));
    await fireEvent.press(button(PRONOUNS_CONTINUE));
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(screen).toHavePathname('/');
    expect(await screen.findByRole('button', { name: DASHBOARD_START })).toBeTruthy();
    expect(ofRoute('PATCH', '/api/v1/students/me').map((request) => request.body)).toEqual([{ pronounSet: 'SHE' }]);
    for (const request of sent) {
      expect(request.headers.get(CLIENT_HEADER)).toBe('web');
      expect(request.credentials).toBe('include');
      expect(request.headers.has('Authorization')).toBe(false);
    }
  });

  it('Android: o token fica no expo-secure-store e a chamada seguinte leva Bearer; reabrir mantém o Aluno', async () => {
    await signUpFromWelcome();
    expect(await screen.findByRole('header', { name: PRONOUNS_TITLE })).toBeTruthy();
    const [signup] = ofRoute('POST', '/api/v1/auth/signup');
    expect(signup!.headers.get(CLIENT_HEADER)).toBe('android');
    expect(signup!.headers.has('Authorization')).toBe(false);
    const token = global.__secureStore.get('fluveny.session');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    await fireEvent.press(screen.getByRole('radio', { name: /^he\/him/ }));
    await fireEvent.press(button(PRONOUNS_CONTINUE));
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    const [pronouns] = ofRoute('PATCH', '/api/v1/students/me');
    expect(pronouns!.headers.get('Authorization')).toBe(`Bearer ${token}`);
    expect(pronouns!.headers.get(CLIENT_HEADER)).toBe('android');

    sent.length = 0;
    await reopenApp();
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(ofRoute('GET', '/api/v1/students/me')[0]!.headers.get('Authorization')).toBe(`Bearer ${token}`);
  });

  it('reabrir sem sessão (401): a boas-vindas; no Android sem token, nem pergunta', async () => {
    asWeb();
    await openApp();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(ofRoute('GET', '/api/v1/students/me')).toHaveLength(1);

    Platform.OS = 'android';
    sent.length = 0;
    await reopenApp();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(ofRoute('GET', '/api/v1/students/me')).toHaveLength(0);
  });

  it('reabrir com sessão no web: "Hi, {nome}!" e o botão do player, que abre o player de hoje', async () => {
    asWeb();
    await signUpFromWelcome();
    await fireEvent.press(await screen.findByRole('button', { name: PRONOUNS_LATER }));
    await reopenApp();
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    await fireEvent.press(await screen.findByRole('button', { name: DASHBOARD_START }));
    expect(screen).toHavePathname('/player');
    // O Aluno não conta como sessão de Visitante: o player abre sem o VISITOR_SESSION_STARTED.
    // O VISITOR_SESSION_STARTED só sai pelo openPlayer, e a tela do Aluno não o chama.
    expect(openPlayer).not.toHaveBeenCalled();
    const events = sent.filter((request) => request.url.endsWith('/visitor/events'));
    expect(events.map((request) => (request.body as { type: string }).type)).not.toContain('VISITOR_SESSION_STARTED');
    // Desde a 2.4, o Aluno joga pelas rotas dele: nada vai às do Visitante, e o XP vem do Progresso do servidor.
    await waitFor(() => expect(sent.some((request) => request.url.endsWith('/students/me/progress'))).toBe(true));
    expect(sent.filter((request) => request.url.includes('/visitor/'))).toEqual([]);
  });

  it('"Escolher depois" segue sem gravar; sem nome, "Hi, friend!"', async () => {
    await signUpFromWelcome({ name: '' });
    await fireEvent.press(await screen.findByRole('button', { name: PRONOUNS_LATER }));
    expect(await screen.findByRole('header', { name: 'Hi, friend!' })).toBeTruthy();
    expect(ofRoute('PATCH', '/api/v1/students/me')).toHaveLength(0);
    expect(ofRoute('POST', '/api/v1/auth/signup')[0]!.body).not.toHaveProperty('name');
  });

  it('do convite: cartão ouro e o nome do Visitante já preenchido', async () => {
    await visitorStore.setVariable('name', 'Júlia');
    await openApp('/cadastro?de=convite');
    expect(await screen.findByText(INVITE_NOTICE)).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText(NAME_FIELD).props.value).toBe('Júlia'));
  });

  it('sem convite: sem o cartão ouro e sem nome preenchido', async () => {
    await visitorStore.setVariable('name', 'Júlia');
    await openApp('/cadastro');
    await screen.findByRole('header', { name: SIGNUP_TITLE });
    expect(screen.queryByText(INVITE_NOTICE)).toBeNull();
    expect(screen.getByLabelText(NAME_FIELD).props.value).toBe('');
  });

  it('teclados por campo e a data com as barras', async () => {
    await openApp('/cadastro');
    await screen.findByRole('header', { name: SIGNUP_TITLE });
    expect(screen.getByLabelText(NAME_FIELD).props.autoCapitalize).toBe('words');
    expect(screen.getByLabelText(NAME_FIELD).props.maxLength).toBe(60);
    expect(screen.getByLabelText(EMAIL_FIELD).props.keyboardType).toBe('email-address');
    expect(screen.getByLabelText(EMAIL_FIELD).props.autoCapitalize).toBe('none');
    expect(screen.getByLabelText(BIRTH_FIELD).props.keyboardType).toBe('number-pad');
    expect(screen.getByLabelText(PASSWORD_FIELD).props.secureTextEntry).toBe(true);
    await fireEvent.changeText(screen.getByLabelText(BIRTH_FIELD), '20051990');
    expect(screen.getByLabelText(BIRTH_FIELD).props.value).toBe('20/05/1990');
  });

  it('sem aceite: CRIAR CONTA desabilitado; os links abrem os termos e a política', async () => {
    await openApp('/cadastro');
    await fill({}, false);
    expect(button(CREATE_LABEL)).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: ACCEPT_LABEL })).not.toBeChecked();
    expect(screen.getByRole('button', { name: PRIVACY_LINK })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: TERMS_LINK }));
    expect(screen).toHavePathname('/termos');
    expect(screen.getByRole('header', { name: TERMS_OF_USE.title })).toBeTruthy();
    expect(ofRoute('POST', '/api/v1/auth/signup')).toHaveLength(0);
  });

  it('senha fora da regra e data que não existe: não envia, e o campo explica', async () => {
    await openApp('/cadastro');
    await fill({ password: 'semnumero', birthDate: '31/02/1990' });
    await fireEvent.press(button(CREATE_LABEL));
    expect(screen.getByText(PASSWORD_PROBLEM)).toBeTruthy();
    expect(screen.getByText(DATE_PROBLEM)).toBeTruthy();
    expect(ofRoute('POST', '/api/v1/auth/signup')).toHaveLength(0);
    // Corrigiu: a explicação some e o envio sai.
    await fireEvent.changeText(screen.getByLabelText(PASSWORD_FIELD), 'segredo123');
    await fireEvent.changeText(screen.getByLabelText(BIRTH_FIELD), '28021990');
    expect(screen.queryByText(PASSWORD_PROBLEM)).toBeNull();
    await fireEvent.press(button(CREATE_LABEL));
    expect(await screen.findByRole('header', { name: PRONOUNS_TITLE })).toBeTruthy();
  });

  it('menor de 12 (11 anos e 364 dias): o aviso, e não envia', async () => {
    await openApp('/cadastro');
    await fill({ birthDate: birthDate(12, 1) });
    expect(screen.getByText(AGE_BELOW_TEXT)).toBeTruthy();
    await fireEvent.press(button(CREATE_LABEL));
    expect(ofRoute('POST', '/api/v1/auth/signup')).toHaveLength(0);
  });

  it('de 12 a 17: só o aviso de 18+, sem prometer consentimento, e não envia', async () => {
    for (const date of [birthDate(12), birthDate(18, 1)]) {
      await openApp('/cadastro');
      await fill({ birthDate: date });
      expect(screen.getByText(ADULT_ONLY_TEXT)).toBeTruthy();
      expect(screen.queryByText(/responsável/)).toBeNull();
      await fireEvent.press(button(CREATE_LABEL));
      expect(ofRoute('POST', '/api/v1/auth/signup')).toHaveLength(0);
    }
  });

  it('API: GUARDIAN_CONSENT_REQUIRED e AGE_BELOW_MINIMUM mostram as frases da idade', async () => {
    override['POST /api/v1/auth/signup'] = () => json({ code: 'GUARDIAN_CONSENT_REQUIRED' }, 422);
    await signUpFromWelcome();
    expect(await screen.findByText(ADULT_ONLY_TEXT)).toBeTruthy();
    override['POST /api/v1/auth/signup'] = () => json({ code: 'AGE_BELOW_MINIMUM' }, 422);
    await fireEvent.press(button(CREATE_LABEL));
    expect(await screen.findByText(AGE_BELOW_TEXT)).toBeTruthy();
  });

  it('API: VALIDATION_FAILED mostra messageFor, e o formulário fica', async () => {
    override['POST /api/v1/auth/signup'] = () => json({ code: 'VALIDATION_FAILED' }, 400);
    await signUpFromWelcome();
    expect(await screen.findByText(messageFor('VALIDATION_FAILED'))).toBeTruthy();
    expect(screen.getByLabelText(EMAIL_FIELD).props.value).toBe(ADULT.email);
  });

  it('e-mail repetido (409): mensagem sem culpa, "Entrar" abre Entrar (2.3) e "Recuperar senha", "Em breve"', async () => {
    await signUpFromWelcome();
    await fireEvent.press(await screen.findByRole('button', { name: PRONOUNS_LATER }));
    await screen.findByRole('header', { name: studentGreeting('Ana') });
    // Outro cadastro com o mesmo e-mail.
    await openApp('/cadastro');
    await fill({ email: 'ana@exemplo.test' });
    await fireEvent.press(button(CREATE_LABEL));
    expect(await screen.findByText(messageFor('EMAIL_ALREADY_REGISTERED'))).toBeTruthy();
    expect(messageFor('EMAIL_ALREADY_REGISTERED')).not.toMatch(/errad|inválid|culpa/i);
    await fireEvent.press(button(SIGN_IN_LINK));
    expect(await screen.findByRole('header', { name: SIGN_IN_TITLE })).toBeTruthy();
    expect(screen).toHavePathname('/entrar');
    await openApp('/cadastro');
    await fill({ email: 'ana@exemplo.test' });
    await fireEvent.press(button(CREATE_LABEL));
    await fireEvent.press(await screen.findByRole('button', { name: RECOVER_LINK }));
    expect(await screen.findByRole('header', { name: RECOVER_TITLE })).toBeTruthy();
    expect(screen).toHavePathname('/recuperar-senha');
  });

  it('sem rede no cadastro: messageFor(NETWORK_ERROR), e os dados do formulário ficam', async () => {
    override['POST /api/v1/auth/signup'] = () => {
      throw new TypeError('Network request failed');
    };
    await signUpFromWelcome();
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    expect(screen.getByLabelText(NAME_FIELD).props.value).toBe('Ana');
    expect(screen.getByLabelText(EMAIL_FIELD).props.value).toBe(ADULT.email);
    expect(screen.getByLabelText(BIRTH_FIELD).props.value).toBe(ADULT.birthDate);
    expect(screen.getByLabelText(PASSWORD_FIELD).props.value).toBe(ADULT.password);
    expect(screen.getByRole('checkbox', { name: ACCEPT_LABEL })).toBeChecked();
    // A rede voltou: o mesmo CRIAR CONTA envia.
    override = {};
    await fireEvent.press(button(CREATE_LABEL));
    expect(await screen.findByRole('header', { name: PRONOUNS_TITLE })).toBeTruthy();
  });

  it('pronome falha (PATCH sem rede): messageFor, e CONTINUAR tenta de novo', async () => {
    await signUpFromWelcome();
    await fireEvent.press(await screen.findByRole('radio', { name: /^they\/them/ }));
    override['PATCH /api/v1/students/me'] = () => {
      throw new TypeError('Network request failed');
    };
    await fireEvent.press(button(PRONOUNS_CONTINUE));
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    expect(screen.getByRole('header', { name: PRONOUNS_TITLE })).toBeTruthy();
    override = {};
    await fireEvent.press(button(PRONOUNS_CONTINUE));
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(ofRoute('PATCH', '/api/v1/students/me').map((request) => request.body)).toEqual([
      { pronounSet: 'THEY' },
      { pronounSet: 'THEY' },
    ]);
  });

  it('pronomes: grupo de escolha única, com o exemplo no rótulo e o selecionado anunciado', async () => {
    await signUpFromWelcome();
    const she = await screen.findByRole('radio', { name: 'she/her, She is from Brazil.' });
    expect(she).not.toBeSelected();
    await fireEvent.press(she);
    expect(screen.getByRole('radio', { name: 'she/her, She is from Brazil.' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'he/him, He is from Brazil.' })).not.toBeSelected();
  });

  it('depois do cadastro, a pilha é só a raiz: voltar não cai no formulário nem no convite', async () => {
    await visitorStore.setVariable('name', 'Ana');
    await openApp('/convite');
    await openApp('/');
    await fireEvent.press(await screen.findByRole('button', { name: SIGN_UP }));
    await fill();
    await fireEvent.press(button(CREATE_LABEL));
    await fireEvent.press(await screen.findByRole('button', { name: PRONOUNS_LATER }));
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(router.canGoBack()).toBe(false);
    expect(screen.queryByRole('header', { name: SIGNUP_TITLE })).toBeNull();
  });

  it('Android: 401 no /students/me apaga o token vencido e mostra a boas-vindas', async () => {
    global.__secureStore.set('fluveny.session', 'v'.repeat(43));
    await reopenApp();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(ofRoute('GET', '/api/v1/students/me')[0]!.headers.get('Authorization')).toBe(`Bearer ${'v'.repeat(43)}`);
    await waitFor(() => expect(global.__secureStore.has('fluveny.session')).toBe(false));
    sent.length = 0;
    await reopenApp();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(sent.some((request) => request.headers.has('Authorization'))).toBe(false);
  });

  it('web: /students/me sem rede ou com 500, a raiz cai na boas-vindas', async () => {
    asWeb();
    override['GET /api/v1/students/me'] = () => {
      throw new TypeError('Network request failed');
    };
    await openApp();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    override['GET /api/v1/students/me'] = () => json({ code: 'INTERNAL_ERROR' }, 500);
    await openApp();
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
  });

  it('a mensagem do envio sai quando o aluno muda o e-mail ou a data', async () => {
    override['POST /api/v1/auth/signup'] = () => json({ code: 'EMAIL_ALREADY_REGISTERED' }, 409);
    await signUpFromWelcome();
    expect(await screen.findByText(messageFor('EMAIL_ALREADY_REGISTERED'))).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(EMAIL_FIELD), 'outra@exemplo.test');
    expect(screen.queryByText(messageFor('EMAIL_ALREADY_REGISTERED'))).toBeNull();
    override['POST /api/v1/auth/signup'] = () => json({ code: 'AGE_BELOW_MINIMUM' }, 422);
    await fireEvent.press(button(CREATE_LABEL));
    expect(await screen.findByText(AGE_BELOW_TEXT)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(BIRTH_FIELD), '01011980');
    expect(screen.queryByText(AGE_BELOW_TEXT)).toBeNull();
  });

  it('dois toques no mesmo quadro: um POST só', async () => {
    await openApp('/cadastro');
    await fill();
    const submit = button(CREATE_LABEL);
    await act(async () => {
      submit.props.onClick?.();
      submit.props.onClick?.();
    });
    expect(await screen.findByRole('header', { name: PRONOUNS_TITLE })).toBeTruthy();
    expect(ofRoute('POST', '/api/v1/auth/signup')).toHaveLength(1);
  });

  it('senha colada com mais de 64 caracteres não é cortada: a regra explica', async () => {
    await openApp('/cadastro');
    const long = `a1${'b'.repeat(70)}`;
    await fill({ password: long });
    expect(screen.getByLabelText(PASSWORD_FIELD).props.value).toBe(long);
    expect(screen.getByLabelText(PASSWORD_FIELD).props.maxLength).toBeUndefined();
    await fireEvent.press(button(CREATE_LABEL));
    expect(screen.getByText(PASSWORD_PROBLEM)).toBeTruthy();
    expect(ofRoute('POST', '/api/v1/auth/signup')).toHaveLength(0);
  });
});

describe('migração do Visitante no cadastro (2.6)', () => {
  /** Um Visitante com país e `count` recibos gravados no aparelho. */
  async function visitorWith(count: number, country = 'Brazil') {
    await visitorStore.setVariable('name', 'Ana');
    await visitorStore.setVariable('country', country);
    for (let i = 0; i < count; i += 1) await visitorStore.recordReceipt(`a${i}`, `v1.r${i}`);
    return visitorStore.deviceId();
  }

  it('do convite: corpo com name, country e visitor; 201 limpa a loja menos o deviceId', async () => {
    const deviceId = await visitorWith(13);
    await openApp('/cadastro?de=convite');
    expect(await screen.findByText(INVITE_NOTICE)).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText(NAME_FIELD).props.value).toBe('Ana'));
    await fill({ name: 'Ana' });
    await fireEvent.press(button(CREATE_LABEL));
    expect(await screen.findByRole('header', { name: PRONOUNS_TITLE })).toBeTruthy();
    const [signup] = ofRoute('POST', '/api/v1/auth/signup');
    expect(signup!.body).toMatchObject({
      name: 'Ana',
      country: 'Brazil',
      visitor: { deviceId, receipts: Array.from({ length: 13 }, (_, i) => `v1.r${i}`) },
    });
    expect(await visitorStore.receipts()).toEqual([]);
    expect(await visitorStore.variables()).toEqual({});
    expect(await visitorStore.deviceId()).toBe(deviceId);
    await fireEvent.press(button(PRONOUNS_LATER));
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
  });

  it('sem convite, com recibos: visitor vai; sem recibos: corpo da 2.1', async () => {
    await visitorWith(5, 'Atlantis');
    await openApp('/cadastro');
    await fill();
    await fireEvent.press(button(CREATE_LABEL));
    await screen.findByRole('header', { name: PRONOUNS_TITLE });
    const [signup] = ofRoute('POST', '/api/v1/auth/signup');
    expect((signup!.body as { visitor: { receipts: string[] } }).visitor.receipts).toHaveLength(5);
    expect(signup!.body).not.toHaveProperty('country');
    await fireEvent.press(button(PRONOUNS_LATER));
    await screen.findByRole('header', { name: studentGreeting('Ana') });
  });

  it('sem recibos: o corpo da 2.1, sem visitor', async () => {
    await signUpFromWelcome();
    await screen.findByRole('header', { name: PRONOUNS_TITLE });
    const [signup] = ofRoute('POST', '/api/v1/auth/signup');
    expect(signup!.body).toEqual({
      email: 'Ana@Exemplo.test',
      password: 'segredo123',
      birthDate: '1990-05-20',
      name: 'Ana',
      acceptedTermsVersion: TERMS_VERSION,
      acceptedPrivacyVersion: PRIVACY_VERSION,
    });
  });

  it('sem rede, 500 e 409 depois: a loja fica intacta', async () => {
    await visitorWith(3);
    override['POST /api/v1/auth/signup'] = () => {
      throw new TypeError('Network request failed');
    };
    await openApp('/cadastro');
    await fill();
    await fireEvent.press(button(CREATE_LABEL));
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    expect(await visitorStore.receipts()).toHaveLength(3);
    override['POST /api/v1/auth/signup'] = () => json({ code: 'UNKNOWN_ERROR' }, 500);
    await fireEvent.press(button(CREATE_LABEL));
    await waitFor(() => expect(ofRoute('POST', '/api/v1/auth/signup')).toHaveLength(2));
    expect(await screen.findByRole('button', { name: CREATE_LABEL })).toBeEnabled();
    expect(await visitorStore.receipts()).toHaveLength(3);
    override['POST /api/v1/auth/signup'] = () => json({ code: 'EMAIL_ALREADY_REGISTERED' }, 409);
    await fireEvent.press(button(CREATE_LABEL));
    expect(await screen.findByText(messageFor('EMAIL_ALREADY_REGISTERED'))).toBeTruthy();
    expect(screen.getByRole('button', { name: SIGN_IN_LINK })).toBeTruthy();
    expect(await visitorStore.receipts()).toHaveLength(3);
    expect(await visitorStore.getVariable('country')).toBe('Brazil');
  });
});
