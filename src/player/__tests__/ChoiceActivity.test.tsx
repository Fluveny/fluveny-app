// Matriz da 1.11 (Vocab Mode e feedback): a Escolha real dentro da moldura,
// com a API respondendo pelo corretor do mock.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { messageFor, NETWORK_ERROR } from '../../api/errors';
import { mockResponse } from '../../api/mocks/handlers';
import { mockRoutes } from '../../api/mocks/routes';
import { EXPECTED_LABEL, FEEDBACK_TITLES, WRONG_MESSAGE } from '../../ui';
import { clearVisitorCache } from '../../visitor/useVisitor';
import { OFFLINE_LABEL, PlayerFrame } from '../PlayerFrame';
import type { ActivityResult, ActivityView, FooterAction, SheetSpec } from '../registry';
import { ChoiceActivity } from '../types/ChoiceActivity';
import { CHECK_LABEL, CONTINUE_LABEL, RETRY_LABEL, REVEAL_LABEL } from '../useEvaluation';

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const STAGE = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data;
/** A Escolha de 3 itens; as certas são A, B e B. */
const THREE = STAGE.activities[0]!;
/** A Escolha de um item; a certa é A. */
const SINGLE = STAGE.activities[1]!;

type Route = '/api/v1/visitor/attempts' | '/api/v1/visitor/attempts/reveal';

const bodies: Record<string, unknown>[] = [];

/** A API pelo mock; `fail` troca a resposta de uma rota (sem resposta, segue o mock). */
function api(fail: Partial<Record<'attempt' | 'reveal', () => Response | undefined>> = {}) {
  bodies.length = 0;
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const request = new Request(url, init);
    bodies.push(JSON.parse(String(init?.body)));
    const route: Route = url.endsWith('/reveal') ? '/api/v1/visitor/attempts/reveal' : '/api/v1/visitor/attempts';
    const failure = (route.endsWith('/reveal') ? fail.reveal : fail.attempt)?.();
    if (failure) return failure;
    return mockResponse(mockRoutes[route].post, request);
  }) as jest.Mock;
}

const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ code }), { status, headers: { 'Content-Type': 'application/problem+json' } });

function Harness({ activity, advance, online }: { activity: ActivityView; advance: jest.Mock; online: boolean }) {
  const [footer, setFooter] = useState<FooterAction | null>(null);
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PlayerFrame
        stageNumber={1}
        stageTitle="Meet & Greet"
        position={1}
        total={3}
        xp={0}
        online={online}
        footer={footer}
        sheet={sheet}
        onClose={jest.fn()}
        contentKey={activity.activityKey}
      >
        <ChoiceActivity
          activity={activity}
          versionId={STAGE.versionId}
          setFooter={setFooter}
          setSheet={setSheet}
          advance={advance}
        />
      </PlayerFrame>
    </SafeAreaProvider>
  );
}

async function open(activity: ActivityView = THREE) {
  const advance = jest.fn<void, [ActivityResult?]>();
  const view = await render(<Harness activity={activity} advance={advance} online />);
  const setOnline = (online: boolean) =>
    view.rerender(<Harness activity={activity} advance={advance} online={online} />);
  return { advance, setOnline, unmount: view.unmount };
}

const option = (activity: ActivityView, item: number, letter: string) =>
  screen.getByTestId(`choice-${activity.items[item]!.itemKey}-${letter}`);
const pick = async (activity: ActivityView, item: number, letter: string) =>
  fireEvent.press(option(activity, item, letter));
const button = (name: string) => screen.getByRole('button', { name });
const label = (activity: ActivityView, item: number, letter: string) =>
  String(option(activity, item, letter).props.accessibilityLabel);

async function answerThree(letters: [string, string, string]) {
  for (const [i, letter] of letters.entries()) await pick(THREE, i, letter);
}

async function verify() {
  await fireEvent.press(button(CHECK_LABEL));
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  global.__resetSqlite();
  clearVisitorCache();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  api();
});

afterEach(() => jest.restoreAllMocks());

