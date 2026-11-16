// Matriz da 1.10 (boas-vindas e player do Visitante): uma linha por teste.
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { BackHandler, Text } from 'react-native';

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
import Player, { RETRY_LABEL } from '../../app/(student)/player';
import UpdateRequired from '../../app/atualize';
import { messageFor, NETWORK_ERROR } from '../api/errors';
import { mockResponse } from '../api/mocks/handlers';
import { mockRoutes, resetMockVisitorRecords } from '../api/mocks/routes';
import { AppProviders, createQueryClient } from '../AppProviders';
import * as sentry from '../observability/sentry';
import { CONTINUE_LABEL, PendingActivity, PENDING_TITLE } from '../player/PendingActivity';
import { ChoiceActivity } from '../player/types/ChoiceActivity';
import { PENDING, registry, type ActivityProps, type ActivityRegistry } from '../player/registry';
import { OFFLINE_TEXT } from '../network/text';
import { CLOSE_LABEL, OFFLINE_LABEL } from '../player/PlayerFrame';
import { CHECK_LABEL, CONTINUE_LABEL as CONTINUE_SHEET, RETRY_LABEL as RETRY_SHEET } from '../player/useEvaluation';
import { FEEDBACK_TITLES } from '../ui';
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

const STAGE = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data;
const TOTAL = STAGE.activities.length;

/** A API respondendo com os mocks; `fail` troca a resposta de uma rota. */
function apiResponds(
  fail: Partial<
    Record<'unit' | 'stage' | 'completion', () => Response | Promise<Response | undefined> | undefined>
  > = {},
  minAppVersion = '0.0.0',
) {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/v1/visitor/attempts')) {
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
    if (url.endsWith('/api/v1/meta')) return json({ data: { minAppVersion, activityTypes: [] } });
    if (url.includes('/stages/')) {
      return fail.stage
        ? (fail.stage() as Response | Promise<Response>)
        : json(mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request(url)));
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
      atualize: UpdateRequired,
    },
    { initialUrl },
  );
}

const button = (name: string) => screen.getByRole('button', { name });

async function startTrying() {
  await openApp();
  await fireEvent.press(await screen.findByRole('button', { name: TRY_NOW }));
  await screen.findByText(`1 DE ${TOTAL}`);
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

/** Troca o componente do `choice` durante um teste. */
async function withChoice(component: (props: ActivityProps) => React.ReactNode, run: () => Promise<void>) {
  const types = registry as ActivityRegistry;
  const previous = types.choice;
  types.choice = component;
  try {
    await run();
  } finally {
    types.choice = previous!;
  }
}

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
      stage: () =>
        failing
          ? json({ code: 'INTERNAL_ERROR' }, 500)
          : json(mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock'))),
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
        { activityKey: STAGE.activities[0]!.activityKey, outcome: 'completed', xp: 10 },
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

  it('última Atividade: CONTINUAR em m de m volta à boas-vindas', async () => {
    await startTrying();
    for (let position = 1; position < TOTAL; position += 1) await pressContinue();
    expect(await screen.findByText(`${TOTAL} DE ${TOTAL}`)).toBeTruthy();
    await pressContinue();
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
      { activityKey: STAGE.activities[0]!.activityKey, outcome: 'completed', xp: 10 },
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
    expect(await visitorStore.progress()).toEqual([
      { activityKey: STAGE.activities[0]!.activityKey, outcome: 'completed', xp: 7 },
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
        setFooter({ label: SKIP_LABEL, onPress: () => advance({ outcome, xp: 5 }) });
      }, [setFooter, advance]);
      return <Text>{activity.activityKey}</Text>;
    };

  it.each(['skipped', 'viewed'] as const)('%s: completions → recibo → Progresso xp 0 → avança', async (outcome) => {
    await withChoice(finishing(outcome), async () => {
      await startTrying();
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText(`2 DE ${TOTAL}`)).toBeTruthy();
      const key = STAGE.activities[0]!.activityKey;
      expect(completions).toEqual([
        {
          attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          deviceId: await visitorStore.deviceId(),
          versionId: STAGE.versionId,
          activityKey: key,
          outcome: outcome.toUpperCase(),
          studyTimeMs: expect.any(Number),
        },
      ]);
      expect(await visitorStore.receipts()).toEqual([{ activityKey: key, receipt: expect.any(String) }]);
      expect(await visitorStore.progress()).toEqual([{ activityKey: key, outcome, xp: 0 }]);
      expect(screen.getByLabelText('0 XP')).toBeTruthy();
    });
  });

  it('falha na completions: a tela fica com messageFor e a ação volta; repetir manda o mesmo attemptId', async () => {
    let failure: (() => Response) | null = () => json({ code: 'INTERNAL_ERROR' }, 500);
    apiResponds({ completion: () => failure?.() });
    await withChoice(finishing('skipped'), async () => {
      await startTrying();
      await fireEvent.press(button(SKIP_LABEL));
      expect(await screen.findByText(messageFor('INTERNAL_ERROR'))).toBeTruthy();
      expect(screen.getByText(`1 DE ${TOTAL}`)).toBeTruthy();
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
      expect(await screen.findByText(`2 DE ${TOTAL}`)).toBeTruthy();
      expect(new Set(completions.map((body) => body.attemptId)).size).toBe(1);
      expect(completions).toHaveLength(3);
      expect(await visitorStore.progress()).toEqual([
        { activityKey: STAGE.activities[0]!.activityKey, outcome: 'skipped', xp: 0 },
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
    await withChoice(finishing('skipped'), async () => {
      await startTrying();
      await fireEvent.press(button(SKIP_LABEL));
      await fireEvent.press(button(CLOSE_LABEL));
      expect(await screen.findByText(WELCOME_TITLE)).toBeTruthy();
      await act(async () => release());
      await waitFor(async () =>
        expect(await visitorStore.receipts()).toEqual([
          { activityKey: STAGE.activities[0]!.activityKey, receipt: expect.any(String) },
        ]),
      );
      expect(await visitorStore.progress()).toEqual([]);
    });
  });

  it('Estágio sem versionId: a conclusão não é enviada e a tela fica', async () => {
    const { versionId: _versionId, ...withoutVersion } = STAGE;
    apiResponds({ stage: () => json({ data: withoutVersion }) });
    await withChoice(finishing('skipped'), async () => {
      await startTrying();
      await fireEvent.press(button(SKIP_LABEL));
      expect(screen.getByText(`1 DE ${TOTAL}`)).toBeTruthy();
      expect(completions).toEqual([]);
      expect(await visitorStore.progress()).toEqual([]);
    });
  });

  it('sem rede: a ação da conclusão vira "SEM CONEXÃO"', async () => {
    await withChoice(finishing('skipped'), async () => {
      await startTrying();
      await act(async () => global.__setNetwork({ isConnected: false, isInternetReachable: false }));
      expect(button(OFFLINE_LABEL)).toBeDisabled();
      expect(completions).toEqual([]);
    });
  });
});
