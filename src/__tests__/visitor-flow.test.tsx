// Matriz da 1.10 (boas-vindas e player do Visitante): uma linha por teste.
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { AccessibilityInfo, BackHandler, StyleSheet, Text } from 'react-native';

import { RootStack } from '../../app/_layout';
import ComingSoon, { SOON_BACK, SOON_BODY, SOON_TITLE } from '../../app/(public)/em-breve';
import Welcome, {
  SIGN_IN,
  SIGN_UP,
  TRY_NOW,
  WELCOME_BODY,
  WELCOME_GOAL,
  WELCOME_TITLE,
} from '../../app/(public)/index';
import StageTwoInvite, { REDO_LABEL } from '../../app/(student)/convite';
import Player, { RETRY_LABEL } from '../../app/(student)/player';
import UpdateRequired from '../../app/atualize';
import { messageFor, NETWORK_ERROR } from '../api/errors';
import { mockResponse } from '../api/mocks/handlers';
import { mockRoutes, resetMockVisitorRecords } from '../api/mocks/routes';
import { AppProviders, createQueryClient } from '../AppProviders';
import * as sentry from '../observability/sentry';
import { CONTINUE_LABEL, PendingActivity, PENDING_TITLE } from '../player/PendingActivity';
import { NEXT_BLOCK_LABEL } from '../player/types/CardsActivity';
import { ChoiceActivity } from '../player/types/ChoiceActivity';
import { NAME_LABEL } from '../player/types/DialogueActivity';
import { ANSWER_LABEL, EXTRA_HELP_LABEL, SEND_LABEL, YOU_WROTE } from '../player/types/FreeActivity';
import { GRAMMAR_TABS, NEXT_LABEL as GRAMMAR_NEXT } from '../player/types/GrammarActivity';
import { PRIVACY_OK_LABEL, SKIP_LABEL as SPEECH_SKIP } from '../player/types/SpeechActivity';
import { INVITE_BODY, INVITE_SIGN_UP, INVITE_TITLE } from '../player/StageInvite';
import { MINUTES_STAT, RESULT_STAT, stageDoneLabel, stageDoneTitle, XP_STAT } from '../player/StageSummary';
import { ApiError } from '../api/client';
import { PENDING, registry, type ActivityProps, type ActivityRegistry } from '../player/registry';
import { OFFLINE_TEXT } from '../network/text';
import { CLOSE_LABEL, OFFLINE_LABEL } from '../player/PlayerFrame';
import { CHECK_LABEL, CONTINUE_LABEL as CONTINUE_SHEET, RETRY_LABEL as RETRY_SHEET } from '../player/useEvaluation';
import { EXPRESSION_CLOSE_LABEL, FEEDBACK_TITLES } from '../ui';
import { visitorStore } from '../visitor/store';
import { clearVisitorCache } from '../visitor/useVisitor';

jest.mock('../observability/sentry', () => {
  const actual = jest.requireActual('../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Os corpos mandados à rota `completions`. */
const completions: Record<string, unknown>[] = [];
/** Os corpos mandados à rota das Tentativas. */
const attempts: Record<string, unknown>[] = [];
/** Os corpos mandados à rota dos eventos do Visitante (1.20). */
const events: Record<string, unknown>[] = [];

/** O Estágio do mock, que abre com o Diálogo (1.13). */
const MOCK_STAGE = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data;
type StageActivity = (typeof MOCK_STAGE.activities)[number];
type ChoiceView = Extract<StageActivity, { type: 'choice' }>;
type CardsView = Extract<StageActivity, { type: 'cards' }>;
type MatchView = Extract<StageActivity, { type: 'match' }>;
/** Só as Escolhas do mock: os testes da 1.10 a 1.12 percorrem o Estágio sem o Diálogo. */
const STAGE = {
  ...MOCK_STAGE,
  activities: MOCK_STAGE.activities.filter((activity): activity is ChoiceView => activity.type === 'choice'),
};
const TOTAL = STAGE.activities.length;
/** Quantas Atividades o Estágio do mock tem, com o Diálogo. */
const FULL = MOCK_STAGE.activities.length;
/** O Estágio que a API responde por padrão (cada `describe` escolhe). */
let servedStage: typeof MOCK_STAGE = STAGE;

/** A API respondendo com os mocks; `fail` troca a resposta de uma rota. */
function apiResponds(
  fail: Partial<
    Record<'unit' | 'stage' | 'completion' | 'event', () => Response | Promise<Response | undefined> | undefined>
  > = {},
  minAppVersion = '0.0.0',
) {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/v1/visitor/attempts')) {
      attempts.push(JSON.parse(String(init?.body)));
      return mockResponse(mockRoutes['/api/v1/visitor/attempts'].post, new Request(url, init));
    }
    if (url.endsWith('/api/v1/visitor/attempts/reveal')) {
      return mockResponse(mockRoutes['/api/v1/visitor/attempts/reveal'].post, new Request(url, init));
    }
    if (url.endsWith('/api/v1/visitor/completions')) {
      completions.push(JSON.parse(String(init?.body)));
      const failure = await fail.completion?.();
      if (failure) return failure;
      return mockResponse(mockRoutes['/api/v1/visitor/completions'].post, new Request(url, init));
    }
    if (url.endsWith('/api/v1/visitor/events')) {
      events.push(JSON.parse(String(init?.body)));
      const failure = await fail.event?.();
      if (failure) return failure;
      return mockResponse(mockRoutes['/api/v1/visitor/events'].post, new Request(url, init));
    }
    if (url.endsWith('/api/v1/meta')) return json({ data: { minAppVersion, activityTypes: [] } });
    if (url.includes('/stages/')) {
      return fail.stage ? (fail.stage() as Response | Promise<Response>) : json({ data: servedStage });
    }
    if (url.endsWith('/api/v1/units/unit-1')) {
      return fail.unit
        ? (fail.unit() as Response | Promise<Response>)
        : json(mockRoutes['/api/v1/units/{unitKey}'].get(new Request(url)));
    }
    return json({ code: 'NOT_FOUND' }, 404);
  }) as jest.Mock;
}

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
      '(public)/index': Welcome,
      '(public)/em-breve': ComingSoon,
      '(student)/player': Player,
      '(student)/convite': StageTwoInvite,
      atualize: UpdateRequired,
    },
    { initialUrl },
  );
}

const button = (name: string) => screen.getByRole('button', { name });

async function startTrying(total = TOTAL) {
  await openApp();
  await fireEvent.press(await screen.findByRole('button', { name: TRY_NOW }));
  await screen.findByText(`1 DE ${total}`);
}

async function pressContinue() {
  await fireEvent.press(button(CONTINUE_LABEL));
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  global.__resetSqlite();
  clearVisitorCache();
  global.__resetNetwork();
  resetMockVisitorRecords();
  completions.length = 0;
  attempts.length = 0;
  events.length = 0;
  servedStage = STAGE;
  (sentry.captureError as jest.Mock).mockClear();
  apiResponds();
});

const UNIT = mockRoutes['/api/v1/units/{unitKey}'].get(new Request('http://mock')).data;

/** Tipo de teste que conclui a Atividade com 10 XP no CONTINUAR. */
const DONE_LABEL = 'CONCLUIR';
function CompletingActivity({ activity, setFooter, advance }: ActivityProps) {
  useEffect(() => {
    setFooter({ label: DONE_LABEL, onPress: () => advance({ outcome: 'completed', xp: 10 }) });
  }, [setFooter, advance]);
  return <Text>{activity.activityKey}</Text>;
}

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

/** Troca o componente do `choice` durante um teste. */
const withChoice = (component: (props: ActivityProps) => React.ReactNode, run: () => Promise<void>) =>
  withType('choice', component, run);

