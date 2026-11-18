// Matriz da 1.16 (Associar, Match the Speech Bubbles): o Associar real dentro
// da moldura, com a API respondendo pelo corretor do mock.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { mockResponse } from '../../api/mocks/handlers';
import { mockRoutes, resetMockVisitorRecords } from '../../api/mocks/routes';
import { ExpressionsProvider } from '../../renderer';
import { EXPECTED_LABEL, FEEDBACK_TITLES } from '../../ui';
import { color } from '../../ui/tokens';
import { visitorStore } from '../../visitor/store';
import { clearVisitorCache } from '../../visitor/useVisitor';
import { PlayerFrame } from '../PlayerFrame';
import { registry, type ActivityResult, type ActivityView, type FooterAction, type SheetSpec } from '../registry';
import { MatchActivity, spareNotice } from '../types/MatchActivity';
import { CHECK_LABEL, CONTINUE_LABEL, RETRY_LABEL, REVEAL_LABEL } from '../useEvaluation';

jest.mock('../../observability/sentry', () => {
  const actual = jest.requireActual('../../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const STAGE = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data;
type MatchView = Extract<ActivityView, { type: 'match' }>;
const MATCH = STAGE.activities.find((activity): activity is MatchView => activity.type === 'match')!;
/** O mock lista as respostas certas na ordem das falas, e o distrator por último. */
const RIGHT = MATCH.items.map((item, i) => MATCH.responses[i]!.responseKey);
const DISTRACTOR = MATCH.responses[MATCH.responses.length - 1]!.responseKey;

const bodies: Record<string, unknown>[] = [];

function api() {
  bodies.length = 0;
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    bodies.push(JSON.parse(String(init?.body)));
    const route = url.endsWith('/reveal') ? '/api/v1/visitor/attempts/reveal' : '/api/v1/visitor/attempts';
    return mockResponse(mockRoutes[route].post, new Request(url, init));
  }) as jest.Mock;
}

function Harness({ activity, advance }: { activity: ActivityView; advance: jest.Mock }) {
  const [footer, setFooter] = useState<FooterAction | null>(null);
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
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
        contentKey={activity.activityKey}
      >
        <MatchActivity
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

async function open(activity: ActivityView = MATCH) {
  await visitorStore.setVariable('name', 'Ana');
  await visitorStore.setVariable('country', 'Brasil');
  const advance = jest.fn<void, [ActivityResult?]>();
  const view = await render(<Harness activity={activity} advance={advance} />);
  await act(async () => {});
  return { advance, unmount: view.unmount };
}

const item = (i: number) => screen.getByTestId(`match-item-${MATCH.items[i]!.itemKey}`);
const response = (key: string) => screen.getByTestId(`match-response-${key}`);
const label = (el: { props: Record<string, unknown> }) => String(el.props.accessibilityLabel);
const button = (name: string) => screen.getByRole('button', { name });
const pair = async (i: number, key: string) => {
  await fireEvent.press(item(i));
  await fireEvent.press(response(key));
};
/** A ordem das respostas na tela. */
const shownOrder = () =>
  screen.getAllByTestId(/^match-response-.*(?<!-badge)$/).map((el) => String(el.props.testID).slice(15));

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

describe('aviso de distratores', () => {
  it.each([
    [0, null],
    [1, 'Uma das respostas sobra.'],
    [2, 'Duas das respostas sobram.'],
    [3, 'Três das respostas sobram.'],
    [4, '4 das respostas sobram.'],
  ])('%i sobrando: %s', (spare, text) => {
    expect(spareNotice(spare)).toBe(text);
  });
});

describe('Associar (Match the Speech Bubbles)', () => {
  it('o registro liga o match ao Associar', () => {
    expect(registry.match).toBe(MatchActivity);
  });

  it('GAME TIME, título, enunciado, falas em cima e respostas embaralhadas embaixo, com o aviso e o nome', async () => {
    await open();
    expect(screen.getByLabelText('GAME TIME')).toBeTruthy();
    expect(screen.getByText(MATCH.title as string)).toBeTruthy();
    expect(screen.getByText(MATCH.prompt as string)).toBeTruthy();
    expect(screen.getByText('Uma das respostas sobra.')).toBeTruthy();
    // Nome: a tela mostra "Ana".
    expect(screen.getByText("Hi Alex! I'm Ana.")).toBeTruthy();
    expect(label(response(RIGHT[0]!))).toBe("Hi Alex! I'm Ana.");
    const order = shownOrder();
    expect(order).not.toEqual(MATCH.responses.map((entry) => entry.responseKey));
    expect([...order].sort()).toEqual(MATCH.responses.map((entry) => entry.responseKey).sort());
    expect(button(CHECK_LABEL)).toBeDisabled();
  });

  it('a mesma ordem a cada abertura', async () => {
    const view = await open();
    const first = shownOrder();
    await act(async () => view.unmount());
    await open();
    expect(shownOrder()).toEqual(first);
  });

  it('sem distrator: sem aviso', async () => {
    await open({ ...MATCH, responses: MATCH.responses.filter((entry) => entry.responseKey !== DISTRACTOR) });
    expect(screen.queryByTestId('match-spare')).toBeNull();
  });

  it('formar par: fala selecionada, toque na resposta; os dois ganham o mesmo número e a seleção some', async () => {
    await open();
    await fireEvent.press(item(1));
    expect(item(1)).toBeSelected();
    await fireEvent.press(response(RIGHT[1]!));
    expect(item(1)).not.toBeSelected();
    expect(response(RIGHT[1]!)).not.toBeSelected();
    expect(screen.getByTestId(`match-item-${MATCH.items[1]!.itemKey}-badge`)).toHaveTextContent('2');
    expect(screen.getByTestId(`match-response-${RIGHT[1]}-badge`)).toHaveTextContent('2');
    expect(label(item(1))).toBe('Nice to meet you!, ligada a Nice to meet you too!');
    expect(label(response(RIGHT[1]!))).toBe('Nice to meet you too!, ligada a Nice to meet you!');
  });

  it('resposta primeiro: toque em R, depois na fala, forma o par', async () => {
    await open();
    await fireEvent.press(response(RIGHT[2]!));
    expect(response(RIGHT[2]!)).toBeSelected();
    await fireEvent.press(item(2));
    expect(screen.getByTestId(`match-response-${RIGHT[2]}-badge`)).toHaveTextContent('3');
    expect(label(item(2))).toContain('ligada a I am from Brasil.');
  });

  it('desfazer: tocar na fala ou na resposta pareada desfaz, e a resposta volta a ficar livre', async () => {
    await open();
    await pair(0, RIGHT[0]!);
    await fireEvent.press(response(RIGHT[0]!));
    expect(label(item(0))).toBe("Hi! I'm Alex. What's your name?");
    expect(screen.getByTestId(`match-response-${RIGHT[0]}-badge`)).toHaveTextContent('');
    await pair(0, RIGHT[0]!);
    await fireEvent.press(item(0));
    expect(label(response(RIGHT[0]!))).toBe("Hi Alex! I'm Ana.");
    // Livre de novo: outra fala pode usá-la.
    await pair(1, RIGHT[0]!);
    expect(label(item(1))).toContain(`ligada a Hi Alex! I'm Ana.`);
  });

  it('trocar seleção: A selecionada, toque em B seleciona B; tocar de novo tira a seleção', async () => {
    await open();
    await fireEvent.press(item(0));
    await fireEvent.press(item(1));
    expect(item(0)).not.toBeSelected();
    expect(item(1)).toBeSelected();
    await fireEvent.press(item(1));
    expect(item(1)).not.toBeSelected();
    await fireEvent.press(response(DISTRACTOR));
    await fireEvent.press(response(DISTRACTOR));
    expect(response(DISTRACTOR)).not.toBeSelected();
  });

  it('incompleto: 2 de 3 falas pareadas deixa VERIFICAR desabilitado', async () => {
    await open();
    await pair(0, RIGHT[0]!);
    await pair(1, RIGHT[1]!);
    expect(button(CHECK_LABEL)).toBeDisabled();
    await pair(2, RIGHT[2]!);
    expect(button(CHECK_LABEL)).toBeEnabled();
  });

  it('tudo certo: "Mandou bem!", +9 XP, só chaves na Tentativa; CONTINUAR grava xp 9', async () => {
    const { advance } = await open();
    for (const [i, key] of RIGHT.entries()) await pair(i, key);
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(screen.getByLabelText('+9 XP')).toBeTruthy();
    expect(screen.getAllByTestId('sheet-justification')).toHaveLength(2);
    expect(bodies[0]).toMatchObject({
      activityKey: MATCH.activityKey,
      type: 'match',
      answer: {
        type: 'match',
        items: MATCH.items.map((entry, i) => ({ itemKey: entry.itemKey, responseKey: RIGHT[i] })),
      },
    });
    const raw = JSON.stringify(bodies[0]);
    for (const text of ['Ana', 'Brasil', 'Hi Alex', '{name}']) expect(raw).not.toContain(text);
    expect(label(item(0))).toContain('certo');
    expect(item(0)).toBeDisabled();
    expect(response(DISTRACTOR)).toBeDisabled();
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'completed', xp: 9, resultPct: 100 });
  });

  it('parcial (2 de 3): "Quase lá!", "2 de 3 itens"; TENTAR DE NOVO trava os 2 e libera o resto; só a primeira vale', async () => {
    const { advance } = await open();
    await pair(0, DISTRACTOR);
    await pair(1, RIGHT[1]!);
    await pair(2, RIGHT[2]!);
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.wrong)).toBeTruthy();
    expect(screen.getByText('Resultado: 2 de 3 itens · 67%')).toBeTruthy();
    expect(label(item(0))).toBe("Hi! I'm Alex. What's your name?, ligada a Goodbye!, errado");
    expect(label(response(DISTRACTOR))).toContain('errado');
    // ✕ na fala e na resposta do par errado (e o da folha).
    expect(screen.getAllByTestId('icon-x', { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(2);
    expect(label(item(1))).toContain('certo');

    await fireEvent.press(button(RETRY_LABEL));
    expect(button(CHECK_LABEL)).toBeDisabled();
    // Os certos ficam e travam; o errado se desfaz.
    expect(item(1)).toBeDisabled();
    expect(response(RIGHT[2]!)).toBeDisabled();
    expect(label(item(1))).toContain('certo');
    expect(item(0)).toBeEnabled();
    expect(label(item(0))).toBe("Hi! I'm Alex. What's your name?");
    expect(response(DISTRACTOR)).toBeEnabled();
    await fireEvent.press(item(1));
    expect(label(item(1))).toContain('ligada a');

    await pair(0, RIGHT[0]!);
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(screen.queryByTestId('xp-chip-light')).toBeNull();
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'completed', xp: 6, resultPct: 67 });
  });

  it('ver resposta: "RESPOSTA ESPERADA" com os três pares numerados e o nome renderizado', async () => {
    await open();
    await pair(0, DISTRACTOR);
    await pair(1, RIGHT[0]!);
    await pair(2, RIGHT[2]!);
    await fireEvent.press(button(CHECK_LABEL));
    await screen.findByText(FEEDBACK_TITLES.wrong);
    await fireEvent.press(button(REVEAL_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.review)).toBeTruthy();
    expect(screen.getByText(EXPECTED_LABEL)).toBeTruthy();
    expect(screen.getByText("1. Hi! I'm Alex. What's your name? → Hi Alex! I'm Ana.")).toBeTruthy();
    expect(screen.getByText('3. Where are you from? → I am from Brasil.')).toBeTruthy();
    // A linha com Expressão Útil e `**`: sai sem a marcação.
    expect(screen.getByText('2. Nice to meet you! → Nice to meet you too!')).toBeTruthy();
    expect(screen.queryByText(/\*\*|\[\[/)).toBeNull();
    // Justificativas de `hi` e `from`; `nice` não tem.
    expect(screen.getAllByTestId('sheet-justification')).toHaveLength(2);
    expect(screen.queryByText(/\{name\}/)).toBeNull();
    expect(label(item(0))).toContain('errado');
    expect(label(item(2))).toContain('certo');
    expect(screen.queryByRole('button', { name: RETRY_LABEL })).toBeNull();
  });

  it('Expressão Útil na fala: destacada, sem toque; o toque seleciona o cartão', async () => {
    await visitorStore.setVariable('name', 'Ana');
    const expressions = [
      { expressionKey: 'nice-to-meet-you', term: 'Nice to meet you', meaning: 'Prazer.', examples: [] },
    ];
    await render(
      <ExpressionsProvider expressions={expressions}>
        <Harness activity={MATCH} advance={jest.fn()} />
      </ExpressionsProvider>,
    );
    const chunk = screen.getByTestId('expression-nice-to-meet-you');
    expect(StyleSheet.flatten(chunk.props.style)).toEqual(expect.objectContaining({ color: color.blue }));
    expect(chunk.props.onPress).toBeUndefined();
    await fireEvent.press(chunk);
    expect(item(1)).toBeSelected();
    expect(screen.queryByTestId('expression-sheet')).toBeNull();
  });
});
