// Matriz da 2.4 no App (Progresso e XP salvos no servidor): uma linha por teste.
// O Aluno joga pelas rotas `/students/me/*` do mock, sem `deviceId` e sem recibo.
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { AccessibilityInfo, AppState, Platform, Text, type AppStateStatus } from 'react-native';

import { RootStack } from '../../app/_layout';
import SignIn, { EMAIL_FIELD, PASSWORD_FIELD, SESSION_ENDED, SIGN_IN_LABEL } from '../../app/(public)/entrar';
import Root, { TRY_NOW } from '../../app/(public)/index';
import SignUp from '../../app/(student)/cadastro';
import StageTwoInvite from '../../app/(student)/convite';
import Player, { RETRY_LABEL, SAVE_FAILED, SAVE_RETRY_LABEL, SAVING_LABEL } from '../../app/(student)/player';
import { messageFor, NETWORK_ERROR } from '../api/errors';
import { mockResponse } from '../api/mocks/handlers';
import {
  expireMockSession,
  MOCK_CREATED,
  MOCK_NO_CONTENT,
  mockRoutes,
  resetMockStudentRecords,
  resetMockStudents,
  resetMockVisitorRecords,
} from '../api/mocks/routes';
import { AppProviders, createQueryClient } from '../AppProviders';
import { forgetCachedSession } from '../auth/session';
import { STUDENT_QUERY_KEY, type StudentProfile } from '../auth/student';
import { SIGN_OUT_BODY, SIGN_OUT_CONFIRM, studentGreeting } from '../auth/StudentHome';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal/versions';
import { captureError } from '../observability/sentry';
import { CLOSE_LABEL, OFFLINE_LABEL } from '../player/PlayerFrame';
import { registry, type ActivityProps, type ActivityRegistry } from '../player/registry';
import { RESULT_STAT, SUMMARY_CONTINUE } from '../player/StageSummary';
import { PROGRESS_QUERY_KEY } from '../player/studentProgress';
import { ANSWER_LABEL, SEND_LABEL, YOU_WROTE } from '../player/types/FreeActivity';
import { CHECK_LABEL, CONTINUE_LABEL, RETRY_LABEL as RETRY_SHEET, REVEAL_LABEL } from '../player/useEvaluation';
import { FEEDBACK_TITLES } from '../ui';
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
const offline = () => Promise.reject(new TypeError('Network request failed'));

const ATTEMPTS = '/api/v1/students/me/attempts';
const REVEAL = '/api/v1/students/me/attempts/reveal';
const COMPLETIONS = '/api/v1/students/me/completions';
const EVENTS = '/api/v1/students/me/events';
const PROGRESS = '/api/v1/students/me/progress';
const ME = '/api/v1/students/me';
const STAGE_PATH = '/api/v1/units/unit-1/stages/stage-1';

const MOCK_STAGE = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data;
type StageActivity = (typeof MOCK_STAGE.activities)[number];
const CHOICES = MOCK_STAGE.activities.filter(
  (activity): activity is Extract<StageActivity, { type: 'choice' }> => activity.type === 'choice',
);
/** A primeira Escolha do mock: três itens, certos com A, B e B (xp 10). */
const CHOICE = CHOICES[0]!;
const DIALOGUE = MOCK_STAGE.activities.find((activity) => activity.type === 'dialogue')!;
const FREE = MOCK_STAGE.activities.find((activity) => activity.type === 'free')!;
const GAPS_TYPED = MOCK_STAGE.activities.find((activity) => activity.activityKey === 'gaps-typed')!;

/** O Estágio que a API responde (cada teste escolhe as Atividades). */
let servedStage: typeof MOCK_STAGE = { ...MOCK_STAGE, activities: [CHOICE] };

/** Troca a resposta de uma rota (`MÉTODO caminho`) por um teste; `undefined` segue para o mock. */
let override: Partial<Record<string, () => Response | Promise<Response | undefined> | undefined>> = {};

type Sent = { method: string; path: string; headers: Headers; body: Record<string, unknown> | undefined };
const sent: Sent[] = [];
const ofRoute = (method: string, path: string) =>
  sent.filter((request) => request.method === method && request.path === path);