describe('boas-vindas e player do Visitante (1.10)', () => {
  // Os testes da 1.10 navegam pelo cartão "em preparação": a Escolha volta a ser PENDING aqui.
  const realChoice = registry.choice;
  beforeEach(() => {
    (registry as ActivityRegistry).choice = PENDING;
  });
  afterEach(() => {
    (registry as ActivityRegistry).choice = realChoice;
  });

  it('boas-vindas: o leitor lê o título, o objetivo e os três botões, sem barra de abas', async () => {
    await openApp();
    expect(await screen.findByRole('header', { name: WELCOME_TITLE })).toBeTruthy();
    expect(screen.getByText(WELCOME_BODY)).toBeTruthy();
    expect(screen.getByText(WELCOME_GOAL)).toBeTruthy();
    expect(button(TRY_NOW)).toBeTruthy();
    expect(button(SIGN_UP)).toBeTruthy();
    expect(button(SIGN_IN)).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByTestId('alex-wave')).toBeTruthy();
    expect(screen).toHavePathname('/');
  });

  it('experimentar pela primeira vez: grava o deviceId e abre o player em 1 de m', async () => {
    await startTrying();
    expect(screen).toHavePathname('/player');
    expect(screen.getByText(`ESTÁGIO 1 · ${STAGE.title}`)).toBeTruthy();
    expect(screen.getByLabelText('0 XP')).toBeTruthy();
    expect(button(CLOSE_LABEL)).toBeTruthy();
    const id = await visitorStore.deviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('falha ao carregar: mostra messageFor(code) e TENTAR DE NOVO, que recarrega', async () => {
    let failing = true;
    apiResponds({
      stage: () => (failing ? json({ code: 'INTERNAL_ERROR' }, 500) : json({ data: STAGE })),
    });
    await openApp();
    await fireEvent.press(await screen.findByRole('button', { name: TRY_NOW }));
    expect(await screen.findByText(messageFor('INTERNAL_ERROR'))).toBeTruthy();
    failing = false;
    await fireEvent.press(button(RETRY_LABEL));
    expect(await screen.findByText(`1 DE ${TOTAL}`)).toBeTruthy();
  });

  it('Tipo PENDING: cartão "Atividade em preparação" e CONTINUAR avança sem gravar Progresso', async () => {
    await startTrying();
    expect(screen.getByText(PENDING_TITLE)).toBeTruthy();
    expect(screen.getByText(STAGE.activities[0]!.title as string)).toBeTruthy();
    await pressContinue();
    expect(await screen.findByText(`2 DE ${TOTAL}`)).toBeTruthy();
    expect(screen.getByText(STAGE.activities[1]!.title as string)).toBeTruthy();
    expect(await visitorStore.progress()).toEqual([]);
    expect(screen.getByLabelText('0 XP')).toBeTruthy();
    // O cartão em preparação não registra nada no servidor.
    expect(completions).toEqual([]);
    expect(await visitorStore.receipts()).toEqual([]);
  });

  it('renderizador: com o nome salvo, o {name} do título aparece resolvido e em ouro (pronome they)', async () => {
    await visitorStore.setVariable('name', 'Ana');
    await startTrying();
    await pressContinue();
    await screen.findByText(`2 DE ${TOTAL}`);
    const title = STAGE.activities[1]!.title as string;
    expect(title).toContain('{name}');
    expect(screen.getByText(title.replace('{name}', 'Ana'))).toBeTruthy();
    const variable = screen.getByTestId('student-var');
    expect(variable.props.children).toBe('Ana');
  });

  /** O Estágio do mock com outro título, ou com a 1ª Atividade com outro título. */
  function stageWith(change: { title?: unknown; firstActivityTitle?: unknown }) {
    const [first, ...rest] = STAGE.activities;
    apiResponds({
      stage: () =>
        json({
          data: {
            ...STAGE,
            ...(change.title === undefined ? {} : { title: change.title }),
            activities:
              change.firstActivityTitle === undefined
                ? STAGE.activities
                : [{ ...first!, title: change.firstActivityTitle }, ...rest],
          },
        }),
    });
  }

  it('renderizador: pronome salvo she escolhe a variante she', async () => {
    await visitorStore.setVariable('pronoun', 'she');
    stageWith({ firstActivityTitle: { he: 'He is here.', she: 'She is here.', they: 'They are here.' } });
    await startTrying();
    expect(await screen.findByText('She is here.')).toBeTruthy();
    expect(screen.queryByText('They are here.')).toBeNull();
  });

  it('renderizador: o título do Estágio sai resolvido com o nome salvo', async () => {
    await visitorStore.setVariable('name', 'Ana');
    stageWith({ title: 'Meet {name}' });
    await startTrying();
    expect(await screen.findByText('ESTÁGIO 1 · Meet Ana')).toBeTruthy();
  });

  it('renderizador: título do Estágio sem a variante they vai ao Sentry e fica vazio', async () => {
    stageWith({ title: { he: 'He', she: 'She' } });
    await startTrying();
    expect(await screen.findByText('ESTÁGIO 1')).toBeTruthy();
    expect(sentry.captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('variante they') }),
    );
  });

  it('Atividade concluída: grava o Progresso com a activityKey e o chip mostra o XP', async () => {
    await withChoice(CompletingActivity, async () => {
      await startTrying();
      await fireEvent.press(button(DONE_LABEL));
      expect(await screen.findByText(`2 DE ${TOTAL}`)).toBeTruthy();
      expect(await visitorStore.progress()).toEqual([
        {
          activityKey: STAGE.activities[0]!.activityKey,
          outcome: 'completed',
          xp: 10,
          studyTimeMs: expect.any(Number),
        },
      ]);
      expect(await screen.findByLabelText('10 XP')).toBeTruthy();
    });
  });

  it('gravar o Progresso falha: o erro vai ao Sentry e o player avança mesmo assim', async () => {
    const failure = new Error('disco cheio');
    const record = jest.spyOn(visitorStore, 'recordProgress').mockRejectedValueOnce(failure);
    try {
      await withChoice(CompletingActivity, async () => {
        await startTrying();
        await fireEvent.press(button(DONE_LABEL));
        expect(await screen.findByText(`2 DE ${TOTAL}`)).toBeTruthy();
        expect(sentry.captureError).toHaveBeenCalledWith(failure);
      });
    } finally {
      record.mockRestore();
    }
  });

  it('falha ao carregar a Unidade: messageFor(code) e TENTAR DE NOVO, que recarrega', async () => {
    let failing = true;
    apiResponds({
      unit: () => (failing ? json({ code: 'INTERNAL_ERROR' }, 500) : json({ data: UNIT })),
    });
    await openApp();
    await fireEvent.press(await screen.findByRole('button', { name: TRY_NOW }));
    expect(await screen.findByText(messageFor('INTERNAL_ERROR'))).toBeTruthy();
    failing = false;
    await fireEvent.press(button(RETRY_LABEL));
    expect(await screen.findByText(`1 DE ${TOTAL}`)).toBeTruthy();
  });

  it('Unidade sem Estágios: mostra messageFor(NOT_FOUND)', async () => {
    apiResponds({ unit: () => json({ data: { ...UNIT, stages: [] } }) });
    await openApp();
    await fireEvent.press(await screen.findByRole('button', { name: TRY_NOW }));
    expect(await screen.findByText(messageFor('NOT_FOUND'))).toBeTruthy();
    expect(button(RETRY_LABEL)).toBeTruthy();
  });

  it('Estágio sem Atividades: mostra messageFor(NOT_FOUND)', async () => {
    apiResponds({ stage: () => json({ data: { ...STAGE, activities: [] } }) });
    await openApp();
    await fireEvent.press(await screen.findByRole('button', { name: TRY_NOW }));
    expect(await screen.findByText(messageFor('NOT_FOUND'))).toBeTruthy();
  });

  it('sem rede na boas-vindas: a faixa aparece e some ao reconectar', async () => {
    await openApp();
    await screen.findByText(WELCOME_TITLE);
    await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
    expect(screen.getByText(OFFLINE_TEXT)).toBeTruthy();
    await act(async () => global.__setNetwork({ isConnected: true, isInternetReachable: true }));
    expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
  });

  it('última Atividade: CONTINUAR em m de m abre o resumo do Estágio (1.20), e o ✕ volta à boas-vindas', async () => {
    await startTrying();
    for (let position = 1; position < TOTAL; position += 1) await pressContinue();
    expect(await screen.findByText(`${TOTAL} DE ${TOTAL}`)).toBeTruthy();
    await pressContinue();
    expect(await screen.findByTestId('stage-summary')).toBeTruthy();
    expect(screen).toHavePathname('/player');
    await fireEvent.press(button(CLOSE_LABEL));
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen).toHavePathname('/');
  });

  it('✕ no meio da Atividade 3: volta à boas-vindas sem confirmação, e a 3 não é registrada', async () => {
    await startTrying();
    await pressContinue();
    await pressContinue();
    expect(await screen.findByText(`3 DE ${TOTAL}`)).toBeTruthy();
    await fireEvent.press(button(CLOSE_LABEL));
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen).toHavePathname('/');
    expect(await visitorStore.progress()).toEqual([]);

    // Voltar: a Atividade recomeça do início do Estágio.
    await fireEvent.press(button(TRY_NOW));
    expect(await screen.findByText(`1 DE ${TOTAL}`)).toBeTruthy();
  });

  it('voltar do Android no player: sai para a boas-vindas', async () => {
    const handlers: ((event: never) => boolean | null | undefined)[] = [];
    const listen = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'hardwareBackPress') handlers.push(handler);
      return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
    });
    try {
      await startTrying();
      let handled: boolean | null | undefined = false;
      await act(async () => {
        handled = handlers.at(-1)?.(undefined as never);
      });
      expect(handled).toBe(true);
      expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    } finally {
      listen.mockRestore();
    }
  });

  it('sem rede no player: faixa no topo e "SEM CONEXÃO" desabilitado; some ao reconectar', async () => {
    await startTrying();
    await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
    expect(screen.getByText(OFFLINE_TEXT)).toBeTruthy();
    expect(OFFLINE_TEXT).toBe(messageFor(NETWORK_ERROR));
    expect(button(OFFLINE_LABEL)).toBeDisabled();
    expect(screen.queryByRole('button', { name: CONTINUE_LABEL })).toBeNull();
    // A tela fica.
    expect(screen.getByText(`1 DE ${TOTAL}`)).toBeTruthy();

    await act(async () => global.__setNetwork({ isConnected: true, isInternetReachable: true }));
    expect(screen.queryByText(OFFLINE_TEXT)).toBeNull();
    expect(button(CONTINUE_LABEL)).toBeEnabled();
  });

  it('CRIAR CONTA e ENTRAR levam a "Em breve", e VOLTAR retorna', async () => {
    await openApp();
    await fireEvent.press(await screen.findByRole('button', { name: SIGN_UP }));
    expect(await screen.findByRole('header', { name: SOON_TITLE })).toBeTruthy();
    expect(screen.getByText(SOON_BODY)).toBeTruthy();
    expect(screen).toHavePathname('/em-breve');
    await fireEvent.press(button(SOON_BACK));
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    await fireEvent.press(button(SIGN_IN));
    expect(await screen.findByText(SOON_TITLE)).toBeTruthy();
  });

  it('versão antiga: o player fica atrás do guard', async () => {
    apiResponds({}, '99.0.0');
    await openApp('/player');
    await waitFor(() => expect(screen).toHavePathname('/atualize'));
    expect(screen.queryByText(PENDING_TITLE)).toBeNull();
  });
});

