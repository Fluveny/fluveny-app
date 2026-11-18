// Matriz da 1.18 (Resposta Livre com Extra Help): a Atividade real dentro da
// moldura, com a conclusão pelo `useCompletion` (como o player) e a API
// respondendo pelo mock.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useCallback, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { mockResponse } from '../../api/mocks/handlers';
import { mockRoutes, resetMockVisitorRecords } from '../../api/mocks/routes';
import { EXPECTED_LABEL, FEEDBACK_TITLES } from '../../ui';
import { visitorStore } from '../../visitor/store';
import { clearVisitorCache } from '../../visitor/useVisitor';
import { useCompletion, type UngradedOutcome } from '../completion';
import { PlayerFrame } from '../PlayerFrame';
import { registry, type ActivityResult, type ActivityView, type FooterAction, type SheetSpec } from '../registry';
import {
  ANSWER_LABEL,
  canSend,
  COMPARE,
  EXTRA_HELP_HINT,
  EXTRA_HELP_LABEL,
  FreeActivity,
  MODEL_ANSWER,
  SEND_LABEL,
  YOU_WROTE,
} from '../types/FreeActivity';
import { CHECK_LABEL, CONTINUE_LABEL, RETRY_LABEL, REVEAL_LABEL } from '../useEvaluation';

jest.mock('../../observability/sentry', () => {
  const actual = jest.requireActual('../../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const STAGE = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data;
type FreeView = Extract<ActivityView, { type: 'free' }>;
const FREE = STAGE.activities.find((activity): activity is FreeView => activity.type === 'free')!;

const requests: { path: string; body: Record<string, unknown> }[] = [];

function api() {
  requests.length = 0;
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url).pathname as
      '/api/v1/visitor/attempts' | '/api/v1/visitor/attempts/reveal' | '/api/v1/visitor/completions';
    requests.push({ path, body: JSON.parse(String(init?.body)) });
    return mockResponse(mockRoutes[path].post, new Request(url, init));
  }) as jest.Mock;
}

const completions = () => requests.filter((request) => request.path === '/api/v1/visitor/completions');
const attempts = () => requests.filter((request) => request.path === '/api/v1/visitor/attempts');

function Harness({ advance }: { advance: jest.Mock }) {
  const [footer, setFooter] = useState<FooterAction | null>(null);
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const { complete: run } = useCompletion(visitorStore, FREE.activityKey, STAGE.versionId);
  const complete = useCallback(
    async (outcome: UngradedOutcome) => {
      const { status, result } = await run(outcome);
      return status === 'done' && result ? result : null;
    },
    [run],
  );
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PlayerFrame
        stageNumber={1}
        stageTitle="Meet & Greet"
        position={1}
        total={1}
        xp={0}
        online
        footer={footer}
        sheet={sheet}
        onClose={jest.fn()}
        contentKey={FREE.activityKey}
      >
        <FreeActivity
          activity={FREE}
          versionId={STAGE.versionId}
          setFooter={setFooter}
          setSheet={setSheet}
          advance={advance}
          complete={complete}
        />
      </PlayerFrame>
    </SafeAreaProvider>
  );
}

async function open() {
  await visitorStore.setVariable('name', 'Ana');
  await visitorStore.setVariable('country', 'Brazil');
  const advance = jest.fn<void, [ActivityResult?]>();
  await render(<Harness advance={advance} />);
  await act(async () => {});
  return { advance };
}

const button = (name: string) => screen.getByRole('button', { name });
const field = () => screen.getByLabelText(ANSWER_LABEL);
const word = (key: string) => screen.getByTestId(`gap-fill-word-${key}`);
const gap = (i: number) => screen.getByTestId(`gap-fill-gap-${i}`);
const label = (el: { props: Record<string, unknown> }) => String(el.props.accessibilityLabel);

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  global.__resetSqlite();
  clearVisitorCache();
  resetMockVisitorRecords();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  api();
});

afterEach(() => jest.restoreAllMocks());

