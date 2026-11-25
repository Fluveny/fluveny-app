// Matriz da 1.17 (Completar lacunas): as Lacunas reais dentro da moldura, com
// a API respondendo pelo corretor do mock.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo, Keyboard, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { mockResponse } from '../../api/mocks/handlers';
import { mockRoutes, resetMockVisitorRecords } from '../../api/mocks/routes';
import { ExpressionsProvider } from '../../renderer';
import { EXPECTED_LABEL, FEEDBACK_TITLES } from '../../ui';
import { color } from '../../ui/tokens';
import { visitorStore } from '../../visitor/store';
import { clearVisitorCache } from '../../visitor/useVisitor';
import { fillLines, gapCount, placeWord, splitLine, wordsOf } from '../GapFill';
import { PlayerFrame } from '../PlayerFrame';
import { registry, type ActivityResult, type ActivityView, type FooterAction, type SheetSpec } from '../registry';
import { GapsActivity } from '../types/GapsActivity';
import { CHECK_LABEL, CONTINUE_LABEL, RETRY_LABEL, REVEAL_LABEL } from '../useEvaluation';

jest.mock('../../observability/sentry', () => {
  const actual = jest.requireActual('../../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const STAGE = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data;
type GapsView = Extract<ActivityView, { type: 'gaps' }>;
const ALL = STAGE.activities.filter((activity): activity is GapsView => activity.type === 'gaps');
const BANK = ALL.find((activity) => activity.mode === 'bank')!;
const TYPED = ALL.find((activity) => activity.mode === 'typed')!;

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
        <GapsActivity
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

async function open(activity: ActivityView = BANK) {
  await visitorStore.setVariable('name', 'Ana');
  const advance = jest.fn<void, [ActivityResult?]>();
  const view = await render(<Harness activity={activity} advance={advance} />);
  await act(async () => {});
  return { advance, unmount: view.unmount };
}

const gap = (i: number) => screen.getByTestId(`gap-fill-gap-${i}`);
const word = (key: string) => screen.getByTestId(`gap-fill-word-${key}`);
const label = (el: { props: Record<string, unknown> }) => String(el.props.accessibilityLabel);
const button = (name: string) => screen.getByRole('button', { name });

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

describe('GapFill: funções puras', () => {
  it('lacuna é três ou mais _; o texto em volta fica', () => {
    expect(splitLine('Hi! I ___ Alex.')).toEqual(['Hi! I ', ' Alex.']);
    expect(splitLine('A ______ b __ c')).toEqual(['A ', ' b __ c']);
    expect(gapCount(['A ___ ___.', { he: 'He ___.', she: 'She ___.', they: 'They ___.' }], 'she')).toBe(3);
  });

  it('a palavra vai para a primeira lacuna vazia que não está travada; banco cheio não muda nada', () => {
    expect(placeWord(['', ''], 'am', new Set())).toEqual(['am', '']);
    expect(placeWord(['am', ''], 'meet', new Set())).toEqual(['am', 'meet']);
    expect(placeWord(['', ''], 'meet', new Set([0]))).toEqual(['', 'meet']);
    expect(placeWord(['am', 'meet'], 'is', new Set())).toBeNull();
  });

  it('linhas completas com os valores em negrito, na variante do pronome', () => {
    expect(
      fillLines(['Hi! I ___ Alex.', { he: 'He ___.', she: 'She ___.', they: 'They ___.' }], ['am', 'is'], 'he'),
    ).toEqual(['Hi! I **am** Alex.', 'He **is**.']);
  });

  it('palavras com o espaço que segue; negrito e Expressão Útil com espaço ficam inteiros', () => {
    expect(wordsOf('Hi! I ')).toEqual(['Hi! ', 'I ']);
    expect(wordsOf('**Nice to** meet [[you all|x]]!')).toEqual(['**Nice to** ', 'meet ', '[[you all|x]]!']);
    expect(wordsOf('')).toEqual([]);
  });
});

describe('Completar lacunas, banco', () => {
  it('o registro liga o gaps às Lacunas', () => {
    expect(registry.gaps).toBe(GapsActivity);
  });

  it('FILL IN THE GAPS, título, linhas com as lacunas vazias e o banco; VERIFICAR desabilitado', async () => {
    await open();
    expect(screen.getByLabelText('FILL IN THE GAPS')).toBeTruthy();
    expect(screen.getByText(BANK.title as string)).toBeTruthy();
    expect(label(gap(0))).toBe('Gap 1, empty');
    expect(label(gap(1))).toBe('Gap 2, empty');
    for (const entry of BANK.bank!) expect(word(entry.wordKey)).toBeEnabled();
    expect(button(CHECK_LABEL)).toBeDisabled();
  });

  it('o banco aparece embaralhado, e a ordem é estável', async () => {
    const view = await open();
    const order = () => screen.getAllByTestId(/^gap-fill-word-/).map((el) => String(el.props.testID).slice(14));
    const first = order();
    expect(first).not.toEqual(BANK.bank!.map((entry) => entry.wordKey));
    expect([...first].sort()).toEqual(BANK.bank!.map((entry) => entry.wordKey).sort());
    await act(async () => view.unmount());
    await open();
    expect(order()).toEqual(first);
  });

  it('preencher: "am" vai à primeira lacuna e fica fantasma no banco', async () => {
    await open();
    await fireEvent.press(word('am'));
    expect(label(gap(0))).toBe('Gap 1: am');
    expect(label(gap(1))).toBe('Gap 2, empty');
    expect(label(word('am'))).toBe('am, used');
    expect(word('am')).toBeDisabled();
  });

  it('esvaziar: tocar na lacuna com "am" a esvazia e devolve a palavra', async () => {
    await open();
    await fireEvent.press(word('am'));
    await fireEvent.press(gap(0));
    expect(label(gap(0))).toBe('Gap 1, empty');
    expect(label(word('am'))).toBe('am');
    expect(word('am')).toBeEnabled();
  });

  it('cheio: com todas preenchidas, outra palavra não muda nada', async () => {
    await open();
    await fireEvent.press(word('meet'));
    await fireEvent.press(word('am'));
    await fireEvent.press(word('is'));
    expect(label(gap(0))).toBe('Gap 1: meet');
    expect(label(gap(1))).toBe('Gap 2: am');
    expect(label(word('is'))).toBe('is');
  });

  it('incompleto: uma lacuna vazia deixa VERIFICAR desabilitado', async () => {
    await open();
    await fireEvent.press(word('am'));
    expect(button(CHECK_LABEL)).toBeDisabled();
    await fireEvent.press(word('meet'));
    expect(button(CHECK_LABEL)).toBeEnabled();
  });

  it('tudo certo: "Nice job!", +6 XP, o texto das palavras na Tentativa; CONTINUAR grava xp 6', async () => {
    const { advance } = await open();
    await fireEvent.press(word('am'));
    await fireEvent.press(word('meet'));
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(screen.getByLabelText('+6 XP')).toBeTruthy();
    expect(bodies[0]).toMatchObject({
      activityKey: BANK.activityKey,
      type: 'gaps',
      answer: {
        type: 'gaps',
        items: [
          { itemKey: BANK.items[0]!.itemKey, value: 'am' },
          { itemKey: BANK.items[1]!.itemKey, value: 'meet' },
        ],
      },
    });
    expect(label(gap(0))).toBe('Gap 1: am, right');
    expect(gap(0)).toBeDisabled();
    expect(word('is')).toBeDisabled();
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'completed', xp: 6, resultPct: 100 });
  });

  it('parcial (1 de 2): 50%; TENTAR DE NOVO mantém e trava o certo e esvazia só o errado', async () => {
    const { advance } = await open();
    await fireEvent.press(word('is'));
    await fireEvent.press(word('meet'));
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.wrong)).toBeTruthy();
    expect(screen.getByText('Result: 1 of 2 items · 50%')).toBeTruthy();
    expect(label(gap(0))).toBe('Gap 1: is, wrong');
    expect(label(gap(1))).toBe('Gap 2: meet, right');

    await fireEvent.press(button(RETRY_LABEL));
    expect(label(gap(0))).toBe('Gap 1, empty');
    expect(label(gap(1))).toBe('Gap 2: meet, right');
    expect(gap(1)).toBeDisabled();
    // A palavra errada volta ao banco; a certa segue fantasma.
    expect(word('is')).toBeEnabled();
    expect(word('meet')).toBeDisabled();
    expect(button(CHECK_LABEL)).toBeDisabled();
    // A próxima palavra vai à lacuna esvaziada, não à travada.
    await fireEvent.press(word('am'));
    expect(label(gap(0))).toBe('Gap 1: am');
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'completed', xp: 3, resultPct: 50 });
  });

  it(`ver resposta: "Let's review" com as linhas completas`, async () => {
    await open();
    await fireEvent.press(word('is'));
    await fireEvent.press(word('meet'));
    await fireEvent.press(button(CHECK_LABEL));
    await screen.findByText(FEEDBACK_TITLES.wrong);
    await fireEvent.press(button(REVEAL_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.review)).toBeTruthy();
    expect(screen.getByText(EXPECTED_LABEL)).toBeTruthy();
    expect(screen.getByText('Hi! I am Alex.')).toBeTruthy();
    expect(screen.getByText('Nice to meet you!')).toBeTruthy();
    expect(screen.queryByText(/\*\*|___/)).toBeNull();
    expect(screen.queryByRole('button', { name: RETRY_LABEL })).toBeNull();
  });
});

