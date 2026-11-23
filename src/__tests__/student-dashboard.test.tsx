// Matriz da 2.5 no App (painel do Aluno, sequência e retomada): uma linha por teste.
// O painel lê `GET /students/me/dashboard` (o mock calcula dos registros do Aluno, ou o
// teste responde à mão) e o player abre no Estágio e na Atividade da URL.
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { RootStack } from '../../app/_layout';
import SignIn, { EMAIL_FIELD, PASSWORD_FIELD, SESSION_ENDED, SIGN_IN_LABEL } from '../../app/(public)/entrar';
import Root, { TRY_NOW } from '../../app/(public)/index';
import SignUp from '../../app/(student)/cadastro';
import StageTwoInvite from '../../app/(student)/convite';
import Player, { BACK_HOME_LABEL } from '../../app/(student)/player';
import { messageFor, NETWORK_ERROR, STAGE_LOCKED } from '../api/errors';
import { mockResponse } from '../api/mocks/handlers';
import {
  expireMockSession,
  forceMockStageLocked,
  markMockConfirmationOverdue,
  MOCK_CREATED,
  MOCK_NO_CONTENT,
  mockRoutes,
  resetMockStudentRecords,
  resetMockStudents,
  resetMockVisitorRecords,
} from '../api/mocks/routes';
import { AppProviders, createQueryClient } from '../AppProviders';
import { returnPath } from '../auth/sessionEnd';
import { forgetCachedSession } from '../auth/session';
import { STUDENT_QUERY_KEY, type StudentProfile } from '../auth/student';
import { CONFIRM_TO_RECOVER, SIGN_OUT_LABEL, studentGreeting } from '../auth/StudentHome';
import type { Dashboard, DashboardUnit } from '../dashboard/dashboard';
import { focusUnit } from '../dashboard/dashboard';
import {
  ALL_DONE,
  DASHBOARD_CONTINUE,
  DASHBOARD_RETRY,
  DASHBOARD_START,
  DASHBOARD_SUBTITLE,
  LOCKED_HINT,
  NO_RESULT_LABEL,
  NO_UNIT,
} from '../dashboard/StudentDashboard';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal/versions';
import { OFFLINE_LABEL, OFFLINE_TEXT } from '../network/text';
import { captureError } from '../observability/sentry';
import { CLOSE_LABEL } from '../player/PlayerFrame';
import { registry, type ActivityProps, type ActivityRegistry } from '../player/registry';
import { CHECK_LABEL, CONTINUE_LABEL, REVEAL_LABEL } from '../player/useEvaluation';
import { FEEDBACK_TITLES } from '../ui';
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

const DASHBOARD = '/api/v1/students/me/dashboard';
const ATTEMPTS = '/api/v1/students/me/attempts';
const COMPLETIONS = '/api/v1/students/me/completions';
const STAGE_PATH = '/api/v1/units/unit-1/stages/stage-1';

const MOCK_STAGE = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data;
type StageActivity = (typeof MOCK_STAGE.activities)[number];
const CHOICES = MOCK_STAGE.activities.filter(
  (activity): activity is Extract<StageActivity, { type: 'choice' }> => activity.type === 'choice',
);
const CHOICE = CHOICES[0]!;
const DIALOGUE = MOCK_STAGE.activities.find((activity) => activity.type === 'dialogue')!;

/** O Estágio que a API responde (cada teste escolhe as Atividades). */
let servedStage: typeof MOCK_STAGE = { ...MOCK_STAGE, activities: [CHOICE, CHOICES[1]!, CHOICES[2]!] };

let override: Partial<Record<string, () => Response | Promise<Response>>> = {};

type Sent = { method: string; path: string; body: Record<string, unknown> | undefined };
const sent: Sent[] = [];
const ofRoute = (method: string, path: string) =>
  sent.filter((request) => request.method === method && request.path === path);

function apiResponds() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = new URL(url).pathname;
    sent.push({ method, path, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    const forced = override[`${method} ${path}`];
    if (forced) return forced();
    if (path === '/api/v1/meta') return json({ data: { minAppVersion: '0.0.0', activityTypes: [] } });
    if (path === STAGE_PATH) return json({ data: servedStage });
    if (path === '/api/v1/units/unit-1') return json(mockRoutes['/api/v1/units/{unitKey}'].get(new Request(url)));
    const routes = mockRoutes as unknown as Record<string, Record<string, (request: Request) => unknown>>;
    const resolve = routes[path]?.[method.toLowerCase()];
    if (!resolve) return json({ code: 'NOT_FOUND' }, 404);
    const key = `${method} ${path}`;
    return mockResponse(resolve, new Request(url, init), MOCK_CREATED.has(key) ? 201 : 200, MOCK_NO_CONTENT.has(key));
  }) as jest.Mock;
}

