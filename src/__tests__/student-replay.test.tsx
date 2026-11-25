// Matriz da 2.7 no App (resumo do Estágio do Aluno e refazer Atividades): uma linha por teste.
// O Aluno joga contra as rotas `/students/me/*` do mock; o resumo vem de
// `GET /students/me/units/{unitKey}/stages/{stageKey}/summary`.
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { AccessibilityInfo, Platform, Text } from 'react-native';

import { RootStack } from '../../app/_layout';
import Root from '../../app/(public)/index';
import Player, { SAVE_RETRY_LABEL } from '../../app/(student)/player';
import { mockResponse } from '../api/mocks/handlers';
import {
  MOCK_CREATED,
  MOCK_NO_CONTENT,
  mockRoutes,
  resetMockStudentRecords,
  resetMockStudents,
  resetMockVisitorRecords,
  seedMockStudentRecord,
} from '../api/mocks/routes';
import { AppProviders, createQueryClient } from '../AppProviders';
import { forgetCachedSession } from '../auth/session';
import { STUDENT_QUERY_KEY, type StudentProfile } from '../auth/student';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal/versions';
import { captureError } from '../observability/sentry';
import { registry, type ActivityProps, type ActivityRegistry } from '../player/registry';
import { RESULT_STAT, SUMMARY_CONTINUE } from '../player/StageSummary';
import { skippedLine } from '../player/stageStats';
import { CHECK_LABEL, CONTINUE_LABEL, RETRY_LABEL as RETRY_SHEET, REVEAL_LABEL } from '../player/useEvaluation';
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
const offline = () => Promise.reject(new TypeError('Network request failed'));

const ATTEMPTS = '/api/v1/students/me/attempts';
const REVEAL = '/api/v1/students/me/attempts/reveal';
const COMPLETIONS = '/api/v1/students/me/completions';
const PROGRESS = '/api/v1/students/me/progress';
const VISITOR_ATTEMPTS = '/api/v1/visitor/attempts';
const SUMMARY = '/api/v1/students/me/units/unit-1/stages/stage-1/summary';
const SUMMARY_ROUTE = '/api/v1/students/me/units/{unitKey}/stages/{stageKey}/summary';
const STAGE_PATH = '/api/v1/units/unit-1/stages/stage-1';

const MOCK_STAGE = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data;
type StageActivity = (typeof MOCK_STAGE.activities)[number];
/** A primeira Escolha do mock: três itens, certos com A, B e B (xp 10). */
const CHOICE = MOCK_STAGE.activities.find(
  (activity): activity is Extract<StageActivity, { type: 'choice' }> => activity.type === 'choice',
)!;
const DIALOGUE = MOCK_STAGE.activities.find((activity) => activity.type === 'dialogue')!;

let servedStage: typeof MOCK_STAGE = { ...MOCK_STAGE, activities: [DIALOGUE, CHOICE] };
let override: Partial<Record<string, () => Response | Promise<Response | undefined> | undefined>> = {};

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
    const forced = await override[`${method} ${path}`]?.();
    if (forced) return forced;
    if (path === '/api/v1/meta') return json({ data: { minAppVersion: '0.0.0', activityTypes: [] } });
    if (path === STAGE_PATH) return json({ data: servedStage });
    if (path === '/api/v1/units/unit-1') return json(mockRoutes['/api/v1/units/{unitKey}'].get(new Request(url)));
    const routes = mockRoutes as unknown as Record<string, Record<string, (request: Request) => unknown>>;
    const route = /\/students\/me\/units\/[^/]+\/stages\/[^/]+\/summary$/.test(path) ? SUMMARY_ROUTE : path;
    const resolve = routes[route]?.[method.toLowerCase()];
    if (!resolve) return json({ code: 'NOT_FOUND' }, 404);
    const key = `${method} ${route}`;
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