/** A API respondendo com os mocks de `routes.ts`, com o Estágio de `servedStage`. */
function apiResponds() {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = new URL(url).pathname;
    sent.push({
      method,
      path,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const forced = await override[`${method} ${path}`]?.();
    if (forced) return forced;
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

/**
 * Uma conta com sessão aberta no mock. No Android, o token vai para o
 * armazenamento seguro (o App o manda como Bearer); no web, a sessão vale para
 * qualquer requisição (o cookie). Devolve o perfil, com o e-mail já confirmado.
 */
async function signedUp(client: 'android' | 'web' = 'android'): Promise<StudentProfile> {
  const { data } = await mockRoutes['/api/v1/auth/signup'].post(
    new Request('http://mock/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'X-Fluveny-Client': client },
      body: JSON.stringify(ADULT),
    }),
  );
  if (data.sessionToken) {
    global.__secureStore.set('fluveny.session', data.sessionToken);
    forgetCachedSession();
  }
  return { ...data.student, emailConfirmed: true };
}

let client: QueryClient;

/** Abre o App em `initialUrl`; com `student`, o Aluno da sessão já está no cache. */
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

/** Abre o player com o Aluno logado (Android, token no armazenamento seguro). */
async function playAsStudent(total = servedStage.activities.length) {
  const student = await signedUp();
  await openApp('/player', student);
  await screen.findByText(`1 DE ${total}`);
  return student;
}

const button = (name: string) => screen.getByRole('button', { name });

/** Responde a primeira Escolha: `letters` por item (A, B, B é o Acerto). */
async function answerChoice(letters: readonly string[] = ['A', 'B', 'B']) {
  for (const [item, letter] of letters.entries()) {
    await fireEvent.press(screen.getByTestId(`choice-${CHOICE.items[item]!.itemKey}-${letter}`));
  }
  await fireEvent.press(button(CHECK_LABEL));
}

/** Nenhuma requisição foi às rotas do Visitante nem levou `deviceId` ou `receipt`. */
function expectStudentOnly() {
  expect(sent.filter((request) => request.path.includes('/visitor/'))).toEqual([]);
  for (const request of sent) {
    expect(request.body ?? {}).not.toHaveProperty('deviceId');
    expect(request.body ?? {}).not.toHaveProperty('receipt');
  }
}

/** Tipo de teste que conclui com `outcome` no toque em PULAR (sem esperar a conclusão). */
const SKIP_LABEL = 'PULAR';
const finishing = (outcome: 'viewed' | 'skipped') =>
  function FinishingActivity({ activity, setFooter, advance }: ActivityProps) {
    useEffect(() => {
      setFooter({ label: SKIP_LABEL, onPress: () => void advance({ outcome, xp: 0 }) });
    }, [setFooter, advance]);
    return <Text>{activity.activityKey}</Text>;
  };

/** Troca o componente de um Tipo durante um teste. */
async function withType(type: string, component: (props: ActivityProps) => React.ReactNode, run: () => Promise<void>) {
  const types = registry as ActivityRegistry;
  const previous = types[type];
  types[type] = component;
  try {
    await run();
  } finally {
    types[type] = previous!;
  }
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
  resetMockStudentRecords();
  resetMockVisitorRecords();
  override = {};
  sent.length = 0;
  servedStage = { ...MOCK_STAGE, activities: [CHOICE] };
  (captureError as jest.Mock).mockClear();
  apiResponds();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  Platform.OS = os;
  jest.restoreAllMocks();
});

describe('quem joga e o XP do servidor (2.4)', () => {
  it('abrir logado: o chip mostra o XP do servidor; ACTIVITY_STARTED pela rota do Aluno, sem deviceId', async () => {
    override[`GET ${PROGRESS}`] = () => json({ data: { xpTotal: 20, results: [] } });
    await playAsStudent();
    expect(await screen.findByLabelText('20 XP')).toBeTruthy();
    await waitFor(() => expect(ofRoute('POST', EVENTS)).toHaveLength(1));
    const [event] = ofRoute('POST', EVENTS);
    expect(event!.body).toEqual({
      type: 'ACTIVITY_STARTED',
      versionId: MOCK_STAGE.versionId,
      activityKey: CHOICE.activityKey,
    });
    expect(event!.headers.get('Authorization')).toMatch(/^Bearer /);
    expectStudentOnly();
    expect(captureError).not.toHaveBeenCalled();
  });

  it('sem rede ao avançar: o ACTIVITY_STARTED da seguinte é descartado; um 500 no evento vai ao Sentry', async () => {
    servedStage = { ...MOCK_STAGE, activities: [DIALOGUE, CHOICE] };
    override[`POST ${EVENTS}`] = () => json({ code: 'INTERNAL_ERROR' }, 500);
    await withType('dialogue', finishing('viewed'), async () => {
      await playAsStudent();
      await waitFor(() => expect(ofRoute('POST', EVENTS)).toHaveLength(1));
      await waitFor(() => expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ status: 500 })));
      // A conclusão sai antes de a rede cair; a Atividade seguinte aparece já sem rede.
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      override[`POST ${COMPLETIONS}`] = async () => {
        await held;
        return undefined;
      };
      await fireEvent.press(button(SKIP_LABEL));
      await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
      await act(async () => release());
      expect(await screen.findByText('2 DE 2')).toBeTruthy();
      await act(async () => {});
      expect(ofRoute('POST', EVENTS)).toHaveLength(1);
    });
  });

  it('a primeira leitura do Progresso falha (500): vai ao Sentry, e a volta da rede a busca de novo', async () => {
    let failure: (() => Response) | null = () => json({ code: 'INTERNAL_ERROR' }, 500);
    override[`GET ${PROGRESS}`] = () => failure?.();
    await playAsStudent();
    await waitFor(() => expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ status: 500 })));
    expect(screen.queryByTestId('xp-chip')).toBeNull();
    failure = null;
    await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
    await act(async () => global.__setNetwork({ isConnected: true, isInternetReachable: true }));
    expect(await screen.findByLabelText('0 XP')).toBeTruthy();
  });

  it('o chip fica escondido até a primeira leitura do Progresso', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    override[`GET ${PROGRESS}`] = async () => {
      await held;
      return undefined;
    };
    await playAsStudent();
    expect(screen.queryByTestId('xp-chip')).toBeNull();
    await act(async () => release());
    expect(await screen.findByLabelText('0 XP')).toBeTruthy();
  });

  it('recarregar /player no web, sem cache: busca /students/me e joga como Aluno', async () => {
    asWeb();
    await signedUp('web');
    await openApp('/player');
    expect(await screen.findByText('1 DE 1')).toBeTruthy();
    expect(ofRoute('GET', ME)).toHaveLength(1);
    await waitFor(() => expect(ofRoute('POST', EVENTS)).toHaveLength(1));
    expect(await screen.findByLabelText('0 XP')).toBeTruthy();
    expectStudentOnly();
  });

  it('quem joga falha (500, depois sem rede): messageFor e TENTAR DE NOVO, sem enviar nada', async () => {
    asWeb();
    await signedUp('web');
    let failure: (() => Response | Promise<Response>) | null = () => json({ code: 'INTERNAL_ERROR' }, 500);
    override[`GET ${ME}`] = () => failure?.();
    await openApp('/player');
    expect(await screen.findByText(messageFor('INTERNAL_ERROR'))).toBeTruthy();
    failure = offline;
    await fireEvent.press(button(RETRY_LABEL));
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    // Nada foi enviado: nem evento, nem Tentativa, e nunca pela rota do Visitante.
    expect(sent.filter((request) => request.method === 'POST')).toEqual([]);
    failure = null;
    await fireEvent.press(button(RETRY_LABEL));
    expect(await screen.findByText('1 DE 1')).toBeTruthy();
    await waitFor(() => expect(ofRoute('POST', EVENTS)).toHaveLength(1));
    expectStudentOnly();
  });

  it('Visitante no web sem cookie: /students/me dá 401 e o player joga pelas rotas do Visitante', async () => {
    asWeb();
    await openApp('/player');
    expect(await screen.findByText('1 DE 1')).toBeTruthy();
    expect(ofRoute('GET', ME)).toHaveLength(1);
    await waitFor(() => expect(ofRoute('POST', '/api/v1/visitor/events')).toHaveLength(1));
    expect(ofRoute('POST', '/api/v1/visitor/events')[0]!.body).toHaveProperty('deviceId');
    expect(ofRoute('POST', EVENTS)).toEqual([]);
    expect(ofRoute('GET', PROGRESS)).toEqual([]);
    expect(screen.getByLabelText('0 XP')).toBeTruthy();
    await answerChoice();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(ofRoute('POST', '/api/v1/visitor/attempts')).toHaveLength(1);
    expect(ofRoute('POST', ATTEMPTS)).toEqual([]);
  });

  it('Visitante (sem token no Android): rotas do Visitante, sem perguntar /students/me', async () => {
    await openApp('/player');
    expect(await screen.findByText('1 DE 1')).toBeTruthy();
    await waitFor(() => expect(ofRoute('POST', '/api/v1/visitor/events')).toHaveLength(1));
    expect(ofRoute('POST', '/api/v1/visitor/events')[0]!.body).toHaveProperty('deviceId');
    expect(ofRoute('GET', ME)).toEqual([]);
    expect(ofRoute('GET', PROGRESS)).toEqual([]);
    expect(screen.getByLabelText('0 XP')).toBeTruthy();
  });
});