describe('Escolha real no player (1.11)', () => {
  const choose = async (item: number, letter: string) =>
    fireEvent.press(screen.getByTestId(`choice-${STAGE.activities[0]!.items[item]!.itemKey}-${letter}`));

  it('Acerto na primeira: CONTINUAR grava o Progresso com xp 10 e o chip mostra 10 XP', async () => {
    await startTrying();
    expect(screen.getByLabelText('VOCAB MODE')).toBeTruthy();
    for (const [item, letter] of (['A', 'B', 'B'] as const).entries()) await choose(item, letter);
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(screen.getByLabelText('+10 XP')).toBeTruthy();
    await fireEvent.press(button(CONTINUE_SHEET));
    expect(await screen.findByText(`2 DE ${TOTAL}`)).toBeTruthy();
    expect(await visitorStore.progress()).toEqual([
      {
        activityKey: STAGE.activities[0]!.activityKey,
        outcome: 'completed',
        xp: 10,
        resultPct: 100,
        studyTimeMs: expect.any(Number),
      },
    ]);
    expect(await screen.findByLabelText('10 XP')).toBeTruthy();
    expect(screen.queryByText(FEEDBACK_TITLES.correct)).toBeNull();
    // O recibo da primeira Tentativa ficou no aparelho (1.12).
    expect(await visitorStore.receipts()).toEqual([
      { activityKey: STAGE.activities[0]!.activityKey, receipt: expect.any(String) },
    ]);
  });

  it('Erro e nova tentativa: só a primeira vale, e o Progresso fica com xp 7', async () => {
    await startTrying();
    for (const [item, letter] of (['B', 'B', 'B'] as const).entries()) await choose(item, letter);
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText('Resultado: 2 de 3 itens · 67%')).toBeTruthy();
    await fireEvent.press(button(RETRY_SHEET));
    await choose(0, 'A');
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(screen.queryByTestId('xp-chip-light')).toBeNull();
    await fireEvent.press(button(CONTINUE_SHEET));
    expect(await screen.findByText(`2 DE ${TOTAL}`)).toBeTruthy();
    // O Resultado guardado é o da primeira Tentativa (67), como o XP.
    expect(await visitorStore.progress()).toEqual([
      {
        activityKey: STAGE.activities[0]!.activityKey,
        outcome: 'completed',
        xp: 7,
        resultPct: 67,
        studyTimeMs: expect.any(Number),
      },
    ]);
  });

  it('CONTINUAR da folha leva a uma Atividade sem componente: a folha some e fica o CONTINUAR do cartão', async () => {
    const firstKey = STAGE.activities[0]!.activityKey;
    const FirstOnly = (props: ActivityProps) =>
      props.activity.activityKey === firstKey ? <ChoiceActivity {...props} /> : <PendingActivity {...props} />;
    await withChoice(FirstOnly, async () => {
      await startTrying();
      for (const [item, letter] of (['A', 'B', 'B'] as const).entries()) await choose(item, letter);
      await fireEvent.press(button(CHECK_LABEL));
      expect(await screen.findByTestId('feedback-sheet')).toBeTruthy();
      await fireEvent.press(button(CONTINUE_SHEET));
      expect(await screen.findByText(PENDING_TITLE)).toBeTruthy();
      expect(screen.getByText(`2 DE ${TOTAL}`)).toBeTruthy();
      expect(screen.queryByTestId('feedback-sheet')).toBeNull();
      expect(button(CONTINUE_LABEL)).toBeEnabled();
    });
  });
});

describe('conclusão vista ou pulada (1.12)', () => {
  const SKIP_LABEL = 'PULAR';
  /** Tipo de teste que termina com `outcome` (e um XP que a conclusão ignora). */
  const finishing = (outcome: 'viewed' | 'skipped') =>
    function FinishingActivity({ activity, setFooter, advance }: ActivityProps) {
      useEffect(() => {
        // `void`: o toque não espera a conclusão (um teste a segura no ar).
        setFooter({ label: SKIP_LABEL, onPress: () => void advance({ outcome, xp: 5 }) });
      }, [setFooter, advance]);
      return <Text>{activity.activityKey}</Text>;
    };

  // O Diálogo do mock abre o Estágio e aceita VIEWED (1.13); o Tipo de teste toma o lugar dele.
  beforeEach(() => {
    servedStage = MOCK_STAGE;
  });

  it.each(['skipped', 'viewed'] as const)('%s: completions → recibo → Progresso xp 0 → avança', async (outcome) => {
    // Nenhum Tipo do mock aceita SKIPPED (reservado a um Tipo futuro): aqui a API o aceita.
    if (outcome === 'skipped') {
      apiResponds({
        completion: () => json({ data: { outcome: 'SKIPPED', xpAwarded: 0, receipt: 'v1.test-skipped.unsigned' } }),
      });
    }
    await withType('dialogue', finishing(outcome), async () => {
      await startTrying(FULL);
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText(`2 DE ${FULL}`)).toBeTruthy();
      const key = MOCK_STAGE.activities[0]!.activityKey;
      expect(completions).toEqual([
        {
          attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          deviceId: await visitorStore.deviceId(),
          versionId: MOCK_STAGE.versionId,
          activityKey: key,
          outcome: outcome.toUpperCase(),
          studyTimeMs: expect.any(Number),
        },
      ]);
      expect(await visitorStore.receipts()).toEqual([{ activityKey: key, receipt: expect.any(String) }]);
      expect(await visitorStore.progress()).toEqual([
        { activityKey: key, outcome, xp: 0, studyTimeMs: expect.any(Number) },
      ]);
      expect(screen.getByLabelText('0 XP')).toBeTruthy();
    });
  });

  it('Tipo que não aceita a conclusão: 409 COMPLETION_NOT_ALLOWED, messageFor e a tela fica', async () => {
    await withType('dialogue', finishing('skipped'), async () => {
      await startTrying(FULL);
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText(messageFor('COMPLETION_NOT_ALLOWED'))).toBeTruthy();
      expect(screen.getByText(`1 DE ${FULL}`)).toBeTruthy();
      expect(await visitorStore.progress()).toEqual([]);
      expect(await visitorStore.receipts()).toEqual([]);
    });
  });

  it('falha na completions: a tela fica com messageFor e a ação volta; repetir manda o mesmo attemptId', async () => {
    let failure: (() => Response) | null = () => json({ code: 'INTERNAL_ERROR' }, 500);
    apiResponds({ completion: () => failure?.() });
    await withType('dialogue', finishing('viewed'), async () => {
      await startTrying(FULL);
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText(messageFor('INTERNAL_ERROR'))).toBeTruthy();
      expect(screen.getByText(`1 DE ${FULL}`)).toBeTruthy();
      expect(button(SKIP_LABEL)).toBeEnabled();
      expect(await visitorStore.progress()).toEqual([]);

      failure = () => {
        throw new TypeError('Network request failed');
      };
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
      expect(button(SKIP_LABEL)).toBeEnabled();

      failure = null;
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText(`2 DE ${FULL}`)).toBeTruthy();
      expect(new Set(completions.map((body) => body.attemptId)).size).toBe(1);
      expect(completions).toHaveLength(3);
      expect(await visitorStore.progress()).toEqual([
        {
          activityKey: MOCK_STAGE.activities[0]!.activityKey,
          outcome: 'viewed',
          xp: 0,
          studyTimeMs: expect.any(Number),
        },
      ]);
      expect(screen.queryByText(messageFor(NETWORK_ERROR))).toBeNull();
    });
  });

  it('✕ com a conclusão no ar: o recibo que chega depois fica gravado e o Progresso não', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    apiResponds({
      completion: async () => {
        await held;
        return undefined;
      },
    });
    await withType('dialogue', finishing('viewed'), async () => {
      await startTrying(FULL);
      await fireEvent.press(button(SKIP_LABEL));
      await fireEvent.press(button(CLOSE_LABEL));
      expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
      await act(async () => release());
      await waitFor(async () =>
        expect(await visitorStore.receipts()).toEqual([
          { activityKey: MOCK_STAGE.activities[0]!.activityKey, receipt: expect.any(String) },
        ]),
      );
      expect(await visitorStore.progress()).toEqual([]);
    });
  });

  it('Estágio sem versionId: a conclusão não é enviada e a tela fica', async () => {
    const { versionId: _versionId, ...withoutVersion } = MOCK_STAGE;
    apiResponds({ stage: () => json({ data: withoutVersion }) });
    await withType('dialogue', finishing('viewed'), async () => {
      await startTrying(FULL);
      await fireEvent.press(button(SKIP_LABEL));
      expect(screen.getByText(`1 DE ${FULL}`)).toBeTruthy();
      expect(completions).toEqual([]);
      expect(await visitorStore.progress()).toEqual([]);
    });
  });

  it('sem rede: a ação da conclusão vira "SEM CONEXÃO"', async () => {
    await withType('dialogue', finishing('viewed'), async () => {
      await startTrying(FULL);
      await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
      expect(button(OFFLINE_LABEL)).toBeDisabled();
      expect(completions).toEqual([]);
    });
  });
});

