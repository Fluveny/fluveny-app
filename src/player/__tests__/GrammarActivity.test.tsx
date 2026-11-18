// Matriz da 1.19 (App): o Grammar Time dentro da moldura, sem rede.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { color, fontFamily, size } from '../../ui/tokens';
import { visitorStore } from '../../visitor/store';
import { clearVisitorCache } from '../../visitor/useVisitor';
import { PlayerFrame } from '../PlayerFrame';
import { registry, resolveActivity, type ActivityResult, type ActivityView, type FooterAction } from '../registry';
import { CONTINUE_LABEL, GRAMMAR_TABS, GrammarActivity, NEXT_LABEL, USED_INTRO } from '../types/GrammarActivity';

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

type GrammarView = Extract<ActivityView, { type: 'grammar' }>;

const VERB_TO_BE: GrammarView = {
  activityKey: 's1-grammar-time',
  type: 'grammar',
  title: 'Verb to be',
  used: [
    { sentenceKey: 'my-name', form: 'is', sentence: 'My name **is** {name}.' },
    {
      sentenceKey: 'from-canada',
      form: { he: 'is', she: 'is', they: 'are' },
      sentence: { he: 'He **is** from Canada.', she: 'She **is** from Canada.', they: 'They **are** from Canada.' },
    },
  ],
  rules: [
    { ruleKey: 'am', form: 'am', use: 'only with I', example: 'I **am** a student.' },
    { ruleKey: 'is', form: 'is', use: 'with he, she and it', example: '{name} **is** from {country}.' },
    { ruleKey: 'are', form: 'are', use: 'with you, we and they', example: 'You **are** from Canada.' },
  ],
  examples: [
    { exampleKey: 'alex', text: "I'm Alex. My name **is** Alex." },
    {
      exampleKey: 'pronoun',
      text: { he: 'He **is** my friend.', she: 'She **is** my friend.', they: 'They **are** my friends.' },
    },
  ],
};

function Harness({ activity, advance }: { activity: ActivityView; advance: jest.Mock }) {
  const [footer, setFooter] = useState<FooterAction | null>(null);
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PlayerFrame
        stageNumber={1}
        stageTitle="Meet & Greet"
        position={11}
        total={12}
        xp={0}
        online
        footer={footer}
        onClose={jest.fn()}
        contentKey={activity.activityKey}
      >
        <GrammarActivity
          activity={activity}
          versionId="v1"
          setFooter={setFooter}
          setSheet={jest.fn()}
          advance={advance}
        />
      </PlayerFrame>
    </SafeAreaProvider>
  );
}

async function open(activity: ActivityView = VERB_TO_BE) {
  const advance = jest.fn<void, [ActivityResult?]>();
  await render(<Harness activity={activity} advance={advance} />);
  await act(async () => {});
  return { advance };
}

const action = (label: string) => screen.getByRole('button', { name: label });
const tab = (n: number) => screen.getByRole('tab', { name: GRAMMAR_TABS[n - 1] });
const styleOf = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) ?? {};
const selectedTabs = () =>
  screen
    .getAllByRole('tab')
    .filter((el) => el.props.accessibilityState?.selected === true)
    .map((el) => el.props.accessibilityLabel);

/**
 * A forma em `word` dentro de `container` está em destaque: negrito 800 com
 * sublinhado em `ink`, sem vermelho, azul nem ouro. O rótulo da forma pode ter
 * o mesmo texto: a destacada é a que tem o sublinhado.
 */
function expectHighlight(container: ReturnType<typeof screen.getByTestId>, word: string) {
  const highlighted = within(container)
    .getAllByText(word, { exact: true })
    .find((el) => styleOf(el).textDecorationLine === 'underline');
  expect(highlighted).toBeDefined();
  const style = styleOf(highlighted!);
  expect(style).toMatchObject({
    fontFamily: fontFamily[800],
    color: color.ink,
    textDecorationLine: 'underline',
    textDecorationColor: color.ink,
  });
  for (const value of [style.color, style.textDecorationColor, style.backgroundColor]) {
    expect([color.red, color.blue, color.blueLt, color.gold, color.goldLt, color.goldText]).not.toContain(value);
  }
}