async function signedUp(): Promise<StudentProfile> {
  const { data } = await mockRoutes['/api/v1/auth/signup'].post(
    new Request('http://mock/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'X-Fluveny-Client': 'android' },
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

async function openPlayer(student?: StudentProfile) {
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
      '(student)/player': Player,
    },
    { initialUrl: '/player' },
  );
  await screen.findByText(`1 OF ${servedStage.activities.length}`);
}

/**
 * As Atividades do Estágio 1 do mock fora as servidas já concluídas pelo Aluno
 * (o resumo do mock exige o Estágio inteiro): vistas, sem XP, 1 min cada.
 */
function seedOthers(skipped = 0) {
  const served = new Set(servedStage.activities.map((activity) => activity.activityKey));
  for (const activity of MOCK_STAGE.activities) {
    if (served.has(activity.activityKey)) continue;
    seedMockStudentRecord(ADULT.email, {
      activityKey: activity.activityKey,
      outcome: skipped-- > 0 ? 'SKIPPED' : 'VIEWED',
      xpAwarded: 0,
      studyTimeMs: 60_000,
    });
  }
}

const button = (name: string) => screen.getByRole('button', { name });

async function answerChoice(letters: readonly string[] = ['A', 'B', 'B']) {
  for (const [item, letter] of letters.entries()) {
    await fireEvent.press(screen.getByTestId(`choice-${CHOICE.items[item]!.itemKey}-${letter}`));
  }
  await fireEvent.press(button(CHECK_LABEL));
}

/** O Diálogo de teste: CONTINUAR conclui com `viewed` pela rota `completions`. */
const VIEW_LABEL = 'VER';
function ViewedDialogue({ activity, setFooter, advance }: ActivityProps) {
  useEffect(() => {
    setFooter({ label: VIEW_LABEL, onPress: () => void advance({ outcome: 'viewed', xp: 0 }) });
  }, [setFooter, advance]);
  return <Text>{activity.activityKey}</Text>;
}

async function withDialogue(run: () => Promise<void>) {
  const types = registry as ActivityRegistry;
  const previous = types.dialogue;
  types.dialogue = ViewedDialogue;
  try {
    await run();
  } finally {
    types.dialogue = previous!;
  }
}

/** Joga o Estágio servido (Diálogo e Escolha) até o resumo. */
async function playStage(letters: readonly string[] = ['A', 'B', 'B']) {
  await fireEvent.press(button(VIEW_LABEL));
  expect(await screen.findByText('2 OF 2')).toBeTruthy();
  await answerChoice(letters);
  const right = letters.join('') === 'ABB';
  expect(await screen.findByText(right ? FEEDBACK_TITLES.correct : FEEDBACK_TITLES.wrong)).toBeTruthy();
  if (!right) {
    await fireEvent.press(button(REVEAL_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.review)).toBeTruthy();
  }
  await fireEvent.press(button(CONTINUE_LABEL));
  expect(await screen.findByTestId('stage-summary')).toBeTruthy();
}

/** Os números do resumo na tela. */
function summaryNumbers() {
  return {
    result: screen.queryByLabelText(new RegExp(`^Average ${RESULT_STAT.toLowerCase()}`))?.props.accessibilityLabel,
    minutes: screen.queryByLabelText(/^\d+ minutos?$/)?.props.accessibilityLabel,
  };
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
  servedStage = { ...MOCK_STAGE, activities: [DIALOGUE, CHOICE] };
  (captureError as jest.Mock).mockClear();
  apiResponds();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('resumo do Estágio do Aluno pela rota (2.7)', () => {
  it('fim do Estágio: GET summary; XP, média e minutos da rota; primeira vez sem replay', async () => {
    const student = await signedUp();
    seedOthers();
    await withDialogue(async () => {
      await openPlayer(student);
      await playStage(['B', 'B', 'B']);
    });
    expect(ofRoute('GET', SUMMARY)).toHaveLength(1);
    // 7 XP da Escolha (67%) e a média só dela, da rota (o local também teria 67%; o GET acima prova a origem).
    expect(screen.getAllByLabelText('7 XP').length).toBeGreaterThan(0);
    expect(screen.getByLabelText(`Average ${RESULT_STAT.toLowerCase()}: 67%`)).toBeTruthy();
    for (const request of [...ofRoute('POST', ATTEMPTS), ...ofRoute('POST', COMPLETIONS)]) {
      expect(request.body).not.toHaveProperty('replay');
    }
    expect(captureError).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: SUMMARY_CONTINUE })).toBeTruthy();
  });

  it('sem avaliadas: a resposta sem averageResultPct fica sem média (o cartão some, como na 1.20)', async () => {
    servedStage = { ...MOCK_STAGE, activities: [DIALOGUE] };
    const student = await signedUp();
    seedOthers();
    await withDialogue(async () => {
      await openPlayer(student);
      await fireEvent.press(button(VIEW_LABEL));
      expect(await screen.findByTestId('stage-summary')).toBeTruthy();
    });
    expect(ofRoute('GET', SUMMARY)).toHaveLength(1);
    expect(screen.queryByLabelText(new RegExp(`^Average ${RESULT_STAT.toLowerCase()}`))).toBeNull();
    // Os minutos vêm do studyTimeMs da rota (as semeadas somam vários minutos).
    expect(screen.getByLabelText(/^\d+ minutes$/)).toBeTruthy();
  });

  it.each([
    ['409', () => json({ code: 'STAGE_NOT_COMPLETED' }, 409), true],
    ['404', () => json({ code: 'NOT_FOUND' }, 404), true],
    ['500', () => json({ code: 'INTERNAL_ERROR' }, 500), true],
    ['sem rede', offline, false],
  ])('a rota responde %s: o resumo sai do cálculo local', async (_name, answer, reported) => {
    const student = await signedUp();
    override[`GET ${SUMMARY}`] = answer;
    await withDialogue(async () => {
      await openPlayer(student);
      await playStage();
    });
    // O local: só o Progresso da Unidade sobre as Atividades servidas (10 XP, 100%).
    expect(screen.getAllByLabelText('10 XP').length).toBeGreaterThan(0);
    expect(screen.getByLabelText(`Average ${RESULT_STAT.toLowerCase()}: 100%`)).toBeTruthy();
    if (reported) expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ status: expect.any(Number) }));
    else expect(captureError).not.toHaveBeenCalled();
  });
});