describe('Diálogo no player (1.13)', () => {
  const DIALOGUE = MOCK_STAGE.activities[0]!;
  const NEXT = MOCK_STAGE.activities[1] as CardsView;

  beforeEach(() => {
    servedStage = MOCK_STAGE;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  /** Os corpos de todas as requisições mandadas à API. */
  function requestBodies(): string[] {
    return (global.fetch as jest.Mock).mock.calls
      .map(([, init]: [unknown, RequestInit | undefined]) => init?.body)
      .filter((body): body is string => typeof body === 'string');
  }

  it('o Estágio abre com o Diálogo: nome e país, CONTINUAR conclui (VIEWED, recibo, xp 0) e a próxima mostra o nome', async () => {
    expect(DIALOGUE.type).toBe('dialogue');
    await startTrying(FULL);
    expect(screen.getByTestId('dialogue-scene')).toBeTruthy();
    expect(screen.queryByText(PENDING_TITLE)).toBeNull();
    // O player repassa o `bleed` do Diálogo: o conteúdo sem recuo lateral.
    const sidePadding = () =>
      (
        StyleSheet.flatten(screen.getByTestId('player-content').props.contentContainerStyle) as {
          paddingHorizontal?: number;
        }
      ).paddingHorizontal;
    expect(sidePadding()).toBe(0);

    await fireEvent.changeText(await screen.findByLabelText(NAME_LABEL), 'Zoraide');
    await fireEvent.press(button(CONTINUE_LABEL));
    await fireEvent.press(await screen.findByTestId('dialogue-country-CA'));
    await fireEvent.press(button(CONTINUE_LABEL));
    await waitFor(() => expect(screen.queryByTestId('dialogue-ask-country')).toBeNull());
    expect(await visitorStore.variables()).toMatchObject({ name: 'Zoraide', country: 'Canada' });

    await fireEvent.press(button(CONTINUE_LABEL));
    expect(await screen.findByText(`2 DE ${FULL}`)).toBeTruthy();
    expect(completions).toEqual([expect.objectContaining({ activityKey: DIALOGUE.activityKey, outcome: 'VIEWED' })]);
    expect(await visitorStore.receipts()).toEqual([{ activityKey: DIALOGUE.activityKey, receipt: expect.any(String) }]);
    expect(await visitorStore.progress()).toEqual([
      { activityKey: DIALOGUE.activityKey, outcome: 'viewed', xp: 0, studyTimeMs: expect.any(Number) },
    ]);
    // A próxima Atividade tem o recuo lateral de volta.
    expect(sidePadding()).not.toBe(0);
    // A próxima Atividade (os Cartões, 1.14) mostra o nome do Visitante, em ouro, no 2º bloco.
    expect(NEXT.type).toBe('cards');
    expect(JSON.stringify(NEXT.blocks[1])).toContain('{name}');
    await fireEvent.press(button(NEXT_BLOCK_LABEL));
    const names = screen.getAllByTestId('student-var').map((node) => node.props.children);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((name) => name === 'Zoraide')).toBe(true);

    // Nome e país nunca vão para a API.
    const bodies = requestBodies();
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toContain('Zoraide');
      expect(body).not.toContain('Canada');
    }
  });
});