let announce: jest.SpyInstance;
beforeEach(async () => {
  global.__resetSqlite();
  clearVisitorCache();
  await visitorStore.setVariable('name', 'Ana');
  await visitorStore.setVariable('country', 'Brazil');
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Grammar Time (1.19)', () => {
  it('o registro liga `grammar` ao componente', () => {
    expect(registry.grammar).toBe(GrammarActivity);
    expect(resolveActivity('grammar')).toBe(GrammarActivity);
  });

  it('entrada: aba 1, a forma em destaque sem cor, o nome em ouro, PRÓXIMO e nenhum anúncio', async () => {
    await open();
    expect(screen.getByLabelText('GRAMMAR TIME')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Verb to be' })).toBeTruthy();
    expect(selectedTabs()).toEqual([GRAMMAR_TABS[0]]);
    expect(screen.getByText(USED_INTRO)).toBeTruthy();
    expect(USED_INTRO.toLowerCase()).not.toMatch(/vermelh|azul|ouro|amarel|cor\b/);

    const card = screen.getByTestId('grammar-used-my-name');
    expect(within(card).getByText('My name is Ana.')).toBeTruthy();
    expect(within(card).getByTestId('student-var').props.children).toBe('Ana');
    expectHighlight(card, 'is');
    // O peso de base da frase deixa o negrito visível.
    expect(styleOf(within(card).getByText('My name is Ana.')).fontFamily).not.toBe(fontFamily[800]);

    expect(action(NEXT_LABEL)).toBeTruthy();
    expect(screen.queryByTestId('grammar-rules')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('PRÓXIMO: aba 2 com a tabela, anúncio e PRÓXIMO; aba 3 com CONTINUAR, que conclui com viewed', async () => {
    const { advance } = await open();
    await fireEvent.press(action(NEXT_LABEL));
    expect(selectedTabs()).toEqual([GRAMMAR_TABS[1]]);
    expect(announce).toHaveBeenLastCalledWith(GRAMMAR_TABS[1]);
    const rules = screen.getByTestId('grammar-rules');
    expect(within(rules).getByText('only with I')).toBeTruthy();
    expect(within(rules).getByText('I am a student.')).toBeTruthy();
    expect(within(rules).getByText('Ana is from Brazil.')).toBeTruthy();
    expect(styleOf(screen.getByTestId('grammar-rule-is'))).toMatchObject({
      borderTopWidth: size.border,
      borderTopColor: color.line,
    });
    expect(styleOf(screen.getByTestId('grammar-rule-am')).borderTopWidth).toBeUndefined();
    expectHighlight(screen.getByTestId('grammar-rule-am'), 'am');
    expect(screen.queryByText(USED_INTRO)).toBeNull();
    expect(action(NEXT_LABEL)).toBeTruthy();

    await fireEvent.press(action(NEXT_LABEL));
    expect(selectedTabs()).toEqual([GRAMMAR_TABS[2]]);
    expect(announce).toHaveBeenLastCalledWith(GRAMMAR_TABS[2]);
    expectHighlight(screen.getByTestId('grammar-example-alex'), 'is');
    expect(screen.getByText("I'm Alex. My name is Alex.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: NEXT_LABEL })).toBeNull();
    expect(advance).not.toHaveBeenCalled();
    await fireEvent.press(action(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'viewed', xp: 0 });
  });

  it('toque na aba: da 1 direto à 3 (anúncio, CONTINUAR) e de volta à 1 (PRÓXIMO)', async () => {
    const { advance } = await open();
    await fireEvent.press(tab(3));
    expect(selectedTabs()).toEqual([GRAMMAR_TABS[2]]);
    expect(announce).toHaveBeenLastCalledWith(GRAMMAR_TABS[2]);
    expect(action(CONTINUE_LABEL)).toBeTruthy();

    await fireEvent.press(tab(1));
    expect(selectedTabs()).toEqual([GRAMMAR_TABS[0]]);
    expect(announce).toHaveBeenLastCalledWith(GRAMMAR_TABS[0]);
    expect(screen.getByText(USED_INTRO)).toBeTruthy();
    expect(action(NEXT_LABEL)).toBeTruthy();
    expect(screen.queryByRole('button', { name: CONTINUE_LABEL })).toBeNull();
    expect(advance).not.toHaveBeenCalled();
  });

  it('pronome: com `she`, mostra a variante she nas frases e nos exemplos', async () => {
    await visitorStore.setVariable('pronoun', 'she');
    await open();
    expect(screen.getByText('She is from Canada.')).toBeTruthy();
    expect(screen.queryByText('They are from Canada.')).toBeNull();
    await fireEvent.press(tab(3));
    expect(screen.getByText('She is my friend.')).toBeTruthy();
  });

  it('leitor de tela: lista de abas, cada aba com papel tab, rótulo, 48 dp e selected só na ativa', async () => {
    await open();
    expect(screen.getByTestId('grammar-tabs').props.accessibilityRole).toBe('tablist');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((el) => el.props.accessibilityLabel)).toEqual([...GRAMMAR_TABS]);
    for (const el of tabs) expect(styleOf(el).minHeight).toBe(size.touchMin);
    expect(tabs.map((el) => el.props.accessibilityState?.selected)).toEqual([true, false, false]);
    await fireEvent.press(tab(2));
    expect(screen.getAllByRole('tab').map((el) => el.props.accessibilityState?.selected)).toEqual([false, true, false]);
    // O rótulo quebra a linha a 200%: nenhum corte.
    for (const label of GRAMMAR_TABS) expect(screen.getByText(label).props.numberOfLines).toBeUndefined();
  });
});