describe('Resposta Livre', () => {
  it('o registro liga o free à Resposta Livre', () => {
    expect(registry.free).toBe(FreeActivity);
  });

  it('ao menos 2 caracteres, sem contar os espaços nas pontas', () => {
    expect(canSend(' a ')).toBe(false);
    expect(canSend('')).toBe(false);
    expect(canSend(' ab ')).toBe(true);
    expect(canSend('ã!')).toBe(true);
  });

  it('a pergunta de Alex em balão, o campo multilinha e o EXTRA HELP; ENVIAR desabilitado com " a "', async () => {
    await open();
    expect(screen.getByTestId('free-question')).toBeTruthy();
    expect(screen.getByText(String(FREE.prompt))).toBeTruthy();
    expect(field().props).toMatchObject({ multiline: true, placeholder: 'Type your answer…' });
    expect(screen.getByText(EXTRA_HELP_HINT)).toBeTruthy();
    expect(button(EXTRA_HELP_LABEL)).toBeEnabled();
    expect(button(SEND_LABEL)).toBeDisabled();
    await fireEvent.changeText(field(), ' a ');
    expect(button(SEND_LABEL)).toBeDisabled();
    await fireEvent.changeText(field(), 'ab');
    expect(button(SEND_LABEL)).toBeEnabled();
  });

  it('enviar: VIEWED sem o texto, "Você escreveu" e a resposta-modelo com o nome; CONTINUAR grava xp 0 sem concluir de novo', async () => {
    const { advance } = await open();
    await fireEvent.changeText(field(), "I'm Ana, from Brazil");
    await fireEvent.press(button(SEND_LABEL));
    expect(await screen.findByText(YOU_WROTE)).toBeTruthy();
    expect(screen.getByTestId('free-you-wrote')).toHaveTextContent("I'm Ana, from Brazil", { exact: true });
    expect(screen.getByText(MODEL_ANSWER)).toBeTruthy();
    expect(screen.getByTestId('free-model-answer')).toHaveTextContent("Hi Alex! I'm Ana. I'm from Brazil.", {
      exact: true,
    });
    expect(screen.getByText(COMPARE)).toBeTruthy();
    // Sem campo e sem EXTRA HELP depois do ENVIAR.
    expect(screen.queryByLabelText(ANSWER_LABEL)).toBeNull();
    expect(screen.queryByRole('button', { name: EXTRA_HELP_LABEL })).toBeNull();

    expect(completions()).toHaveLength(1);
    expect(completions()[0]!.body).toMatchObject({ activityKey: FREE.activityKey, outcome: 'VIEWED' });
    expect(JSON.stringify(requests)).not.toContain('from Brazil');
    expect(attempts()).toEqual([]);
    // O recibo da conclusão fica no aparelho; o texto, não.
    expect(await visitorStore.receipts()).toEqual([{ activityKey: FREE.activityKey, receipt: expect.any(String) }]);

    await fireEvent.press(button(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'viewed', xp: 0, recorded: true });
    expect(completions()).toHaveLength(1);
  });

  it('o texto do aluno aparece literalmente, sem formatação', async () => {
    await open();
    await fireEvent.changeText(field(), '<b>oi</b> **{name}**');
    await fireEvent.press(button(SEND_LABEL));
    expect(await screen.findByText(YOU_WROTE)).toBeTruthy();
    expect(screen.getByTestId('free-you-wrote')).toHaveTextContent('<b>oi</b> **{name}**', { exact: true });
  });

  it('falha da conclusão: a tela fica com o campo e o texto, e ENVIAR volta', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as jest.Mock;
    await open();
    await fireEvent.changeText(field(), 'Hello Alex');
    await fireEvent.press(button(SEND_LABEL));
    await act(async () => {});
    expect(screen.queryByText(YOU_WROTE)).toBeNull();
    expect(field().props.value).toBe('Hello Alex');
    expect(button(SEND_LABEL)).toBeEnabled();
  });
});