describe('Expressões Úteis no player (1.14)', () => {
  beforeEach(() => {
    servedStage = MOCK_STAGE;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  const choose = async (activity: StageActivity, item: number, letter: string) =>
    fireEvent.press(screen.getByTestId(`choice-${activity.activityKey}-${item + 1}-${letter}`));

  it('o Visitante vê os Cartões e a Expressão, abre a folha num trecho da Escolha e conclui tudo com recibo', async () => {
    const of = (type: StageActivity['type']) => MOCK_STAGE.activities.filter((activity) => activity.type === type);
    const [dialogue] = of('dialogue');
    const [cards] = of('cards');
    const [expression] = of('expression');
    const [first, second, third] = of('choice');
    const [match] = of('match') as MatchView[];
    const position = (activity: StageActivity | undefined) =>
      `${MOCK_STAGE.activities.indexOf(activity!) + 1} DE ${FULL}`;
    await startTrying(FULL);

    // Diálogo.
    await fireEvent.changeText(await screen.findByLabelText(NAME_LABEL), 'Júlia');
    await fireEvent.press(button(CONTINUE_LABEL));
    await fireEvent.press(await screen.findByTestId('dialogue-country-BR'));
    await fireEvent.press(button(CONTINUE_LABEL));
    await waitFor(() => expect(screen.queryByTestId('dialogue-ask-country')).toBeNull());
    await fireEvent.press(button(CONTINUE_LABEL));

    // Cartões: três blocos, depois CONTINUAR.
    expect(await screen.findByText(position(cards))).toBeTruthy();
    expect(screen.getByText('Bloco 1 de 3')).toBeTruthy();
    await fireEvent.press(button(NEXT_BLOCK_LABEL));
    await fireEvent.press(button(NEXT_BLOCK_LABEL));
    expect(screen.getByText('Bloco 3 de 3')).toBeTruthy();
    await fireEvent.press(button(CONTINUE_LABEL));

    // Expressão destacada: o termo da frase e o cartão dele.
    expect(await screen.findByText(position(expression))).toBeTruthy();
    expect(screen.getByTestId('expression-im-new-here').props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('expression-activity-card-term')).toHaveTextContent("I'm new here", { exact: true });
    await fireEvent.press(button(CONTINUE_LABEL));

    // As duas primeiras Escolhas.
    expect(await screen.findByText(position(first))).toBeTruthy();
    for (const [item, letter] of (['A', 'B', 'B'] as const).entries()) await choose(first!, item, letter);
    await fireEvent.press(button(CHECK_LABEL));
    await fireEvent.press(await screen.findByRole('button', { name: CONTINUE_SHEET }));
    expect(await screen.findByText(position(second))).toBeTruthy();
    await choose(second!, 0, 'A');
    await fireEvent.press(button(CHECK_LABEL));
    await fireEvent.press(await screen.findByRole('button', { name: CONTINUE_SHEET }));

    // Na última Escolha, o trecho abre a folha de dicionário; ENTENDI fecha e a resposta fica.
    expect(await screen.findByText(position(third))).toBeTruthy();
    await choose(third!, 0, 'A');
    await fireEvent.press(screen.getByTestId('expression-nice-to-meet-you'));
    const sheet = screen.getByTestId('expression-sheet');
    expect(within(sheet).getByRole('header', { name: 'Nice to meet you' })).toBeTruthy();
    // O exemplo com {name} sai com o nome do Visitante.
    expect(screen.getByText('Hi, Júlia! Nice to meet you.')).toBeTruthy();
    await fireEvent.press(button(EXPRESSION_CLOSE_LABEL));
    expect(screen.queryByTestId('expression-sheet')).toBeNull();
    expect(screen.getByTestId(`choice-${third!.activityKey}-1-A`).props.accessibilityState).toMatchObject({
      selected: true,
    });

    // Com a folha de feedback aberta, o trecho fica sem toque: nunca duas folhas.
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByTestId('feedback-sheet')).toBeTruthy();
    const chunk = screen.getByTestId('expression-nice-to-meet-you');
    expect(chunk.props.accessibilityRole).toBeUndefined();
    await fireEvent.press(chunk);
    expect(screen.queryByTestId('expression-sheet')).toBeNull();
    await fireEvent.press(button(CONTINUE_SHEET));

    // O Associar (1.16): só toque e toque; a resposta com {name} mostra o nome e a Tentativa só leva chaves.
    expect(await screen.findByText(position(match))).toBeTruthy();
    expect(screen.getByText("Hi Alex! I'm Júlia.")).toBeTruthy();
    expect(screen.getByText('Uma das respostas sobra.')).toBeTruthy();
    // O mock lista as respostas certas na ordem das falas, e o distrator por último.
    for (const [i, item] of match!.items.entries()) {
      await fireEvent.press(screen.getByTestId(`match-item-${item.itemKey}`));
      await fireEvent.press(screen.getByTestId(`match-response-${match!.responses[i]!.responseKey}`));
    }
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    const sent = attempts.find((body) => body.activityKey === match!.activityKey)!;
    expect(sent.answer).toEqual({
      type: 'match',
      items: match!.items.map((item, i) => ({ itemKey: item.itemKey, responseKey: match!.responses[i]!.responseKey })),
    });
    expect(JSON.stringify(sent)).not.toContain('Júlia');
    await fireEvent.press(button(CONTINUE_SHEET));

    // As Lacunas (1.17), só com toque e teclado. Banco: cada palavra vai à primeira lacuna vazia.
    const [bankGaps, typedGaps] = of('gaps') as Extract<StageActivity, { type: 'gaps' }>[];
    expect(await screen.findByText(position(bankGaps))).toBeTruthy();
    expect(screen.getByLabelText('FILL IN THE GAPS')).toBeTruthy();
    expect(button(CHECK_LABEL)).toBeDisabled();
    await fireEvent.press(screen.getByTestId('gap-fill-word-am'));
    await fireEvent.press(screen.getByTestId('gap-fill-word-meet'));
    expect(screen.getByTestId('gap-fill-gap-0').props.accessibilityLabel).toBe('Lacuna 1: am');
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    await fireEvent.press(button(CONTINUE_SHEET));

    // Digitadas: o nome do Visitante vira {name} antes de sair do aparelho.
    expect(await screen.findByText(position(typedGaps))).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('gap-fill-gap-0'), 'i am');
    await fireEvent.changeText(screen.getByTestId('gap-fill-gap-1'), 'julia');
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    const typed = attempts.find((body) => body.activityKey === typedGaps!.activityKey)!;
    expect(typed.answer).toEqual({
      type: 'gaps',
      items: [
        { itemKey: typedGaps!.items[0]!.itemKey, value: 'i am' },
        { itemKey: typedGaps!.items[1]!.itemKey, value: '{name}' },
      ],
    });
    expect(JSON.stringify(typed).toLowerCase()).not.toContain('julia');
    await fireEvent.press(button(CONTINUE_SHEET));

    // A Resposta Livre (1.18): ENVIAR conclui com VIEWED sem o texto e mostra a resposta-modelo com o nome.
    const [free] = of('free');
    expect(await screen.findByText(position(free))).toBeTruthy();
    const written = "I'm Júlia, <b>from</b> Brazil";
    await fireEvent.changeText(screen.getByLabelText(ANSWER_LABEL), written);
    await fireEvent.press(button(SEND_LABEL));
    expect(await screen.findByText(YOU_WROTE)).toBeTruthy();
    expect(screen.getByTestId('free-you-wrote')).toHaveTextContent(written, { exact: true });
    expect(screen.getByTestId('free-model-answer')).toHaveTextContent("Hi Alex! I'm Júlia. I'm from Brazil.", {
      exact: true,
    });
    const viewed = completions.find((body) => body.activityKey === free!.activityKey)!;
    expect(viewed).toMatchObject({ outcome: 'VIEWED' });
    expect(Object.keys(viewed).sort()).toEqual(
      ['activityKey', 'attemptId', 'deviceId', 'outcome', 'studyTimeMs', 'versionId'].sort(),
    );
    await fireEvent.press(button(CONTINUE_SHEET));

    // O Grammar Time (1.19): três abas, a frase com o nome, PRÓXIMO, um toque na aba e CONTINUAR.
    const [grammar] = of('grammar');
    expect(await screen.findByText(position(grammar))).toBeTruthy();
    expect(screen.getByLabelText('GRAMMAR TIME')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((el) => el.props.accessibilityLabel)).toEqual([...GRAMMAR_TABS]);
    expect(screen.getByText('My name is Júlia.')).toBeTruthy();
    await fireEvent.press(button(GRAMMAR_NEXT));
    expect(screen.getByTestId('grammar-rules')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: GRAMMAR_TABS[2] }));
    expect(screen.getByTestId('grammar-examples')).toBeTruthy();
    await fireEvent.press(button(CONTINUE_LABEL));

    // A Fala (1.15) fecha o Estágio: o aviso de privacidade, e "Não posso falar agora" pula.
    expect(await screen.findByText(position(of('speech')[0]))).toBeTruthy();
    expect(await screen.findByTestId('speech-privacy')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('speech-privacy-decline'));
    expect(await screen.findByTestId('stage-summary')).toBeTruthy();

    // Os expositivos passaram pela completions com VIEWED, e a Fala com SKIPPED; todos têm recibo.
    expect(completions.map((body) => [body.activityKey, body.outcome])).toEqual([
      [dialogue!.activityKey, 'VIEWED'],
      [cards!.activityKey, 'VIEWED'],
      [expression!.activityKey, 'VIEWED'],
      [free!.activityKey, 'VIEWED'],
      [grammar!.activityKey, 'VIEWED'],
      [MOCK_STAGE.activities.find((activity) => activity.type === 'speech')!.activityKey, 'SKIPPED'],
    ]);
    const receipts = await visitorStore.receipts();
    expect(receipts.map((entry) => entry.activityKey).sort()).toEqual(
      MOCK_STAGE.activities.map((activity) => activity.activityKey).sort(),
    );
    expect(await visitorStore.progress()).toEqual(
      expect.arrayContaining(
        [cards, expression, free, grammar].map((activity) =>
          expect.objectContaining({ activityKey: activity!.activityKey, outcome: 'viewed', xp: 0 }),
        ),
      ),
    );
    // O texto da Resposta Livre nunca vai à API (FR-7, NFR4).
    const sentBodies = (global.fetch as jest.Mock).mock.calls
      .map(([, init]: [unknown, RequestInit | undefined]) => init?.body)
      .filter((body): body is string => typeof body === 'string');
    expect(sentBodies.length).toBeGreaterThan(0);
    for (const body of sentBodies) expect(body).not.toContain('<b>from</b>');
  });
});