describe('Tentativa do Aluno (2.4)', () => {
  it('1ª Tentativa: grava no servidor, folha com +10, CONTINUAR avança sem POST e o chip sobe com o servidor', async () => {
    servedStage = { ...MOCK_STAGE, activities: [CHOICE, CHOICES[1]!] };
    await playAsStudent();
    expect(await screen.findByLabelText('0 XP')).toBeTruthy();
    await answerChoice();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(screen.getByLabelText('+10 XP')).toBeTruthy();
    const [attempt] = ofRoute('POST', ATTEMPTS);
    expect(Object.keys(attempt!.body!).sort()).toEqual(
      ['activityKey', 'answer', 'attemptId', 'studyTimeMs', 'type', 'versionId'].sort(),
    );
    expect(attempt!.body).toEqual(
      expect.objectContaining({ activityKey: CHOICE.activityKey, versionId: MOCK_STAGE.versionId, type: 'choice' }),
    );
    // A gravação confirmada relê o Progresso: o chip sobe com o número do servidor.
    expect(await screen.findByLabelText('10 XP')).toBeTruthy();
    const posts = sent.filter((request) => request.method === 'POST').length;
    const reads = ofRoute('GET', PROGRESS).length;
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(await screen.findByText('2 DE 2')).toBeTruthy();
    // CONTINUAR não chama o servidor (só o ACTIVITY_STARTED da seguinte).
    expect(sent.filter((request) => request.method === 'POST' && request.path !== EVENTS)).toHaveLength(posts - 1);
    expect(ofRoute('GET', PROGRESS)).toHaveLength(reads);
    // O Aluno não grava Progresso nem recibos no aparelho.
    expect(await visitorStore.progress()).toEqual([]);
    expect(await visitorStore.receipts()).toEqual([]);
    expectStudentOnly();
  });

  it('VERIFICAR falha: messageFor no rodapé; repetir manda o mesmo attemptId', async () => {
    let failure: (() => Promise<Response>) | null = offline;
    override[`POST ${ATTEMPTS}`] = () => failure?.();
    await playAsStudent();
    await answerChoice();
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    expect(button(CHECK_LABEL)).toBeEnabled();
    failure = null;
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    const ids = ofRoute('POST', ATTEMPTS).map((request) => request.body!.attemptId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
    expect(screen.getByLabelText('+10 XP')).toBeTruthy();
  });

  it('refazer: a Atividade já gravada dá Feedback normal, sem selo, e o chip não muda', async () => {
    servedStage = { ...MOCK_STAGE, activities: [CHOICE, CHOICES[1]!] };
    await playAsStudent();
    await answerChoice();
    expect(await screen.findByLabelText('10 XP')).toBeTruthy();
    // Fecha e abre de novo: outra Tentativa (outro attemptId) na mesma Atividade.
    await fireEvent.press(button(CLOSE_LABEL));
    await fireEvent.press(await screen.findByTestId('dashboard-play'));
    expect(await screen.findByText('1 DE 2')).toBeTruthy();
    await answerChoice();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(screen.queryByTestId('xp-chip-light')).toBeNull();
    await act(async () => {});
    expect(screen.getByLabelText('10 XP')).toBeTruthy();
    const [first, second] = ofRoute('POST', ATTEMPTS);
    expect(first!.body!.attemptId).not.toBe(second!.body!.attemptId);
  });

  it('Erro e TENTAR DE NOVO: só a primeira Tentativa vale (7 XP)', async () => {
    await playAsStudent();
    await answerChoice(['B', 'B', 'B']);
    expect(await screen.findByText('Resultado: 2 de 3 itens · 67%')).toBeTruthy();
    expect(await screen.findByLabelText('7 XP')).toBeTruthy();
    await fireEvent.press(button(RETRY_SHEET));
    await fireEvent.press(screen.getByTestId(`choice-${CHOICE.items[0]!.itemKey}-A`));
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(screen.queryByTestId('xp-chip-light')).toBeNull();
    await act(async () => {});
    expect(screen.getByLabelText('7 XP')).toBeTruthy();
  });
});

describe('conclusão e "salvar falhou" do Aluno (2.4)', () => {
  beforeEach(() => {
    servedStage = { ...MOCK_STAGE, activities: [DIALOGUE, CHOICE] };
  });

  it('Diálogo: CONTINUAR mostra SALVANDO… e depois avança; nome e país ficam no aparelho', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    override[`POST ${COMPLETIONS}`] = async () => {
      await held;
      return undefined;
    };
    await playAsStudent();
    await fireEvent.changeText(await screen.findByTestId('dialogue-name'), 'Zoraide');
    await fireEvent.press(button(CONTINUE_LABEL));
    await fireEvent.press(await screen.findByTestId('dialogue-country-BR'));
    await fireEvent.press(button(CONTINUE_LABEL));
    await waitFor(() => expect(screen.queryByTestId('dialogue-ask-country')).toBeNull());
    await fireEvent.press(button(CONTINUE_LABEL));
    const saving = await screen.findByRole('button', { name: SAVING_LABEL });
    expect(saving).toBeDisabled();
    expect(screen.getByText('1 DE 2')).toBeTruthy();
    await act(async () => release());
    expect(await screen.findByText('2 DE 2')).toBeTruthy();
    const [completion] = ofRoute('POST', COMPLETIONS);
    expect(Object.keys(completion!.body!).sort()).toEqual(
      ['activityKey', 'attemptId', 'outcome', 'studyTimeMs', 'versionId'].sort(),
    );
    expect(completion!.body).toEqual(expect.objectContaining({ activityKey: DIALOGUE.activityKey, outcome: 'VIEWED' }));
    // O Diálogo grava nome e país no aparelho (o renderizador); o Progresso, não.
    expect(await visitorStore.variables()).toEqual(expect.objectContaining({ name: 'Zoraide', country: 'Brazil' }));
    expect(await visitorStore.progress()).toEqual([]);
    expect(await visitorStore.receipts()).toEqual([]);
    expectStudentOnly();
    // Nenhum texto do aluno sai do aparelho.
    expect(JSON.stringify(sent.map((request) => request.body))).not.toMatch(/Zoraide|Brazil/);
  });

  it('conclusão falha (500): TENTAR SALVAR DE NOVO com a linha vermelha, sem avançar; o toque reenvia o mesmo attemptId', async () => {
    let failure: (() => Response) | null = () => json({ code: 'INTERNAL_ERROR' }, 500);
    override[`POST ${COMPLETIONS}`] = () => failure?.();
    await withType('dialogue', finishing('viewed'), async () => {
      await playAsStudent();
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByRole('button', { name: SAVE_RETRY_LABEL })).toBeEnabled();
      expect(screen.getByText(SAVE_FAILED)).toBeTruthy();
      expect(screen.queryByText(messageFor('INTERNAL_ERROR'))).toBeNull();
      expect(screen.getByText('1 DE 2')).toBeTruthy();
      // 5xx não vai ao Sentry.
      expect(captureError).not.toHaveBeenCalled();
      failure = null;
      await fireEvent.press(button(SAVE_RETRY_LABEL));
      expect(await screen.findByText('2 DE 2')).toBeTruthy();
      expect(screen.queryByText(SAVE_FAILED)).toBeNull();
      const ids = ofRoute('POST', COMPLETIONS).map((request) => request.body!.attemptId);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(1);
    });
  });

  it('conclusão recusada (409 COMPLETION_NOT_ALLOWED): messageFor, o 4xx vai ao Sentry e a volta da rede não repete', async () => {
    await withType('dialogue', finishing('skipped'), async () => {
      await playAsStudent();
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText(messageFor('COMPLETION_NOT_ALLOWED'))).toBeTruthy();
      expect(screen.queryByText(SAVE_FAILED)).toBeNull();
      expect(screen.queryByRole('button', { name: SAVE_RETRY_LABEL })).toBeNull();
      expect(button(SKIP_LABEL)).toBeEnabled();
      expect(captureError).toHaveBeenCalledWith(
        expect.objectContaining({ status: 409, code: 'COMPLETION_NOT_ALLOWED' }),
      );
      await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
      await act(async () => global.__setNetwork({ isConnected: true, isInternetReachable: true }));
      await act(async () => {});
      expect(ofRoute('POST', COMPLETIONS)).toHaveLength(1);
      expect(captureError).toHaveBeenCalledTimes(1);
      expect(screen.getByText('1 DE 2')).toBeTruthy();
    });
  });

  it('429 não vai ao Sentry', async () => {
    override[`POST ${COMPLETIONS}`] = () => json({ code: 'TOO_MANY_REQUESTS' }, 429);
    await withType('dialogue', finishing('viewed'), async () => {
      await playAsStudent();
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText(SAVE_FAILED)).toBeTruthy();
      expect(captureError).not.toHaveBeenCalled();
    });
  });

  it('sem rede: SEM CONEXÃO com a linha vermelha; a rede volta e o player repete sozinho uma vez e avança', async () => {
    let failure: (() => Response | Promise<Response>) | null = offline;
    override[`POST ${COMPLETIONS}`] = () => failure?.();
    await withType('dialogue', finishing('viewed'), async () => {
      await playAsStudent();
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText(SAVE_FAILED)).toBeTruthy();
      await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
      expect(button(OFFLINE_LABEL)).toBeDisabled();
      expect(screen.getByText(SAVE_FAILED)).toBeTruthy();
      expect(ofRoute('POST', COMPLETIONS)).toHaveLength(1);

      // A primeira volta da rede repete uma vez; ainda falha, e nada mais é enviado.
      failure = () => json({ code: 'INTERNAL_ERROR' }, 500);
      await act(async () => global.__setNetwork({ isConnected: true, isInternetReachable: true }));
      await waitFor(() => expect(ofRoute('POST', COMPLETIONS)).toHaveLength(2));
      expect(await screen.findByRole('button', { name: SAVE_RETRY_LABEL })).toBeTruthy();
      await act(async () => {});
      expect(ofRoute('POST', COMPLETIONS)).toHaveLength(2);

      // A volta seguinte repete de novo, e agora salva.
      failure = null;
      await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
      await act(async () => global.__setNetwork({ isConnected: true, isInternetReachable: true }));
      expect(await screen.findByText('2 DE 2')).toBeTruthy();
      const ids = ofRoute('POST', COMPLETIONS).map((request) => request.body!.attemptId);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(1);
    });
  });

  it('Resposta Livre: ENVIAR falha com o mesmo estado; com sucesso, a resposta-modelo', async () => {
    servedStage = { ...MOCK_STAGE, activities: [FREE] };
    let failure: (() => Response) | null = () => json({ code: 'INTERNAL_ERROR' }, 500);
    override[`POST ${COMPLETIONS}`] = () => failure?.();
    await playAsStudent();
    await fireEvent.changeText(screen.getByLabelText(ANSWER_LABEL), "I'm Ana");
    await fireEvent.press(button(SEND_LABEL));
    expect(await screen.findByRole('button', { name: SAVE_RETRY_LABEL })).toBeTruthy();
    expect(screen.getByText(SAVE_FAILED)).toBeTruthy();
    failure = null;
    await fireEvent.press(button(SAVE_RETRY_LABEL));
    expect(await screen.findByText(YOU_WROTE)).toBeTruthy();
    expect(screen.getByTestId('free-model-answer')).toBeTruthy();
    expect(screen.queryByText(SAVE_FAILED)).toBeNull();
    // O texto do aluno nunca vai à API.
    expect(JSON.stringify(sent.map((request) => request.body))).not.toContain("I'm Ana");
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(await screen.findByTestId('stage-summary')).toBeTruthy();
    // A conclusão do ENVIAR basta: o CONTINUAR não conclui de novo.
    expect(ofRoute('POST', COMPLETIONS)).toHaveLength(2);
  });

  it('sessão vence (401 na conclusão): Entrar com o volta do player; depois, a mesma Atividade do início', async () => {
    await withType('dialogue', finishing('viewed'), async () => {
      await playAsStudent();
      expireMockSession();
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText(SESSION_ENDED)).toBeTruthy();
      // Desde a 2.5, o `volta` traz a Atividade na tela (a 1), e o Entrar volta a ela, do início.
      const first = servedStage.activities[0]!.activityKey;
      expect(screen).toHaveSearchParams({
        volta: `/player?unidade=unit-1&estagio=stage-1&atividade=${first}`,
        motivo: 'sessao',
      });
      expect(captureError).not.toHaveBeenCalled();
      await fireEvent.changeText(screen.getByLabelText(EMAIL_FIELD), ADULT.email);
      await fireEvent.changeText(screen.getByLabelText(PASSWORD_FIELD), ADULT.password);
      await fireEvent.press(button(SIGN_IN_LABEL));
      await waitFor(() => expect(screen).toHavePathname('/player'));
      expect(await screen.findByText('1 DE 2')).toBeTruthy();
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText('2 DE 2')).toBeTruthy();
      expectStudentOnly();
    });
  });
});