const ADULT = {
  email: 'ana@exemplo.test',
  password: 'segredo123',
  birthDate: '1990-05-20',
  name: 'Ana',
  acceptedTermsVersion: TERMS_VERSION,
  acceptedPrivacyVersion: PRIVACY_VERSION,
};

/** Uma conta com sessão aberta no mock (Android, token no armazenamento seguro). */
async function signedUp(confirmed = true): Promise<StudentProfile> {
  const { data } = await mockRoutes['/api/v1/auth/signup'].post(
    new Request('http://mock/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'X-Fluveny-Client': 'android' },
      body: JSON.stringify(ADULT),
    }),
  );
  global.__secureStore.set('fluveny.session', data.sessionToken!);
  forgetCachedSession();
  return { ...data.student, emailConfirmed: confirmed };
}

let client: QueryClient;

async function openApp(initialUrl: string, student?: StudentProfile) {
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
      '(public)/entrar': SignIn,
      '(student)/player': Player,
      '(student)/convite': StageTwoInvite,
      '(student)/cadastro': SignUp,
    },
    { initialUrl },
  );
}

const button = (name: string) => screen.getByRole('button', { name });

/** Responde a primeira Escolha com o Acerto (A, B, B). */
async function answerChoice() {
  for (const [item, letter] of ['A', 'B', 'B'].entries()) {
    await fireEvent.press(screen.getByTestId(`choice-${CHOICE.items[item]!.itemKey}-${letter}`));
  }
  await fireEvent.press(button(CHECK_LABEL));
}

/** O painel do mock para uma conta sem registros, com mudanças na Unit 1. */
function dashboard(unit: Partial<DashboardUnit> = {}, extra: Partial<Dashboard> = {}): Dashboard {
  return {
    name: 'Ana',
    xpTotal: 0,
    badgeCount: 0,
    units: [
      {
        unitKey: 'unit-1',
        order: 1,
        title: 'Unit 1',
        comingSoon: false,
        versionId: MOCK_STAGE.versionId,
        started: false,
        stagesCompleted: 0,
        stagesTotal: 1,
        stages: [{ stageKey: 'stage-1', title: 'Meet & Greet', state: 'CURRENT' }],
        next: { stageKey: 'stage-1', activityKey: CHOICE.activityKey, position: 1, total: 3 },
        ...unit,
      },
      {
        unitKey: 'unit-2',
        order: 2,
        title: 'Unit 2',
        comingSoon: true,
        versionId: 'sha256:2',
        started: false,
        stagesCompleted: 0,
        stagesTotal: 0,
        stages: [],
      },
    ],
    ...extra,
  };
}

const answering = (body: Dashboard) => {
  override[`GET ${DASHBOARD}`] = () => json({ data: body });
};

const os = Platform.OS;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  Platform.OS = 'android';
  global.__resetSqlite();
  global.__resetSecureStore();
  global.__resetNetwork();
  forgetCachedSession();
  clearVisitorCache();
  resetMockStudents();
  resetMockStudentRecords();
  resetMockVisitorRecords();
  override = {};
  sent.length = 0;
  servedStage = { ...MOCK_STAGE, activities: [CHOICE, CHOICES[1]!, CHOICES[2]!] };
  (captureError as jest.Mock).mockClear();
  apiResponds();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  Platform.OS = os;
  jest.restoreAllMocks();
});