describe('Extra Help', () => {
  it('o toque troca a tela pelas lacunas do banco, sem ENVIAR nem campo, e sem volta', async () => {
    await open();
    await fireEvent.changeText(field(), 'Hello');
    await fireEvent.press(button(EXTRA_HELP_LABEL));
    expect(screen.getByTestId('free-extra-help-activity')).toBeTruthy();
    expect(screen.queryByLabelText(ANSWER_LABEL)).toBeNull();
    expect(screen.queryByRole('button', { name: SEND_LABEL })).toBeNull();
    expect(screen.queryByRole('button', { name: EXTRA_HELP_LABEL })).toBeNull();
    expect(screen.getByText(String(FREE.extraHelp.prompt))).toBeTruthy();
    expect(label(gap(0))).toBe('Lacuna 1, vazia');
    expect(button(CHECK_LABEL)).toBeDisabled();
    // O banco embaralhado, com o distrator.
    const order = screen.getAllByTestId(/^gap-fill-word-/).map((el) => String(el.props.testID).slice(14));
    expect([...order].sort()).toEqual(FREE.extraHelp.bank.map((entry) => entry.wordKey).sort());
  });

  it('certo: Tentativa do Tipo free com o texto das palavras, extraHelp, +6 XP e recibo', async () => {
    const { advance } = await open();
    await fireEvent.press(button(EXTRA_HELP_LABEL));
    await fireEvent.press(word('im'));
    await fireEvent.press(word('from'));
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(screen.getByLabelText('+6 XP')).toBeTruthy();
    expect(attempts()[0]!.body).toMatchObject({
      activityKey: FREE.activityKey,
      type: 'free',
      answer: {
        type: 'free',
        items: [
          { itemKey: FREE.extraHelp.items[0]!.itemKey, value: "I'm" },
          { itemKey: FREE.extraHelp.items[1]!.itemKey, value: 'from' },
        ],
      },
    });
    expect(completions()).toEqual([]);
    expect(await visitorStore.receipts()).toEqual([{ activityKey: FREE.activityKey, receipt: expect.any(String) }]);
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'completed', xp: 6, resultPct: 100 });
  });

  it('parcial (1 de 2): "Quase lá!"; TENTAR DE NOVO esvazia só a errada', async () => {
    await open();
    await fireEvent.press(button(EXTRA_HELP_LABEL));
    await fireEvent.press(word('im'));
    await fireEvent.press(word('is'));
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.wrong)).toBeTruthy();
    expect(screen.getByText('Resultado: 1 de 2 itens · 50%')).toBeTruthy();
    await fireEvent.press(button(RETRY_LABEL));
    expect(label(gap(0))).toBe("Lacuna 1: I'm, certo");
    expect(label(gap(1))).toBe('Lacuna 2, vazia');
    expect(word('is')).toBeEnabled();
  });

  it('ver resposta: errado, TENTAR DE NOVO, errado de novo e "Vamos revisar" com as linhas completas e o nome', async () => {
    await open();
    await fireEvent.press(button(EXTRA_HELP_LABEL));
    await fireEvent.press(word('is'));
    await fireEvent.press(word('from'));
    await fireEvent.press(button(CHECK_LABEL));
    await screen.findByText(FEEDBACK_TITLES.wrong);
    await fireEvent.press(button(RETRY_LABEL));
    await fireEvent.press(word('is'));
    await fireEvent.press(button(CHECK_LABEL));
    await screen.findByText(FEEDBACK_TITLES.wrong);
    await fireEvent.press(button(REVEAL_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.review)).toBeTruthy();
    expect(screen.getByText(EXPECTED_LABEL)).toBeTruthy();
    expect(screen.getByText("Hi Alex! I'm Ana.")).toBeTruthy();
    expect(screen.getByText("I'm from Brazil.")).toBeTruthy();
    expect(screen.queryByText(/\*\*|___|\{name\}/)).toBeNull();
    expect(requests.filter((request) => request.path === '/api/v1/visitor/attempts/reveal')).toHaveLength(1);
  });
});