describe('resumo do Estágio do Aluno (2.4)', () => {
  it('fim do Estágio: os números vêm do Progresso do servidor, e CONTINUAR volta para /', async () => {
    servedStage = { ...MOCK_STAGE, activities: [DIALOGUE, CHOICE] };
    await withType('dialogue', finishing('viewed'), async () => {
      await playAsStudent();
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText('2 DE 2')).toBeTruthy();
      await answerChoice(['B', 'B', 'B']);
      expect(await screen.findByText('Resultado: 2 de 3 itens · 67%')).toBeTruthy();
      // Ver resposta, pela rota do Aluno, sem XP.
      await fireEvent.press(button(REVEAL_LABEL));
      expect(await screen.findByText(FEEDBACK_TITLES.review)).toBeTruthy();
      expect(ofRoute('POST', REVEAL)).toHaveLength(1);
      const reads = ofRoute('GET', PROGRESS).length;
      await fireEvent.press(button(CONTINUE_LABEL));
      expect(await screen.findByTestId('stage-summary')).toBeTruthy();
      // Relido depois da última gravação.
      expect(ofRoute('GET', PROGRESS).length).toBeGreaterThan(reads);
      expect(screen.getAllByLabelText('7 XP').length).toBeGreaterThan(0);
      expect(screen.getByLabelText(`${RESULT_STAT} médio: 67%`)).toBeTruthy();
      expect(screen.queryByTestId('stage-invite')).toBeNull();
      await fireEvent.press(button(SUMMARY_CONTINUE));
      expect(await screen.findByRole('header', { name: studentGreeting('Ana') })).toBeTruthy();
      expect(screen).toHavePathname('/');
      expectStudentOnly();
    });
  });

  it('a leitura do Progresso dá 500 no fim: o resumo abre e a falha vai ao Sentry', async () => {
    servedStage = { ...MOCK_STAGE, activities: [DIALOGUE] };
    await withType('dialogue', finishing('viewed'), async () => {
      await playAsStudent();
      await waitFor(() => expect(ofRoute('GET', PROGRESS).length).toBeGreaterThan(0));
      override[`GET ${PROGRESS}`] = () => json({ code: 'INTERNAL_ERROR' }, 500);
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByTestId('stage-summary')).toBeTruthy();
      await waitFor(() => expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ status: 500 })));
    });
  });

  it('a leitura do Progresso falha no fim: o resumo usa o cache mais a última', async () => {
    servedStage = { ...MOCK_STAGE, activities: [DIALOGUE, CHOICE] };
    await withType('dialogue', finishing('viewed'), async () => {
      await playAsStudent();
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText('2 DE 2')).toBeTruthy();
      // O cache tem só o Diálogo (0 XP); a leitura seguinte falha.
      await waitFor(() =>
        expect(client.getQueryData<{ results: unknown[] }>(PROGRESS_QUERY_KEY)?.results).toHaveLength(1),
      );
      override[`GET ${PROGRESS}`] = offline;
      // O resumo do servidor (2.7) também sem rede: cai no cálculo local.
      override[`GET /api/v1/students/me/units/unit-1/stages/stage-1/summary`] = offline;
      await answerChoice();
      expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
      await fireEvent.press(button(CONTINUE_LABEL));
      expect(await screen.findByTestId('stage-summary')).toBeTruthy();
      expect(screen.getAllByLabelText('10 XP').length).toBeGreaterThan(0);
      expect(screen.getByLabelText(`${RESULT_STAT} médio: 100%`)).toBeTruthy();
      // Sem rede não vai ao Sentry.
      expect(captureError).not.toHaveBeenCalled();
    });
  });
});