describe('Escolha (Vocab Mode)', () => {
  it('VOCAB MODE, título, enunciado, perguntas e A–D; VERIFICAR desabilitado até todo item ter resposta', async () => {
    await open();
    expect(screen.getByLabelText('VOCAB MODE')).toBeTruthy();
    expect(screen.getByText(THREE.title as string)).toBeTruthy();
    expect(screen.getByText(THREE.prompt as string)).toBeTruthy();
    expect(screen.getByText(THREE.items[0]!.question as string)).toBeTruthy();
    expect(label(THREE, 0, 'A')).toBe('A, Good morning');
    expect(button(CHECK_LABEL)).toBeDisabled();
    await pick(THREE, 0, 'B');
    await pick(THREE, 1, 'B');
    expect(button(CHECK_LABEL)).toBeDisabled();
    // Escolha única por item: tocar em outra troca a escolha.
    await pick(THREE, 0, 'A');
    expect(option(THREE, 0, 'A').props.accessibilityState).toMatchObject({ selected: true });
    expect(option(THREE, 0, 'B').props.accessibilityState).toMatchObject({ selected: false });
    await pick(THREE, 2, 'A');
    expect(button(CHECK_LABEL)).toBeEnabled();
  });

  it('Acerto na primeira (3/3): folha turquesa, Alex, "+10", justificativas; CONTINUAR grava xp 10', async () => {
    const { advance } = await open();
    await answerThree(['A', 'B', 'B']);
    await verify();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    // A Tentativa do contrato.
    expect(bodies[0]).toEqual({
      attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      versionId: STAGE.versionId,
      activityKey: THREE.activityKey,
      type: 'choice',
      answer: {
        type: 'choice',
        items: THREE.items.map((item, i) => ({
          itemKey: item.itemKey,
          optionKey: item.options[[0, 1, 1][i]!]!.optionKey,
        })),
      },
      studyTimeMs: expect.any(Number),
    });
    expect(screen.getByTestId('alex-cheer')).toBeTruthy();
    expect(screen.getByLabelText('+10 XP')).toBeTruthy();
    expect(screen.getAllByTestId('sheet-justification')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: CHECK_LABEL })).toBeNull();
    // A resposta trava.
    expect(option(THREE, 0, 'B')).toBeDisabled();
    expect(label(THREE, 0, 'A')).toContain('certo');
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'completed', xp: 10 });
  });

  it('Erro (2/3) e nova tentativa: "2 de 3 itens · 67%", sem gabarito; mantém os certos; Acerto sem XP; grava xp 7', async () => {
    const { advance } = await open();
    await answerThree(['B', 'B', 'B']);
    await verify();
    expect(await screen.findByText(FEEDBACK_TITLES.wrong)).toBeTruthy();
    expect(screen.getByText('Resultado: 2 de 3 itens · 67%')).toBeTruthy();
    expect(screen.getByText(WRONG_MESSAGE)).toBeTruthy();
    expect(screen.queryByTestId('alex-cheer')).toBeNull();
    expect(screen.queryByTestId('sheet-justification')).toBeNull();
    expect(label(THREE, 0, 'B')).toContain('errado');
    // Sem gabarito: a certa não aparece.
    expect(label(THREE, 0, 'A')).toBe('A, Good morning');
    expect(button(RETRY_LABEL)).toBeEnabled();
    expect(button(REVEAL_LABEL)).toBeEnabled();

    await fireEvent.press(button(RETRY_LABEL));
    expect(screen.queryByText(FEEDBACK_TITLES.wrong)).toBeNull();
    expect(button(CHECK_LABEL)).toBeDisabled();
    expect(option(THREE, 0, 'B').props.accessibilityState).toMatchObject({ selected: false });
    expect(option(THREE, 0, 'B')).toBeEnabled();
    // Os certos ficam e travam.
    expect(label(THREE, 1, 'B')).toContain('certo');
    expect(option(THREE, 1, 'A')).toBeDisabled();

    await pick(THREE, 0, 'A');
    await verify();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(screen.queryByTestId('xp-chip-light')).toBeNull();
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'completed', xp: 7 });
  });

  it('Ver resposta (1/3): reveal falha e volta; depois, folha azul com a certa em right; grava xp 3', async () => {
    let failing = true;
    api({ reveal: () => (failing ? problem(500, 'INTERNAL_ERROR') : undefined) });

    const { advance } = await open();
    await answerThree(['B', 'A', 'B']);
    await verify();
    expect(await screen.findByText('Resultado: 1 de 3 itens · 33%')).toBeTruthy();

    await fireEvent.press(button(REVEAL_LABEL));
    expect(await screen.findByText(messageFor('INTERNAL_ERROR'))).toBeTruthy();
    expect(screen.getByText(FEEDBACK_TITLES.wrong)).toBeTruthy();
    expect(button(REVEAL_LABEL)).toBeEnabled();

    failing = false;
    await fireEvent.press(button(REVEAL_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.review)).toBeTruthy();
    expect(screen.getByText(EXPECTED_LABEL)).toBeTruthy();
    expect(screen.getByText('1. A, Good morning')).toBeTruthy();
    expect(screen.queryByText(messageFor('INTERNAL_ERROR'))).toBeNull();
    // O reveal reenvia a última resposta.
    const last = bodies.at(-1) as { answer: unknown };
    expect(last.answer).toEqual((bodies[0] as { answer: unknown }).answer);
    expect(label(THREE, 0, 'A')).toContain('certo');
    expect(label(THREE, 0, 'B')).toContain('errado');
    expect(label(THREE, 1, 'B')).toContain('certo');
    expect(label(THREE, 1, 'A')).toContain('errado');
    expect(screen.getAllByTestId('sheet-justification')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: RETRY_LABEL })).toBeNull();
    expect(screen.queryByRole('button', { name: REVEAL_LABEL })).toBeNull();
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'completed', xp: 3 });
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it('item único (0/1): Erro sem a linha de Resultado', async () => {
    await open(SINGLE);
    await pick(SINGLE, 0, 'B');
    await verify();
    expect(await screen.findByText(FEEDBACK_TITLES.wrong)).toBeTruthy();
    expect(screen.queryByText(/^Resultado:/)).toBeNull();
    expect(screen.getByRole('header', { name: FEEDBACK_TITLES.wrong })).toBeTruthy();
  });

  it('sem rede no VERIFICAR: "SEM CONEXÃO"; NETWORK_ERROR mostra a mensagem e a resposta destrava', async () => {
    const { setOnline } = await open(SINGLE);
    await pick(SINGLE, 0, 'A');
    await setOnline(false);
    expect(button(OFFLINE_LABEL)).toBeDisabled();
    await setOnline(true);

    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await verify();
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    expect(button(CHECK_LABEL)).toBeEnabled();
    expect(option(SINGLE, 0, 'B')).toBeEnabled();
    await pick(SINGLE, 0, 'B');
    expect(option(SINGLE, 0, 'B').props.accessibilityState).toMatchObject({ selected: true });
  });

  it.each([
    [401, 'UNAUTHENTICATED'],
    [400, 'INVALID_ANSWER'],
  ])('%i da API: messageFor(code), sem a folha', async (status, code) => {
    api({ attempt: () => problem(status, code) });
    await open(SINGLE);
    await pick(SINGLE, 0, 'A');
    await verify();
    expect(await screen.findByText(messageFor(code))).toBeTruthy();
    expect(screen.queryByTestId('feedback-sheet')).toBeNull();
    expect(button(CHECK_LABEL)).toBeEnabled();
  });

  it('sem rede na folha de Erro: VER RESPOSTA vira "SEM CONEXÃO"; TENTAR DE NOVO fica', async () => {
    const { setOnline } = await open(SINGLE);
    await pick(SINGLE, 0, 'B');
    await verify();
    await screen.findByText(FEEDBACK_TITLES.wrong);
    await setOnline(false);
    expect(screen.queryByRole('button', { name: REVEAL_LABEL })).toBeNull();
    expect(button(OFFLINE_LABEL)).toBeDisabled();
    expect(button(RETRY_LABEL)).toBeEnabled();
  });

  it('tempo de estudo conta desde a montagem', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    await open(SINGLE);
    now.mockReturnValue(4_500);
    await pick(SINGLE, 0, 'A');
    await verify();
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect((bodies[0] as { studyTimeMs: number }).studyTimeMs).toBe(3_500);
    await act(async () => {});
  });

  it('Acerto é todo item certo: resultPct 100 arredondado com um item errado é Erro', async () => {
    api({
      attempt: () =>
        new Response(
          JSON.stringify({
            data: {
              outcome: 'GRADED',
              resultPct: 100,
              xpAwarded: 10,
              items: THREE.items.map((item, i) => ({ itemKey: item.itemKey, correct: i !== 0 })),
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });
    await open();
    await answerThree(['B', 'B', 'B']);
    await verify();
    expect(await screen.findByText(FEEDBACK_TITLES.wrong)).toBeTruthy();
    expect(screen.queryByText(FEEDBACK_TITLES.correct)).toBeNull();
  });

  it('falha no VERIFICAR e a resposta muda: a mensagem antiga some', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await open(SINGLE);
    await pick(SINGLE, 0, 'A');
    await verify();
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    await pick(SINGLE, 0, 'B');
    expect(screen.queryByText(messageFor(NETWORK_ERROR))).toBeNull();
  });

  it('toque duplo no VERIFICAR manda uma Tentativa; no CONTINUAR, um advance', async () => {
    const { advance } = await open(SINGLE);
    await pick(SINGLE, 0, 'A');
    const check = button(CHECK_LABEL);
    await act(async () => {
      fireEvent.press(check);
      fireEvent.press(check);
    });
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const next = button(CONTINUE_LABEL);
    await act(async () => {
      fireEvent.press(next);
      fireEvent.press(next);
    });
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it('desmontar durante o VERIFICAR: sem atualizar o estado nem chamar advance', async () => {
    let respond: (response: Response) => void = () => {};
    global.fetch = jest.fn(() => new Promise<Response>((resolve) => (respond = resolve))) as jest.Mock;
    const errors = jest.spyOn(console, 'error');
    const { advance, unmount } = await open(SINGLE);
    await pick(SINGLE, 0, 'A');
    await verify();
    expect(button(CHECK_LABEL)).toBeDisabled();
    await act(async () => unmount());
    await act(async () => {
      respond(
        new Response(
          JSON.stringify({
            data: {
              outcome: 'GRADED',
              resultPct: 100,
              xpAwarded: 10,
              items: [{ itemKey: SINGLE.items[0]!.itemKey, correct: true }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });
    expect(advance).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });
});