describe('painel do Aluno (2.5)', () => {
  it('primeira vez: "Hi, {nome}!", COMEÇAR, 0, 0, 0/1 e "–"; o Estágio 1 em azul (do mock)', async () => {
    const student = await signedUp();
    await openApp('/', student);
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(screen.getByText(DASHBOARD_SUBTITLE)).toBeTruthy();
    expect(button(DASHBOARD_START)).toBeTruthy();
    expect(screen.getByLabelText('0 XP')).toBeTruthy();
    expect(screen.getByLabelText('XP total: 0')).toBeTruthy();
    expect(screen.getByLabelText('Badges: 0')).toBeTruthy();
    expect(screen.getByLabelText('Estágios: 0 de 1')).toBeTruthy();
    expect(screen.getByLabelText(NO_RESULT_LABEL)).toBeTruthy();
    expect(screen.getByText('UNIT 1 · 0 DE 1 ESTÁGIOS')).toBeTruthy();
    const card = screen.getByTestId('stage-card-stage-1');
    expect(card.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(ofRoute('GET', DASHBOARD)).toHaveLength(1);
    expect(captureError).not.toHaveBeenCalled();
  });

  it('retomar: CONTINUAR abre o player em next ("3 DE 13" no painel, a Atividade 3 no player)', async () => {
    const student = await signedUp();
    answering(
      dashboard({
        started: true,
        next: { stageKey: 'stage-1', activityKey: CHOICES[2]!.activityKey, position: 3, total: 13 },
      }),
    );
    await openApp('/', student);
    expect(await screen.findByText('ATIVIDADE 3 DE 13')).toBeTruthy();
    await fireEvent.press(button(DASHBOARD_CONTINUE));
    await waitFor(() => expect(screen).toHavePathname('/player'));
    expect(screen).toHaveSearchParams({ unidade: 'unit-1', estagio: 'stage-1', atividade: CHOICES[2]!.activityKey });
    expect(await screen.findByText('3 DE 3')).toBeTruthy();
  });

  it('cartão atual: abre o Estágio do início, e a Atividade na tela vai para a URL', async () => {
    const student = await signedUp();
    answering(
      dashboard({
        started: true,
        next: { stageKey: 'stage-1', activityKey: CHOICES[1]!.activityKey, position: 2, total: 3 },
      }),
    );
    await openApp('/', student);
    await fireEvent.press(await screen.findByTestId('stage-card-stage-1'));
    expect(await screen.findByText('1 DE 3')).toBeTruthy();
    await waitFor(() =>
      expect(screen).toHaveSearchParams({ unidade: 'unit-1', estagio: 'stage-1', atividade: CHOICE.activityKey }),
    );
  });

  it('concluído e bloqueado: ✓ tocável (abre do início); bloqueado sem toque e com o aviso ao leitor', async () => {
    const student = await signedUp();
    answering(
      dashboard({
        started: true,
        stagesCompleted: 1,
        stagesTotal: 3,
        averageResultPct: 87,
        stages: [
          { stageKey: 'stage-1', title: 'Meet & Greet', state: 'COMPLETED' },
          { stageKey: 'stage-2', title: 'Campus', state: 'CURRENT' },
          { stageKey: 'stage-3', title: 'Classes', state: 'LOCKED' },
        ],
        next: { stageKey: 'stage-2', activityKey: 'a-1', position: 1, total: 5 },
      }),
    );
    await openApp('/', student);
    expect(await screen.findByLabelText('Estágio 1, Meet & Greet, concluído')).toBeTruthy();
    expect(screen.getByLabelText('Estágio 2, Campus, atual')).toBeTruthy();
    expect(screen.getByLabelText('Resultado médio: 87%')).toBeTruthy();
    expect(screen.getByLabelText('Estágios: 1 de 3')).toBeTruthy();
    const locked = screen.getByLabelText(`Estágio 3, Classes. ${LOCKED_HINT}`);
    expect(locked.props.accessibilityRole).toBeUndefined();
    expect(locked.props.onPress).toBeUndefined();
    expect(screen.queryByRole('button', { name: /Estágio 3/ })).toBeNull();
    await fireEvent.press(screen.getByTestId('stage-card-stage-1'));
    await waitFor(() => expect(screen).toHavePathname('/player'));
    expect(await screen.findByText('1 DE 3')).toBeTruthy();
  });

  it('tudo concluído: sem botão e sem subtítulo, com a linha dos Estágios disponíveis', async () => {
    const student = await signedUp();
    answering(
      dashboard({
        started: true,
        stagesCompleted: 1,
        stages: [{ stageKey: 'stage-1', title: 'Meet & Greet', state: 'COMPLETED' }],
        next: undefined,
      }),
    );
    await openApp('/', student);
    expect(await screen.findByText(ALL_DONE)).toBeTruthy();
    expect(screen.queryByTestId('dashboard-play')).toBeNull();
    expect(screen.queryByText(DASHBOARD_SUBTITLE)).toBeNull();
  });

  it('em breve: a Unit 2 bloqueada, sem toque', async () => {
    const student = await signedUp();
    await openApp('/', student);
    const soon = await screen.findByLabelText('Unit 2, em breve');
    expect(soon.props.accessibilityRole).toBeUndefined();
    expect(screen.queryByRole('button', { name: /Unit 2/ })).toBeNull();
  });

  it('sem nome: "Hi, friend!"', async () => {
    const student = await signedUp();
    answering(dashboard({}, { name: undefined }));
    await openApp('/', { ...student, name: null });
    expect(await screen.findByRole('header', { name: 'Hi, friend!' })).toBeTruthy();
  });

  it('sem Unidade liberada: a linha, sem botão', async () => {
    const student = await signedUp();
    const body = dashboard();
    answering({ ...body, units: body.units.filter((unit) => unit.comingSoon) });
    await openApp('/', student);
    expect(await screen.findByText(NO_UNIT)).toBeTruthy();
    expect(screen.queryByTestId('dashboard-play')).toBeNull();
  });

  it('gravou: o painel é relido, e ao fechar o player ele mostra os números novos', async () => {
    const student = await signedUp();
    await openApp('/', student);
    await fireEvent.press(await screen.findByRole('button', { name: DASHBOARD_START }));
    // O mock começa o `next` na primeira Atividade do Estágio completo: fora do Estágio servido, a 1.
    expect(await screen.findByText('1 DE 3')).toBeTruthy();
    const before = ofRoute('GET', DASHBOARD).length;
    await answerChoice();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    await waitFor(() => expect(ofRoute('GET', DASHBOARD).length).toBeGreaterThan(before));
    await fireEvent.press(button(CONTINUE_LABEL));
    await fireEvent.press(button(CLOSE_LABEL));
    expect(await screen.findByLabelText('XP total: 10')).toBeTruthy();
    expect(button(DASHBOARD_CONTINUE)).toBeTruthy();
  });

  it('outro aparelho: a mesma conta, com outro cache, vê o mesmo painel e o mesmo next', async () => {
    const student = await signedUp();
    await openApp('/', student);
    await fireEvent.press(await screen.findByRole('button', { name: DASHBOARD_START }));
    expect(await screen.findByText('1 DE 3')).toBeTruthy();
    await answerChoice();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    await act(async () => {});
    const seen = client.getQueryData<Dashboard>(['student', 'dashboard']);
    // Outro aparelho: um cache novo, a mesma conta.
    await openApp('/', student);
    expect(await screen.findByLabelText('XP total: 10')).toBeTruthy();
    expect(button(DASHBOARD_CONTINUE)).toBeTruthy();
    await waitFor(() => expect(client.getQueryData<Dashboard>(['student', 'dashboard'])).toEqual(seen));
    expect(focusUnit(seen)?.next?.activityKey).toBeDefined();
  });

  it('leitura falha (500): a mensagem e TENTAR DE NOVO; a saudação, a faixa e o Sair ficam; Sentry', async () => {
    const student = await signedUp(false);
    override[`GET ${DASHBOARD}`] = () => json({ code: 'INTERNAL_ERROR' }, 500);
    await openApp('/', student);
    expect(await screen.findByText(messageFor('INTERNAL_ERROR'))).toBeTruthy();
    expect(screen.getByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
    expect(screen.getByTestId('email-confirmation-banner')).toBeTruthy();
    expect(screen.getByRole('button', { name: SIGN_OUT_LABEL })).toBeTruthy();
    expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }));
    delete override[`GET ${DASHBOARD}`];
    await fireEvent.press(button(DASHBOARD_RETRY));
    expect(await screen.findByRole('button', { name: DASHBOARD_START })).toBeTruthy();
  });

  it('sem rede: a faixa offline, o painel do cache, o botão "SEM CONEXÃO" e os cartões sem toque', async () => {
    const student = await signedUp();
    await openApp('/', student);
    expect(await screen.findByRole('button', { name: DASHBOARD_START })).toBeTruthy();
    await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
    expect(await screen.findByText(OFFLINE_TEXT)).toBeTruthy();
    const play = screen.getByRole('button', { name: OFFLINE_LABEL });
    expect(play.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    const card = screen.getByTestId('stage-card-stage-1');
    expect(card.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(card);
    expect(screen).toHavePathname('/');
    expect(screen.getByLabelText('XP total: 0')).toBeTruthy();
  });

  it('volta da rede: o painel é relido uma vez e a faixa offline some', async () => {
    const student = await signedUp();
    await openApp('/', student);
    expect(await screen.findByRole('button', { name: DASHBOARD_START })).toBeTruthy();
    await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
    expect(await screen.findByText(OFFLINE_TEXT)).toBeTruthy();
    const before = ofRoute('GET', DASHBOARD).length;
    await act(async () => global.__setNetwork({ isConnected: true, isInternetReachable: true }));
    await waitFor(() => expect(screen.queryByText(OFFLINE_TEXT)).toBeNull());
    await act(async () => {});
    expect(ofRoute('GET', DASHBOARD).length).toBe(before + 1);
  });

  it('sem rede e sem cache: uma mensagem só (a faixa) e TENTAR DE NOVO desabilitado', async () => {
    const student = await signedUp();
    global.__setNetwork({ isConnected: false, isInternetReachable: false });
    override[`GET ${DASHBOARD}`] = () => Promise.reject(new TypeError('Network request failed'));
    await openApp('/', student);
    expect(await screen.findByText(OFFLINE_TEXT)).toBeTruthy();
    expect(screen.getAllByText(messageFor(NETWORK_ERROR))).toHaveLength(1);
    expect(button(DASHBOARD_RETRY).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('painel sem name: a saudação usa o nome do perfil', async () => {
    const student = await signedUp();
    answering(dashboard({}, { name: undefined }));
    await openApp('/', student);
    expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
  });

  it('faixa dos 7 dias: o texto da 2.8 no painel', async () => {
    const student = await signedUp(false);
    markMockConfirmationOverdue(ADULT.email);
    await openApp('/', { ...student, emailConfirmationOverdue: true });
    expect(await screen.findByText(CONFIRM_TO_RECOVER)).toBeTruthy();
  });

  it('mock: o painel sem sessão dá 401', () => {
    expect(() => mockRoutes['/api/v1/students/me/dashboard'].get(new Request('http://mock'))).toThrow(
      expect.objectContaining({ status: 401, code: 'UNAUTHENTICATED' }),
    );
  });
});

describe('player no Estágio e na Atividade (2.5)', () => {
  it('Atividade sumiu: `atividade` fora do Estágio começa na Atividade 1', async () => {
    const student = await signedUp();
    await openApp('/player?unidade=unit-1&estagio=stage-1&atividade=nao-existe', student);
    expect(await screen.findByText('1 DE 3')).toBeTruthy();
  });

  it('Estágio fora da Unidade: NOT_FOUND', async () => {
    const student = await signedUp();
    await openApp('/player?unidade=unit-1&estagio=stage-9', student);
    expect(await screen.findByText(messageFor('NOT_FOUND'))).toBeTruthy();
  });

  it('parâmetro mal formado é ignorado: o primeiro Estágio, Atividade 1', async () => {
    const student = await signedUp();
    await openApp('/player?estagio=..%2Fx&atividade=ABC', student);
    expect(await screen.findByText('1 DE 3')).toBeTruthy();
  });

  it('Visitante: ignora os parâmetros (Estágio 1, Atividade 1) e não muda a URL', async () => {
    await openApp(`/player?estagio=stage-2&atividade=${CHOICES[2]!.activityKey}`);
    expect(await screen.findByText('1 DE 3')).toBeTruthy();
    await act(async () => {});
    expect(screen).toHaveSearchParams({ estagio: 'stage-2', atividade: CHOICES[2]!.activityKey });
    expect(sent.some((request) => request.path.startsWith('/api/v1/students/me'))).toBe(false);
  });

  it('401 no meio: Entrar com o volta do player; depois, a mesma Atividade, do início', async () => {
    const student = await signedUp();
    await openApp(`/player?unidade=unit-1&estagio=stage-1&atividade=${CHOICES[1]!.activityKey}`, student);
    expect(await screen.findByText('2 DE 3')).toBeTruthy();
    expireMockSession();
    await act(async () => {
      await client.refetchQueries({ queryKey: STUDENT_QUERY_KEY });
    });
    expect(await screen.findByText(SESSION_ENDED)).toBeTruthy();
    expect(screen).toHaveSearchParams({
      volta: `/player?unidade=unit-1&estagio=stage-1&atividade=${CHOICES[1]!.activityKey}`,
      motivo: 'sessao',
    });
    await fireEvent.changeText(screen.getByLabelText(EMAIL_FIELD), ADULT.email);
    await fireEvent.changeText(screen.getByLabelText(PASSWORD_FIELD), ADULT.password);
    await fireEvent.press(button(SIGN_IN_LABEL));
    await waitFor(() => expect(screen).toHavePathname('/player'));
    expect(await screen.findByText('2 DE 3')).toBeTruthy();
  });

  it('volta adulterado: só a raiz ou o player com os parâmetros válidos', () => {
    expect(returnPath('/player?unidade=unit-1&estagio=stage-1&atividade=..%2Fx')).toBe(
      '/player?unidade=unit-1&estagio=stage-1',
    );
    expect(returnPath('/player?atividade=a-1&next=https%3A%2F%2Fmal.test')).toBe('/player?atividade=a-1');
    expect(returnPath('/player?unidade=UNIT')).toBe('/player');
    expect(returnPath('/player?unidade=%E0%A4%A')).toBe('/player');
    expect(returnPath(`/player?atividade=${'a'.repeat(129)}`)).toBe('/player');
    expect(returnPath('/cadastro?unidade=unit-1')).toBe('/');
    expect(returnPath('//mal.test/player?unidade=unit-1')).toBe('/');
    expect(returnPath('/?atividade=a-1')).toBe('/');
  });
});

describe('Estágio travado (2.5)', () => {
  it('409 na Tentativa: a mensagem e VOLTAR AO INÍCIO; o painel é relido; sem Sentry nem repetição', async () => {
    const student = await signedUp();
    await openApp('/', student);
    await fireEvent.press(await screen.findByRole('button', { name: DASHBOARD_START }));
    expect(await screen.findByText('1 DE 3')).toBeTruthy();
    forceMockStageLocked(true);
    const before = ofRoute('GET', DASHBOARD).length;
    await answerChoice();
    expect(await screen.findByText(messageFor(STAGE_LOCKED))).toBeTruthy();
    await waitFor(() => expect(ofRoute('GET', DASHBOARD).length).toBeGreaterThan(before));
    expect(ofRoute('POST', ATTEMPTS)).toHaveLength(1);
    expect(captureError).not.toHaveBeenCalled();
    await fireEvent.press(button(BACK_HOME_LABEL));
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(await screen.findByLabelText('XP total: 0')).toBeTruthy();
  });

  it('409 no reveal: a tela do Estágio travado, sem Sentry', async () => {
    const student = await signedUp();
    await openApp('/player', student);
    expect(await screen.findByText('1 DE 3')).toBeTruthy();
    for (const [item, letter] of ['B', 'B', 'B'].entries()) {
      await fireEvent.press(screen.getByTestId(`choice-${CHOICE.items[item]!.itemKey}-${letter}`));
    }
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.wrong)).toBeTruthy();
    forceMockStageLocked(true);
    await fireEvent.press(button(REVEAL_LABEL));
    expect(await screen.findByText(messageFor(STAGE_LOCKED))).toBeTruthy();
    expect(button(BACK_HOME_LABEL)).toBeTruthy();
    expect(captureError).not.toHaveBeenCalled();
  });

  it('409 na conclusão: a mesma tela, sem mensagem no rodapé nem Sentry; sem rede, VOLTAR AO INÍCIO fica', async () => {
    servedStage = { ...MOCK_STAGE, activities: [DIALOGUE, CHOICE] };
    const types = registry as ActivityRegistry;
    const previous = types.dialogue;
    types.dialogue = function Viewed({ setFooter, advance }: ActivityProps) {
      useEffect(() => {
        setFooter({ label: 'PULAR', onPress: () => void advance({ outcome: 'viewed', xp: 0 }) });
      }, [setFooter, advance]);
      return null;
    };
    try {
      const student = await signedUp();
      await openApp('/player', student);
      expect(await screen.findByText('1 DE 2')).toBeTruthy();
      forceMockStageLocked(true);
      await fireEvent.press(button('PULAR'));
      expect(await screen.findByText(messageFor(STAGE_LOCKED))).toBeTruthy();
      expect(ofRoute('POST', COMPLETIONS)).toHaveLength(1);
      expect(captureError).not.toHaveBeenCalled();
      await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
      expect(button(BACK_HOME_LABEL)).toBeTruthy();
    } finally {
      types.dialogue = previous!;
    }
  });

  it('Visitante: o mock não trava as rotas dele', async () => {
    forceMockStageLocked(true);
    await openApp('/');
    expect(await screen.findByRole('button', { name: TRY_NOW })).toBeTruthy();
    await fireEvent.press(button(TRY_NOW));
    expect(await screen.findByText('1 DE 3')).toBeTruthy();
    await answerChoice();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
  });
});