describe('Completar lacunas, digitado', () => {
  it('um campo curto por lacuna, sem correção nem maiúscula automática, e sem banco', async () => {
    await open(TYPED);
    expect(screen.queryByTestId('gap-fill-bank')).toBeNull();
    // A linha mostra o nome do aluno no lugar do {name}.
    expect(screen.getByText('Ana.')).toBeTruthy();
    for (const i of [0, 1]) {
      expect(gap(i).props).toMatchObject({ autoCorrect: false, autoCapitalize: 'none', spellCheck: false });
    }
    expect(label(gap(0))).toBe('Gap 1, empty');
    await fireEvent.changeText(gap(0), "I'm");
    expect(label(gap(0))).toBe("Gap 1: I'm");
    expect(button(CHECK_LABEL)).toBeDisabled();
    // Só espaço conta como vazia.
    await fireEvent.changeText(gap(1), '   ');
    expect(button(CHECK_LABEL)).toBeDisabled();
  });

  it('variações e Variável: "i am" e "ana" estão certos, e a Tentativa leva {name}, nunca o nome', async () => {
    await open(TYPED);
    await fireEvent.changeText(gap(0), ' i am ');
    await fireEvent.changeText(gap(1), 'ana');
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(bodies[0]).toMatchObject({
      answer: {
        type: 'gaps',
        items: [
          { itemKey: TYPED.items[0]!.itemKey, value: 'i am' },
          { itemKey: TYPED.items[1]!.itemKey, value: '{name}' },
        ],
      },
    });
    expect(JSON.stringify(bodies[0]).toLowerCase()).not.toContain('ana');
    expect(gap(0).props.editable).toBe(false);
  });

  it('parcial: o campo errado fica vermelho e TENTAR DE NOVO o esvazia; o certo fica travado', async () => {
    await open(TYPED);
    await fireEvent.changeText(gap(0), "I'm.");
    await fireEvent.changeText(gap(1), 'Bia');
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.wrong)).toBeTruthy();
    expect(label(gap(0))).toBe("Gap 1: I'm., right");
    expect(label(gap(1))).toBe('Gap 2: Bia, wrong');
    await fireEvent.press(button(RETRY_LABEL));
    expect(gap(0).props.value).toBe("I'm.");
    expect(gap(0).props.editable).toBe(false);
    expect(gap(1).props.value).toBe('');
    expect(gap(1).props.editable).toBe(true);
  });

  it('ver resposta: as linhas completas, com o nome renderizado', async () => {
    await open(TYPED);
    await fireEvent.changeText(gap(0), 'You are');
    await fireEvent.changeText(gap(1), 'Bia');
    await fireEvent.press(button(CHECK_LABEL));
    await screen.findByText(FEEDBACK_TITLES.wrong);
    await fireEvent.press(button(REVEAL_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.review)).toBeTruthy();
    expect(screen.getByText("Hi Alex! I'm Ana.")).toBeTruthy();
    expect(screen.getByText('My name is Ana.')).toBeTruthy();
    expect(screen.queryByText(/\{name\}/)).toBeNull();
  });
});