describe('Resposta Livre no player (1.18)', () => {
  const FREE = MOCK_STAGE.activities.find((activity) => activity.type === 'free')!;

  beforeEach(() => {
    servedStage = { ...MOCK_STAGE, activities: [FREE] };
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('ENVIAR falha: messageFor no rodapé; depois de EXTRA HELP, a mensagem some do VERIFICAR', async () => {
    apiResponds({ completion: () => json({ code: 'INTERNAL_ERROR' }, 500) });
    await startTrying(1);
    await fireEvent.changeText(screen.getByLabelText(ANSWER_LABEL), "I'm Ana");
    await fireEvent.press(button(SEND_LABEL));
    expect(await screen.findByText(messageFor('INTERNAL_ERROR'))).toBeTruthy();
    expect(button(SEND_LABEL)).toBeEnabled();
    await fireEvent.press(button(EXTRA_HELP_LABEL));
    expect(await screen.findByRole('button', { name: CHECK_LABEL })).toBeTruthy();
    expect(screen.queryByText(messageFor('INTERNAL_ERROR'))).toBeNull();
  });
});

describe('Fala no player (1.15)', () => {
  const SPEECH = MOCK_STAGE.activities.find((activity) => activity.type === 'speech')!;

  beforeEach(() => {
    servedStage = { ...MOCK_STAGE, activities: [SPEECH] };
    global.__speech.reset();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('o aviso aparece uma vez por aparelho; "Não posso falar agora" conclui com SKIPPED, recibo e xp 0', async () => {
    await startTrying(1);
    expect(await screen.findByTestId('speech-privacy')).toBeTruthy();
    await fireEvent.press(button(PRIVACY_OK_LABEL));
    await waitFor(() => expect(screen.queryByTestId('speech-privacy')).toBeNull());
    await fireEvent.press(button(SPEECH_SKIP));
    expect(await screen.findByTestId('stage-summary')).toBeTruthy();
    expect(completions).toEqual([expect.objectContaining({ activityKey: SPEECH.activityKey, outcome: 'SKIPPED' })]);
    expect(await visitorStore.receipts()).toEqual([{ activityKey: SPEECH.activityKey, receipt: expect.any(String) }]);
    expect(await visitorStore.progress()).toEqual([
      { activityKey: SPEECH.activityKey, outcome: 'skipped', xp: 0, studyTimeMs: expect.any(Number) },
    ]);

    // Na volta (o Estágio já está completo: o convite e "Refazer"), sem o aviso.
    await fireEvent.press(button(CLOSE_LABEL));
    await fireEvent.press(await screen.findByRole('button', { name: TRY_NOW }));
    await fireEvent.press(await screen.findByRole('button', { name: REDO_LABEL }));
    expect(await screen.findByText('1 DE 1')).toBeTruthy();
    await act(async () => {});
    expect(screen.queryByTestId('speech-privacy')).toBeNull();
  });

  it('falha ao pular no aviso: a folha fecha e o rodapé mostra messageFor(code)', async () => {
    apiResponds({ completion: () => json({ code: NETWORK_ERROR }, 503) });
    await startTrying(1);
    await fireEvent.press(await screen.findByTestId('speech-privacy-decline'));
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    expect(screen.queryByTestId('speech-privacy')).toBeNull();
    expect(screen.getByText('1 DE 1')).toBeTruthy();
    expect(await visitorStore.progress()).toEqual([]);
  });

  it('sem reconhecimento: o pular é o botão primário e conclui como pulada', async () => {
    global.__speech.set({ available: false });
    await startTrying(1);
    await act(async () => {});
    expect(screen.queryByTestId('speech-privacy')).toBeNull();
    await fireEvent.press(button(SPEECH_SKIP));
    expect(await screen.findByTestId('stage-summary')).toBeTruthy();
    expect(await visitorStore.progress()).toEqual([
      { activityKey: SPEECH.activityKey, outcome: 'skipped', xp: 0, studyTimeMs: expect.any(Number) },
    ]);
  });
});

describe('fim do Estágio, convite e eventos do Visitante (1.20)', () => {
  /** Tipo de teste: conclui com o Resultado de `results[activityKey]` (padrão 100) e xp 10. */
  const results: Record<string, number> = {};
  function ScriptedActivity({ activity, setFooter, advance }: ActivityProps) {
    useEffect(() => {
      setFooter({
        label: DONE_LABEL,
        onPress: () => void advance({ outcome: 'completed', xp: 10, resultPct: results[activity.activityKey] ?? 100 }),
      });
    }, [setFooter, advance, activity.activityKey]);
    return <Text>{activity.activityKey}</Text>;
  }

  const SPEECH = MOCK_STAGE.activities.find((activity) => activity.type === 'speech')!;
  const keysOf = (stage: typeof MOCK_STAGE) => stage.activities.map((activity) => activity.activityKey);

  beforeEach(() => {
    for (const key of Object.keys(results)) delete results[key];
    global.__speech.reset();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  /** Joga o Estágio de Escolhas com o Tipo de teste até o Resumo. */
  async function finishScripted() {
    await withChoice(ScriptedActivity, async () => {
      await startTrying();
      for (let position = 1; position <= TOTAL; position += 1) {
        await screen.findByText(`${position} DE ${TOTAL}`);
        await fireEvent.press(button(DONE_LABEL));
      }
      await screen.findByTestId('stage-summary');
    });
  }

  it('fim do Estágio: título "…: check!", frase com o nome, XP, Resultado médio, minutos, confete e o convite ouro', async () => {
    await visitorStore.setVariable('name', 'Zoraide');
    servedStage = { ...STAGE, completion: 'Well done, {name}!' };
    const [a, b, c] = keysOf(STAGE);
    Object.assign(results, { [a!]: 100, [b!]: 50, [c!]: 90 });
    await finishScripted();

    expect(screen.getByText(stageDoneLabel(1))).toBeTruthy();
    expect(screen.getByRole('header', { name: stageDoneTitle(STAGE.title as string) })).toBeTruthy();
    expect(stageDoneTitle('Meet & Greet')).toBe('Meet & Greet: check!');
    expect(screen.getByTestId('stage-completion')).toHaveTextContent('Well done, Zoraide!', { exact: true });
    expect(screen.getByLabelText(`${TOTAL * 10} XP`)).toBeTruthy();
    expect(screen.getByText(XP_STAT)).toBeTruthy();
    expect(screen.getByLabelText(`${RESULT_STAT} médio: 80%`)).toBeTruthy();
    expect(screen.getByLabelText('0 minutos')).toBeTruthy();
    expect(screen.getByText(MINUTES_STAT)).toBeTruthy();
    expect(screen.queryByTestId('stage-skipped')).toBeNull();
    expect(screen.getByTestId('alex-cheer')).toBeTruthy();
    expect(await screen.findByTestId('confetti', { includeHiddenElements: true })).toBeTruthy();
    // O convite ouro no lugar do CONTINUAR.
    expect(screen.getByRole('header', { name: INVITE_TITLE })).toBeTruthy();
    expect(screen.getByText(INVITE_BODY)).toBeTruthy();
    expect(screen.queryByRole('button', { name: CONTINUE_LABEL })).toBeNull();
    // O Progresso guardou o Resultado e o tempo de cada uma.
    expect(await visitorStore.progress()).toEqual(
      [a, b, c].map((activityKey) => ({
        activityKey,
        outcome: 'completed',
        xp: 10,
        resultPct: results[activityKey!],
        studyTimeMs: expect.any(Number),
      })),
    );

    // CRIAR CONTA leva ao "Em breve".
    await fireEvent.press(button(INVITE_SIGN_UP));
    expect(await screen.findByText(SOON_TITLE)).toBeTruthy();
    expect(screen).toHavePathname('/em-breve');
  });

  it('tempo de estudo: o Progresso guarda o tempo de cada Atividade na tela, e o resumo soma os minutos', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const spent = [50_000, 40_000, 70_000];
    await withChoice(ScriptedActivity, async () => {
      await startTrying();
      for (let position = 1; position <= TOTAL; position += 1) {
        await screen.findByText(`${position} DE ${TOTAL}`);
        await act(async () => {});
        // O `renderRouter` liga os relógios falsos do Jest: o tempo anda pelo `setSystemTime`.
        jest.setSystemTime(Date.now() + spent[position - 1]!);
        await fireEvent.press(button(DONE_LABEL));
      }
      await screen.findByTestId('stage-summary');
    });
    expect((await visitorStore.progress()).map((entry) => entry.studyTimeMs)).toEqual(spent);
    // 160 s ≈ 3 minutos.
    expect(screen.getByLabelText('3 minutos')).toBeTruthy();
  });

  it('sem frase: Estágio sem completion, o resumo não tem a linha', async () => {
    const { completion: _completion, ...withoutPhrase } = STAGE;
    servedStage = withoutPhrase;
    await finishScripted();
    expect(screen.queryByTestId('stage-completion')).toBeNull();
    expect(screen.getByRole('header', { name: INVITE_TITLE })).toBeTruthy();
  });

  it('a frase do mock vem com o nome do Visitante', async () => {
    await visitorStore.setVariable('name', 'Zoraide');
    servedStage = { ...MOCK_STAGE, activities: [SPEECH] };
    await startTrying(1);
    await fireEvent.press(await screen.findByTestId('speech-privacy-decline'));
    await screen.findByTestId('stage-summary');
    expect(MOCK_STAGE.completion).toContain('{name}');
    expect(screen.getByTestId('stage-completion')).toHaveTextContent(
      (MOCK_STAGE.completion as string).replace('{name}', 'Zoraide'),
      { exact: true },
    );
  });

  it('puladas: uma Fala pulada dá "1 atividade de fala pulada…", e sem avaliadas não há Resultado', async () => {
    servedStage = { ...MOCK_STAGE, activities: [SPEECH] };
    await startTrying(1);
    await fireEvent.press(await screen.findByTestId('speech-privacy-decline'));
    await screen.findByTestId('stage-summary');
    expect(screen.getByTestId('stage-skipped')).toHaveTextContent(
      '1 atividade de fala pulada. Você pode refazer quando quiser.',
      { exact: true },
    );
    expect(screen.queryByText(RESULT_STAT)).toBeNull();
    expect(screen.getByLabelText('0 XP')).toBeTruthy();
  });

  it('✕ e o voltar do Android no resumo levam à boas-vindas', async () => {
    const handlers: ((event: never) => boolean | null | undefined)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'hardwareBackPress') handlers.push(handler);
      return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
    });
    await finishScripted();
    await act(async () => {
      handlers.at(-1)?.(undefined as never);
    });
    expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
    expect(screen).toHavePathname('/');
  });

  it('movimento reduzido: o resumo fica sem confete', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    await finishScripted();
    await act(async () => {});
    expect(screen.queryByTestId('confetti', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('alex-cheer')).toBeTruthy();
  });

  it('Progresso antigo (sem resultPct e studyTimeMs): o resumo calcula com o que há, sem quebrar', async () => {
    const [a, b] = keysOf(STAGE);
    await visitorStore.recordProgress({ activityKey: a!, outcome: 'completed', xp: 10 });
    await visitorStore.recordProgress({ activityKey: b!, outcome: 'viewed', xp: 0 });
    await withType('choice', PendingActivity, async () => {
      await startTrying();
      for (let position = 1; position <= TOTAL; position += 1) {
        await screen.findByText(`${position} DE ${TOTAL}`);
        await pressContinue();
      }
      await screen.findByTestId('stage-summary');
    });
    expect(screen.getByLabelText('10 XP')).toBeTruthy();
    expect(screen.queryByText(RESULT_STAT)).toBeNull();
    expect(screen.getByLabelText('0 minutos')).toBeTruthy();
  });

  describe('Estágio 2 e eventos', () => {
    /** Todas as Atividades do Estágio no Progresso do aparelho. */
    async function stageDone(stage = STAGE) {
      for (const activityKey of keysOf(stage)) {
        await visitorStore.recordProgress({ activityKey, outcome: 'completed', xp: 10, resultPct: 100 });
      }
    }

    it('sessão: EXPERIMENTAR AGORA com o Estágio incompleto abre o player e manda um VISITOR_SESSION_STARTED', async () => {
      await startTrying();
      const deviceId = await visitorStore.deviceId();
      await waitFor(() => expect(events.length).toBeGreaterThanOrEqual(2));
      expect(events.filter((event) => event.type === 'VISITOR_SESSION_STARTED')).toEqual([
        { type: 'VISITOR_SESSION_STARTED', deviceId },
      ]);
    });

    it('abertura: cada Atividade na tela manda um ACTIVITY_STARTED com versionId e activityKey, sem mais nada', async () => {
      await withType('choice', PendingActivity, async () => {
        await startTrying();
        await pressContinue();
        await screen.findByText(`2 DE ${TOTAL}`);
        await pressContinue();
        await screen.findByText(`3 DE ${TOTAL}`);
      });
      const deviceId = await visitorStore.deviceId();
      await waitFor(() => expect(events).toHaveLength(1 + TOTAL));
      expect(events).toEqual([
        { type: 'VISITOR_SESSION_STARTED', deviceId },
        ...keysOf(STAGE).map((activityKey) => ({
          type: 'ACTIVITY_STARTED',
          deviceId,
          versionId: STAGE.versionId,
          activityKey,
        })),
      ]);
    });

    it('sem rede ao avançar: o ACTIVITY_STARTED da Atividade seguinte é descartado, sem requisição', async () => {
      const ADVANCE = 'AVANÇAR AQUI';
      /** Tipo de teste que avança por um botão do conteúdo (o rodapé vira "SEM CONEXÃO" sem rede). */
      function InlineAdvance({ activity, advance }: ActivityProps) {
        return (
          <Text accessibilityRole="button" accessibilityLabel={ADVANCE} onPress={() => void advance()}>
            {activity.activityKey}
          </Text>
        );
      }
      await withChoice(InlineAdvance, async () => {
        await startTrying();
        await waitFor(() => expect(events).toHaveLength(2));
        await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
        await fireEvent.press(button(ADVANCE));
        expect(await screen.findByText(`2 DE ${TOTAL}`)).toBeTruthy();
        await act(async () => {});
      });
      expect(events.map((event) => event.activityKey ?? event.type)).toEqual([
        'VISITOR_SESSION_STARTED',
        keysOf(STAGE)[0],
      ]);
    });

    it('abrir o player pelo link direto não conta sessão (só o toque no EXPERIMENTAR AGORA)', async () => {
      await openApp('/player');
      expect(await screen.findByText(`1 DE ${TOTAL}`)).toBeTruthy();
      await waitFor(() => expect(events).toHaveLength(1));
      expect(events[0]).toMatchObject({ type: 'ACTIVITY_STARTED' });
    });

    it('EXPERIMENTAR AGORA sem rede: vai direto ao player, que mostra o aviso, e a sessão é tentada', async () => {
      await stageDone();
      await openApp();
      await screen.findByText(WELCOME_TITLE);
      await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
      await fireEvent.press(button(TRY_NOW));
      expect(await screen.findByText(`1 DE ${TOTAL}`)).toBeTruthy();
      expect(screen).toHavePathname('/player');
      expect(screen.getByText(OFFLINE_TEXT)).toBeTruthy();
      await waitFor(() => expect(events.map((event) => event.type)).toContain('VISITOR_SESSION_STARTED'));
    });

    it('a loja falha no EXPERIMENTAR: a falha vai ao Sentry e segue para o player', async () => {
      const failure = new Error('loja quebrada');
      jest.spyOn(visitorStore, 'progress').mockRejectedValueOnce(failure);
      await openApp();
      await fireEvent.press(await screen.findByRole('button', { name: TRY_NOW }));
      expect(await screen.findByText(`1 DE ${TOTAL}`)).toBeTruthy();
      expect(sentry.captureError).toHaveBeenCalledWith(failure);
    });

    it('com o EXPERIMENTAR ocupado, CRIAR CONTA, ENTRAR e os links ficam desabilitados', async () => {
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      apiResponds({
        unit: async () => {
          await held;
          return json(mockRoutes['/api/v1/units/{unitKey}'].get(new Request('http://mock')));
        },
      });
      await openApp();
      await fireEvent.press(await screen.findByRole('button', { name: TRY_NOW }));
      expect(button(SIGN_UP)).toBeDisabled();
      expect(button(SIGN_IN)).toBeDisabled();
      expect(screen.getByTestId('welcome-privacy')).toBeDisabled();
      expect(screen.getByTestId('welcome-terms')).toBeDisabled();
      await act(async () => release());
      expect(await screen.findByText(`1 DE ${TOTAL}`)).toBeTruthy();
    });

    it('/convite pelo link direto, sem o Estágio 1 completo: volta à boas-vindas', async () => {
      await openApp('/convite');
      expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
      expect(screen).toHavePathname('/');
      expect(screen.queryByTestId('stage-two-invite')).toBeNull();
    });

    it('Estágio 2: com o Estágio 1 completo, EXPERIMENTAR AGORA abre o convite, sem o player e sem sessão', async () => {
      await stageDone();
      await openApp();
      await fireEvent.press(await screen.findByRole('button', { name: TRY_NOW }));
      expect(await screen.findByTestId('stage-two-invite')).toBeTruthy();
      expect(screen).toHavePathname('/convite');
      expect(screen.getByRole('header', { name: INVITE_TITLE })).toBeTruthy();
      expect(screen.getByText(INVITE_BODY)).toBeTruthy();
      expect(screen.queryByText(`1 DE ${TOTAL}`)).toBeNull();
      await act(async () => {});
      expect(events).toEqual([]);

      // ✕ volta à boas-vindas; CRIAR CONTA leva ao "Em breve".
      await fireEvent.press(button(CLOSE_LABEL));
      expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
      await fireEvent.press(button(TRY_NOW));
      await fireEvent.press(await screen.findByRole('button', { name: INVITE_SIGN_UP }));
      expect(await screen.findByText(SOON_TITLE)).toBeTruthy();
    });

    it('Refazer: "Refazer o Estágio 1" abre o player do início e manda VISITOR_SESSION_STARTED', async () => {
      await stageDone();
      await openApp();
      await fireEvent.press(await screen.findByRole('button', { name: TRY_NOW }));
      await fireEvent.press(await screen.findByRole('button', { name: REDO_LABEL }));
      expect(await screen.findByText(`1 DE ${TOTAL}`)).toBeTruthy();
      expect(screen).toHavePathname('/player');
      const deviceId = await visitorStore.deviceId();
      await waitFor(() => expect(events).toHaveLength(2));
      expect(events).toEqual([
        { type: 'VISITOR_SESSION_STARTED', deviceId },
        { type: 'ACTIVITY_STARTED', deviceId, versionId: STAGE.versionId, activityKey: keysOf(STAGE)[0] },
      ]);
    });

    it('a busca do Estágio falha no EXPERIMENTAR: segue para o player, que mostra o erro', async () => {
      apiResponds({ unit: () => json({ code: 'INTERNAL_ERROR' }, 500) });
      await openApp();
      await fireEvent.press(await screen.findByRole('button', { name: TRY_NOW }));
      expect(await screen.findByText(messageFor('INTERNAL_ERROR'))).toBeTruthy();
      expect(screen).toHavePathname('/player');
    });

    it('evento falha (500): a tela segue sem mensagem e a falha vai ao Sentry', async () => {
      apiResponds({ event: () => json({ code: 'INTERNAL_ERROR' }, 500) });
      await withType('choice', PendingActivity, async () => {
        await startTrying();
        await waitFor(() =>
          expect(sentry.captureError).toHaveBeenCalledWith(expect.objectContaining({ code: 'INTERNAL_ERROR' })),
        );
        expect((sentry.captureError as jest.Mock).mock.calls[0]![0]).toBeInstanceOf(ApiError);
        expect(screen.queryByText(messageFor('INTERNAL_ERROR'))).toBeNull();
        await pressContinue();
        expect(await screen.findByText(`2 DE ${TOTAL}`)).toBeTruthy();
      });
      // Não repete: um envio por evento.
      expect(events).toHaveLength(3);
    });

    it('evento sem rede: descartado, sem mensagem, sem Sentry e sem repetir', async () => {
      apiResponds({
        event: () => {
          throw new TypeError('Network request failed');
        },
      });
      await withType('choice', PendingActivity, async () => {
        await startTrying();
        await waitFor(() => expect(events).toHaveLength(2));
        await pressContinue();
        expect(await screen.findByText(`2 DE ${TOTAL}`)).toBeTruthy();
      });
      await waitFor(() => expect(events).toHaveLength(3));
      expect(sentry.captureError).not.toHaveBeenCalled();
      expect(screen.queryByText(messageFor(NETWORK_ERROR))).toBeNull();
    });
  });
});

describe('contrato de PII do modo Visitante (1.20, FR-7, NFR7)', () => {
  // Nome, país e texto livre que não aparecem no conteúdo do mock (Alex fala de Canada e Brazil).
  const NAME = 'Zoraide';
  const COUNTRY = { code: 'JP', name: 'Japan' };
  const FREE_TEXT = 'Meu segredo é pistache 4729';

  beforeEach(() => {
    servedStage = MOCK_STAGE;
    global.__speech.reset();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  /** URL, cabeçalhos e corpo de cada requisição feita à API. */
  function requests(): string[] {
    return (global.fetch as jest.Mock).mock.calls.map(([input, init]: [RequestInfo | URL, RequestInit | undefined]) => {
      const headers = [...new Headers(init?.headers).entries()].map(([key, value]) => `${key}: ${value}`).join('\n');
      return [String(input), headers, typeof init?.body === 'string' ? init.body : ''].join('\n');
    });
  }

  it('o Estágio inteiro do mock, com nome, país e texto livre: nenhuma URL, cabeçalho ou corpo os contém', async () => {
    const of = (type: StageActivity['type']) => MOCK_STAGE.activities.filter((activity) => activity.type === type);
    const choose = async (activity: StageActivity, item: number, letter: string) =>
      fireEvent.press(screen.getByTestId(`choice-${activity.activityKey}-${item + 1}-${letter}`));
    const position = (activity: StageActivity | undefined) =>
      `${MOCK_STAGE.activities.indexOf(activity!) + 1} DE ${FULL}`;
    const continueSheet = async () => fireEvent.press(await screen.findByRole('button', { name: CONTINUE_SHEET }));
    for (const text of [NAME, COUNTRY.name, FREE_TEXT]) {
      expect(JSON.stringify(MOCK_STAGE).toLowerCase()).not.toContain(text.toLowerCase());
    }

    await startTrying(FULL);
    // Diálogo: nome e país.
    await fireEvent.changeText(await screen.findByLabelText(NAME_LABEL), NAME);
    await fireEvent.press(button(CONTINUE_LABEL));
    await fireEvent.press(await screen.findByTestId(`dialogue-country-${COUNTRY.code}`));
    await fireEvent.press(button(CONTINUE_LABEL));
    await waitFor(() => expect(screen.queryByTestId('dialogue-ask-country')).toBeNull());
    await fireEvent.press(button(CONTINUE_LABEL));
    // Cartões e Expressão.
    expect(await screen.findByText(position(of('cards')[0]))).toBeTruthy();
    await fireEvent.press(button(NEXT_BLOCK_LABEL));
    await fireEvent.press(button(NEXT_BLOCK_LABEL));
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(await screen.findByText(position(of('expression')[0]))).toBeTruthy();
    await fireEvent.press(button(CONTINUE_LABEL));
    // Escolhas.
    const [first, second, third] = of('choice');
    expect(await screen.findByText(position(first))).toBeTruthy();
    for (const [item, letter] of (['A', 'B', 'B'] as const).entries()) await choose(first!, item, letter);
    await fireEvent.press(button(CHECK_LABEL));
    await continueSheet();
    for (const activity of [second, third]) {
      expect(await screen.findByText(position(activity))).toBeTruthy();
      await choose(activity!, 0, 'A');
      await fireEvent.press(button(CHECK_LABEL));
      await continueSheet();
    }
    // Associar.
    const [match] = of('match') as MatchView[];
    expect(await screen.findByText(position(match))).toBeTruthy();
    for (const [i, item] of match!.items.entries()) {
      await fireEvent.press(screen.getByTestId(`match-item-${item.itemKey}`));
      await fireEvent.press(screen.getByTestId(`match-response-${match!.responses[i]!.responseKey}`));
    }
    await fireEvent.press(button(CHECK_LABEL));
    await continueSheet();
    // Lacunas: do banco e digitadas (com o nome).
    const [bankGaps, typedGaps] = of('gaps');
    expect(await screen.findByText(position(bankGaps))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('gap-fill-word-am'));
    await fireEvent.press(screen.getByTestId('gap-fill-word-meet'));
    await fireEvent.press(button(CHECK_LABEL));
    await continueSheet();
    expect(await screen.findByText(position(typedGaps))).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('gap-fill-gap-0'), 'i am');
    await fireEvent.changeText(screen.getByTestId('gap-fill-gap-1'), NAME.toLowerCase());
    await fireEvent.press(button(CHECK_LABEL));
    await continueSheet();
    // Resposta Livre com o texto livre, o nome e o país.
    expect(await screen.findByText(position(of('free')[0]))).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(ANSWER_LABEL), `${FREE_TEXT}. I'm ${NAME} from ${COUNTRY.name}`);
    await fireEvent.press(button(SEND_LABEL));
    expect(await screen.findByText(YOU_WROTE)).toBeTruthy();
    await continueSheet();
    // Grammar Time.
    expect(await screen.findByText(position(of('grammar')[0]))).toBeTruthy();
    await fireEvent.press(button(GRAMMAR_NEXT));
    await fireEvent.press(button(GRAMMAR_NEXT));
    await fireEvent.press(button(CONTINUE_LABEL));
    // Fala: pulada.
    expect(await screen.findByText(position(of('speech')[0]))).toBeTruthy();
    await fireEvent.press(await screen.findByTestId('speech-privacy-decline'));
    // O Resumo (com o nome na frase) e o convite.
    expect(await screen.findByTestId('stage-summary')).toBeTruthy();
    expect(screen.getByTestId('stage-completion')).toHaveTextContent(new RegExp(NAME));
    await waitFor(() => expect(events.length).toBeGreaterThan(FULL));

    const sent = requests();
    // Passou por todas as rotas do Visitante.
    for (const path of ['/visitor/attempts', '/visitor/completions', '/visitor/events']) {
      expect(sent.some((request) => request.includes(path))).toBe(true);
    }
    for (const request of sent) {
      const lower = request.toLowerCase();
      expect(lower).not.toContain(NAME.toLowerCase());
      expect(lower).not.toContain(COUNTRY.name.toLowerCase());
      expect(lower).not.toContain(FREE_TEXT.toLowerCase());
      expect(lower).not.toContain('pistache');
      // A forma guardada do país é o código.
      expect(request).not.toMatch(new RegExp(`\\b${COUNTRY.code}\\b`));
    }
  });
});