describe('puladas no resumo do Aluno (2.7)', () => {
  it('a rota traz skippedCount > 0: a linha das puladas aparece', async () => {
    const student = await signedUp();
    seedOthers(1);
    await withDialogue(async () => {
      await openPlayer(student);
      await playStage();
    });
    expect(ofRoute('GET', SUMMARY)).toHaveLength(1);
    expect(screen.getByText(skippedLine(1)!)).toBeTruthy();
  });
});

/** A Escolha servida sozinha, com registro do Aluno (o refazer). */
function recordedChoice() {
  servedStage = { ...MOCK_STAGE, activities: [CHOICE] };
  seedMockStudentRecord(ADULT.email, {
    activityKey: CHOICE.activityKey,
    outcome: 'GRADED',
    resultPct: 100,
    xpAwarded: 10,
    studyTimeMs: 1000,
  });
}

describe('a marca do refazer e o Progresso (2.7)', () => {
  it('o Progresso chega depois da abertura e antes da resposta: replay', async () => {
    const student = await signedUp();
    recordedChoice();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    override[`GET ${PROGRESS}`] = async () => {
      await held;
      return undefined;
    };
    await openPlayer(student);
    expect(screen.queryByTestId('xp-chip')).toBeNull();
    await act(async () => release());
    expect(await screen.findByLabelText('10 XP')).toBeTruthy();
    await answerChoice();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(ofRoute('POST', ATTEMPTS).map((request) => request.body?.replay)).toEqual([true]);
  });

  it('a leitura do Progresso falha, sem cache: vai sem replay', async () => {
    const student = await signedUp();
    recordedChoice();
    override[`GET ${PROGRESS}`] = () => json({ code: 'INTERNAL_ERROR' }, 500);
    await openPlayer(student);
    await waitFor(() => expect(ofRoute('GET', PROGRESS).length).toBeGreaterThan(0));
    await answerChoice();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(ofRoute('POST', ATTEMPTS)[0]!.body).not.toHaveProperty('replay');
  });

  it('reenvio da conclusão: falha por rede e repete com o mesmo attemptId e replay', async () => {
    servedStage = { ...MOCK_STAGE, activities: [DIALOGUE, CHOICE] };
    const student = await signedUp();
    seedMockStudentRecord(ADULT.email, {
      activityKey: DIALOGUE.activityKey,
      outcome: 'VIEWED',
      xpAwarded: 0,
      studyTimeMs: 1000,
    });
    await withDialogue(async () => {
      await openPlayer(student);
      await waitFor(() => expect(ofRoute('GET', PROGRESS).length).toBeGreaterThan(0));
      expect(await screen.findByLabelText('0 XP')).toBeTruthy();
      override[`POST ${COMPLETIONS}`] = offline;
      await fireEvent.press(button(VIEW_LABEL));
      expect(await screen.findByRole('button', { name: SAVE_RETRY_LABEL })).toBeTruthy();
      override = {};
      await fireEvent.press(button(SAVE_RETRY_LABEL));
      expect(await screen.findByText('2 OF 2')).toBeTruthy();
    });
    const [failed, resent] = ofRoute('POST', COMPLETIONS);
    expect(resent!.body?.attemptId).toBe(failed!.body?.attemptId);
    expect([failed!.body?.replay, resent!.body?.replay]).toEqual([true, true]);
  });
});