describe('Completar lacunas: leitor de tela, teclado e conteúdo', () => {
  it('cada trecho entre lacunas é um só elemento, com o texto dele; a lacuna fica separada', async () => {
    await open(TYPED);
    const runs = screen.getAllByTestId(/^gap-fill-run-/);
    expect(runs.map(label)).toEqual(['Hi Alex!', 'Ana.', 'My name is', '.']);
    for (const run of runs) expect(run.props.accessible).toBe(true);
    expect(label(gap(0))).toBe('Gap 1, empty');
    // As palavras não são elementos próprios: só o trecho é lido.
    expect(screen.getByText('Hi ').props.accessibilityLabel).toBeUndefined();
  });

  it('digitado: VERIFICAR fecha o teclado antes da folha', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await open(TYPED);
    await fireEvent.changeText(gap(0), "I'm");
    await fireEvent.changeText(gap(1), 'Ana');
    expect(dismiss).not.toHaveBeenCalled();
    await fireEvent.press(button(CHECK_LABEL));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(dismiss).toHaveBeenCalled();
  });

  it('com o teclado aberto, o foco na 2ª lacuna a traz para cima do teclado', async () => {
    const listeners: Record<string, (event?: unknown) => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
      listeners[event] = handler;
      return { remove: jest.fn() };
    }) as never);
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => {});
    scrollTo.mockClear();
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(null as never);
    // A rolagem ocupa de 100 a 500 na janela; o teclado começa em 400; a 2ª lacuna está em 450.
    const proto = ScrollView.prototype as unknown as { measureInWindow?: unknown };
    const previous = proto.measureInWindow;
    proto.measureInWindow = (callback: (x: number, y: number, w: number, h: number) => void) =>
      callback(0, 100, 360, 400);
    // O campo (o mock do TextInput) mede pela lacuna: a 2ª está em 450, atrás do teclado.
    jest
      .spyOn(TextInput.prototype as unknown as { measureInWindow: () => void }, 'measureInWindow')
      .mockImplementation(function (
        this: { props: { testID?: string } },
        callback: (x: number, y: number, w: number, h: number) => void,
      ) {
        callback(0, this.props.testID === 'gap-fill-gap-1' ? 450 : 200, 128, 44);
      } as never);
    try {
      await open(TYPED);
      await act(async () => {
        listeners.keyboardDidShow!({ endCoordinates: { screenY: 400 } });
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      await act(async () => {
        await fireEvent(gap(1), 'focus', {});
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(scrollTo).toHaveBeenCalledWith({ y: 450 + 44 - (400 - 16), animated: true });
    } finally {
      proto.measureInWindow = previous;
    }
  });

  it('banco com {name} e palavra com variantes: a Tentativa leva o token e a variante do pronome', async () => {
    const synthetic = {
      activityKey: 'gaps-synthetic',
      type: 'gaps',
      title: 'Complete',
      mode: 'bank',
      lines: ['My name is ___.', { he: 'He ___ here.', she: 'She ___ here.', they: 'They ___ here.' }],
      items: [{ itemKey: 'synthetic-name' }, { itemKey: 'synthetic-be' }],
      bank: [
        { wordKey: 'name', text: '{name}' },
        { wordKey: 'be', text: { he: 'is', she: 'is', they: 'are' } },
        { wordKey: 'am', text: 'am' },
      ],
      xp: 4,
    } as GapsView;
    await visitorStore.setVariable('pronoun', 'she');
    await open(synthetic);
    // Na tela, o nome e a variante.
    expect(label(word('name'))).toBe('Ana');
    expect(label(word('be'))).toBe('is');
    expect(screen.getByText('She ')).toBeTruthy();
    await fireEvent.press(word('name'));
    await fireEvent.press(word('be'));
    expect(label(gap(0))).toBe('Gap 1: Ana');
    await fireEvent.press(button(CHECK_LABEL));
    await act(async () => {});
    expect(bodies[0]).toMatchObject({
      answer: {
        type: 'gaps',
        items: [
          { itemKey: 'synthetic-name', value: '{name}' },
          { itemKey: 'synthetic-be', value: 'is' },
        ],
      },
    });
    expect(JSON.stringify(bodies[0])).not.toContain('Ana');
  });

  it('Expressão Útil na linha: destacada, mas o toque não abre a folha', async () => {
    const expressive = {
      ...TYPED,
      activityKey: 'gaps-expressive',
      lines: ['[[Nice to meet you|nice-to-meet-you]], ___!'],
      items: [{ itemKey: 'expressive-name' }],
    } as GapsView;
    await visitorStore.setVariable('name', 'Ana');
    const expressions = [
      { expressionKey: 'nice-to-meet-you', term: 'Nice to meet you', meaning: 'Prazer.', examples: [] },
    ];
    await render(
      <ExpressionsProvider expressions={expressions}>
        <Harness activity={expressive} advance={jest.fn()} />
      </ExpressionsProvider>,
    );
    const chunk = screen.getByTestId('expression-nice-to-meet-you');
    expect(StyleSheet.flatten(chunk.props.style)).toEqual(expect.objectContaining({ color: color.blue }));
    expect(chunk.props.onPress).toBeUndefined();
    await fireEvent.press(chunk);
    expect(screen.queryByTestId('expression-sheet')).toBeNull();
  });
});