describe('tempo de estudo (2.4, os dois modos)', () => {
  beforeEach(() => {
    servedStage = { ...MOCK_STAGE, activities: [DIALOGUE] };
  });

  const MINUTE = 60_000;
  /** Anda o relógio falso do Jest (o `renderRouter` liga os relógios falsos). */
  const wait = (ms: number) => jest.setSystemTime(Date.now() + ms);
  /**
   * O tempo medido, com a folga do `findBy` (que anda os relógios falsos em
   * passos de 50 ms depois de a Atividade aparecer).
   */
  const expectAbout = (value: unknown, expected: number) => {
    expect(value).toBeGreaterThanOrEqual(expected);
    expect(value).toBeLessThan(expected + 1_000);
  };
  /** Um toque que começa na moldura (a captura do toque). */
  const touch = () => fireEvent(screen.getByTestId('player-frame'), 'startShouldSetResponderCapture');

  it('pausa: 6 min sem interação no meio não contam (Aluno)', async () => {
    await withType('dialogue', finishing('viewed'), async () => {
      await playAsStudent();
      await act(async () => {});
      wait(MINUTE);
      await touch();
      wait(6 * MINUTE);
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByTestId('stage-summary')).toBeTruthy();
      expectAbout(ofRoute('POST', COMPLETIONS)[0]!.body!.studyTimeMs, MINUTE);
    });
  });

  it('pausa: o mesmo relógio no Progresso do Visitante', async () => {
    await withType('dialogue', finishing('viewed'), async () => {
      await openApp('/player');
      await screen.findByText('1 DE 1');
      await act(async () => {});
      wait(2 * MINUTE);
      await touch();
      wait(7 * MINUTE);
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByTestId('stage-summary')).toBeTruthy();
      expectAbout(ofRoute('POST', '/api/v1/visitor/completions')[0]!.body!.studyTimeMs, 2 * MINUTE);
      const [entry] = await visitorStore.progress();
      expectAbout(entry!.studyTimeMs, 2 * MINUTE);
    });
  });

  it('digitar conta como interação: dois intervalos de 4 min com texto no meio contam 8 min', async () => {
    servedStage = { ...MOCK_STAGE, activities: [FREE] };
    await playAsStudent();
    await act(async () => {});
    wait(4 * MINUTE);
    await fireEvent.changeText(screen.getByLabelText(ANSWER_LABEL), "I'm Ana");
    wait(4 * MINUTE);
    await fireEvent.press(button(SEND_LABEL));
    expect(await screen.findByText(YOU_WROTE)).toBeTruthy();
    expectAbout(ofRoute('POST', COMPLETIONS)[0]!.body!.studyTimeMs, 8 * MINUTE);
  });

  it('digitar numa lacuna conta como interação: 4 min, texto, 4 min, VERIFICAR leva ~8 min', async () => {
    servedStage = { ...MOCK_STAGE, activities: [GAPS_TYPED] };
    await playAsStudent();
    await fireEvent.changeText(screen.getByTestId('gap-fill-gap-1'), 'Ana');
    await act(async () => {});
    wait(4 * MINUTE);
    await fireEvent.changeText(screen.getByTestId('gap-fill-gap-0'), "I'm");
    wait(4 * MINUTE);
    await fireEvent.press(button(CHECK_LABEL));
    await waitFor(() => expect(ofRoute('POST', ATTEMPTS)).toHaveLength(1));
    expectAbout(ofRoute('POST', ATTEMPTS)[0]!.body!.studyTimeMs, 8 * MINUTE);
  });

  it('segundo plano: os 2 min com o App fora da tela não contam', async () => {
    const handlers: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'change') handlers.push(handler as (state: AppStateStatus) => void);
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
    const appState = (state: AppStateStatus) => act(async () => handlers.forEach((handler) => handler(state)));
    await withType('dialogue', finishing('viewed'), async () => {
      await playAsStudent();
      await act(async () => {});
      wait(MINUTE);
      await appState('background');
      wait(2 * MINUTE);
      await appState('active');
      wait(30_000);
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByTestId('stage-summary')).toBeTruthy();
      expectAbout(ofRoute('POST', COMPLETIONS)[0]!.body!.studyTimeMs, MINUTE + 30_000);
    });
  });

  it('a Tentativa leva o tempo do relógio até o VERIFICAR', async () => {
    servedStage = { ...MOCK_STAGE, activities: [CHOICE] };
    await playAsStudent();
    await act(async () => {});
    wait(3 * MINUTE);
    await answerChoice();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expectAbout(ofRoute('POST', ATTEMPTS)[0]!.body!.studyTimeMs, 3 * MINUTE);
  });
});

describe('painel e sair (2.4, 2.5)', () => {
  it('fechar o player leva ao painel; sair apaga o cache inteiro, inclusive o Progresso', async () => {
    const student = await signedUp();
    await openApp('/player', student);
    expect(await screen.findByLabelText('0 XP')).toBeTruthy();
    expect(client.getQueryData(PROGRESS_QUERY_KEY)).toEqual({ xpTotal: 0, results: [] });
    await fireEvent.press(button(CLOSE_LABEL));
    expect(await screen.findByTestId('student-dashboard')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('student-home-sign-out'));
    expect(await screen.findByText(SIGN_OUT_BODY, { exact: false })).toBeTruthy();
    await fireEvent.press(button(SIGN_OUT_CONFIRM));
    expect(await screen.findByRole('button', { name: TRY_NOW })).toBeTruthy();
    expect(client.getQueryData(PROGRESS_QUERY_KEY)).toBeUndefined();
    expect(client.getQueryData(STUDENT_QUERY_KEY)).toBeNull();
  });
});