describe('refazer Atividades (2.7)', () => {
  /** Conclui o Estágio uma vez e o abre de novo, para refazer. */
  async function replaying() {
    const student = await signedUp();
    seedOthers();
    await withDialogue(async () => {
      await openPlayer(student);
      await playStage(['B', 'B', 'B']);
    });
    const first = summaryNumbers();
    sent.length = 0;
    return { student, first };
  }

  it('refazer Escolha e expositiva: replay na primeira resposta; Feedback normal; sem "+XP"; chip igual; resumo igual', async () => {
    const { student, first } = await replaying();
    await withDialogue(async () => {
      await openPlayer(student);
      expect(await screen.findByLabelText('7 XP')).toBeTruthy();
      await fireEvent.press(button(VIEW_LABEL));
      expect(await screen.findByText('2 OF 2')).toBeTruthy();
      expect(ofRoute('POST', COMPLETIONS).map((request) => request.body?.replay)).toEqual([true]);
      await answerChoice();
      expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
      expect(screen.queryByLabelText('+10 XP')).toBeNull();
      expect(screen.getByLabelText('7 XP')).toBeTruthy();
      expect(ofRoute('POST', ATTEMPTS).map((request) => request.body?.replay)).toEqual([true]);
      await fireEvent.press(button(CONTINUE_LABEL));
      expect(await screen.findByTestId('stage-summary')).toBeTruthy();
    });
    expect(summaryNumbers()).toEqual(first);
    expect(screen.getAllByLabelText('7 XP').length).toBeGreaterThan(0);
    expect(ofRoute('GET', SUMMARY)).toHaveLength(1);
  });

  it('Tentar de novo: a segunda resposta vai sem replay; o reveal, nunca', async () => {
    servedStage = { ...MOCK_STAGE, activities: [CHOICE] };
    const student = await signedUp();
    seedMockStudentRecord(ADULT.email, {
      activityKey: CHOICE.activityKey,
      outcome: 'GRADED',
      resultPct: 67,
      xpAwarded: 7,
      studyTimeMs: 1000,
    });
    await openPlayer(student);
    await answerChoice(['B', 'B', 'B']);
    expect(await screen.findByText(FEEDBACK_TITLES.wrong)).toBeTruthy();
    await fireEvent.press(button(RETRY_SHEET));
    await answerChoice(['B', 'A', 'B']);
    expect(await screen.findByText(FEEDBACK_TITLES.wrong)).toBeTruthy();
    expect(ofRoute('POST', ATTEMPTS).map((request) => request.body?.replay)).toEqual([true, undefined]);
    // Ver resposta: pela rota do reveal, sem replay.
    await fireEvent.press(button(REVEAL_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.review)).toBeTruthy();
    expect(ofRoute('POST', REVEAL)).toHaveLength(1);
    expect(ofRoute('POST', REVEAL)[0]!.body).not.toHaveProperty('replay');
  });

  it('reenvio: a primeira resposta falha por rede e é repetida com o mesmo attemptId e replay', async () => {
    servedStage = { ...MOCK_STAGE, activities: [CHOICE] };
    const student = await signedUp();
    seedMockStudentRecord(ADULT.email, {
      activityKey: CHOICE.activityKey,
      outcome: 'GRADED',
      resultPct: 100,
      xpAwarded: 10,
      studyTimeMs: 1000,
    });
    await openPlayer(student);
    await waitFor(() => expect(screen.getByLabelText('10 XP')).toBeTruthy());
    override[`POST ${ATTEMPTS}`] = offline;
    await answerChoice();
    await waitFor(() => expect(ofRoute('POST', ATTEMPTS)).toHaveLength(1));
    override = {};
    await waitFor(() => expect(screen.getByRole('button', { name: CHECK_LABEL })).toBeEnabled());
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    const [failed, resent] = ofRoute('POST', ATTEMPTS);
    expect(resent!.body?.attemptId).toBe(failed!.body?.attemptId);
    expect([failed!.body?.replay, resent!.body?.replay]).toEqual([true, true]);
  });

  it('Visitante: sem replay e resumo local', async () => {
    servedStage = { ...MOCK_STAGE, activities: [CHOICE] };
    await openPlayer();
    await answerChoice();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(await screen.findByTestId('stage-summary')).toBeTruthy();
    expect(ofRoute('POST', VISITOR_ATTEMPTS)[0]!.body).not.toHaveProperty('replay');
    expect(ofRoute('GET', SUMMARY)).toHaveLength(0);
  });
});
