// Matriz da 1.14 (App): o trecho de Expressão Útil tocável e a folha de dicionário.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text } from 'react-native';

import { color } from '../../ui/tokens';
import { EXPRESSION_CLOSE_LABEL, EXPRESSION_EYEBROW, EXPRESSION_SCRIM_LABEL } from '../../ui';
import { visitorStore } from '../../visitor/store';
import { clearVisitorCache } from '../../visitor/useVisitor';
import { EXPRESSION_HINT, type UsefulExpression } from '../expressions';
import { ExpressionsProvider } from '../ExpressionsProvider';
import { RenderedText } from '../RenderedText';

const EXPRESSIONS: UsefulExpression[] = [
  {
    expressionKey: 'nice-to-meet-you',
    term: 'Nice to meet you',
    meaning: 'Prazer em conhecer você.',
    examples: ['Hi, {name}! Nice to meet you.', 'Nice to meet you too!'],
  },
];

const styleOf = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) ?? {};

/** Uma "Atividade" com estado próprio, para provar que a folha não a remonta nem a muda. */
function Picker({ text }: { text: string }) {
  const [picked, setPicked] = useState('nada');
  return (
    <>
      <RenderedText text={text} vars={{ name: 'Ana' }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Escolher B" onPress={() => setPicked('B')}>
        <Text>Escolher</Text>
      </Pressable>
      <Text testID="picked">{picked}</Text>
    </>
  );
}

async function open(text: string, disabled = false) {
  const view = await render(
    <ExpressionsProvider expressions={EXPRESSIONS} disabled={disabled}>
      <Picker text={text} />
    </ExpressionsProvider>,
  );
  await act(async () => {});
  return view;
}

/** O `Modal` da folha: o ancestral com `onRequestClose`. */
function modalOf() {
  let node = screen.getByTestId('expression-sheet-root').parent;
  while (node && typeof node.props.onRequestClose !== 'function') node = node.parent;
  if (!node) throw new Error('Modal da folha não encontrado');
  return node;
}

const sheetOpen = () => screen.queryByTestId('expression-sheet') !== null;

beforeEach(() => {
  global.__resetSqlite();
  clearVisitorCache();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

describe('trecho de Expressão Útil (1.14)', () => {
  it('na Escolha: "Nice" azul sobre blueLt, sublinhado pontilhado, botão com a dica; toque abre a folha', async () => {
    await open('Alex says "[[Nice|nice-to-meet-you]]!"');
    const chunk = screen.getByTestId('expression-nice-to-meet-you');
    expect(chunk.props.accessibilityRole).toBe('button');
    expect(chunk.props.accessibilityHint).toBe(EXPRESSION_HINT);
    expect(EXPRESSION_HINT).toBe('Opens the meaning of the expression');
    expect(styleOf(chunk)).toEqual({
      backgroundColor: color.blueLt,
      color: color.blue,
      textDecorationLine: 'underline',
      textDecorationStyle: 'dotted',
      textDecorationColor: color.blue,
    });
    expect(screen.getByText('Alex says "Nice!"')).toBeTruthy();
    expect(sheetOpen()).toBe(false);

    await fireEvent.press(chunk);
    expect(sheetOpen()).toBe(true);
    expect(screen.getByText(EXPRESSION_EYEBROW)).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Nice to meet you' })).toBeTruthy();
    expect(screen.getByText('Prazer em conhecer você.')).toBeTruthy();
    expect(screen.getByText('Nice to meet you too!')).toBeTruthy();
    expect(screen.getByTestId('icon-book', { includeHiddenElements: true })).toBeTruthy();
  });

  it('exemplos com {name}: resolvidos com as Variáveis do Aluno, em ouro', async () => {
    await visitorStore.setVariable('name', 'Júlia');
    await open('[[Nice|nice-to-meet-you]]');
    await fireEvent.press(screen.getByTestId('expression-nice-to-meet-you'));
    expect(screen.getByText('Hi, Júlia! Nice to meet you.')).toBeTruthy();
  });

  it('chave desconhecida: "X" como texto comum, sem botão', async () => {
    await open('Say [[X|nao-existe]] now.');
    expect(screen.getByText('Say X now.')).toBeTruthy();
    expect(screen.queryByTestId('expression-nao-existe')).toBeNull();
    expect(screen.queryByRole('button', { name: 'X' })).toBeNull();
  });

  it('fora do provider: texto comum, sem botão', async () => {
    await render(<RenderedText text="[[Nice|nice-to-meet-you]]" />);
    expect(screen.queryByTestId('expression-nice-to-meet-you')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('rótulo com negrito e variável: um só trecho tocável', async () => {
    await open('[[**Nice**, {name}|nice-to-meet-you]]!');
    const chunks = screen.getAllByTestId('expression-nice-to-meet-you');
    expect(chunks).toHaveLength(1);
    expect(screen.getByTestId('student-var').props.children).toBe('Ana');
  });

  it.each([
    ['GOT IT', async () => fireEvent.press(screen.getByRole('button', { name: EXPRESSION_CLOSE_LABEL }))],
    [
      'toque no scrim',
      async () => {
        // O leitor de tela fica na folha (accessibilityViewIsModal); o scrim é para o toque.
        const scrim = screen.getByTestId('expression-sheet-scrim', { includeHiddenElements: true });
        expect(scrim.props.accessibilityLabel).toBe(EXPRESSION_SCRIM_LABEL);
        await fireEvent.press(scrim);
      },
    ],
    ['voltar do Android (onRequestClose)', async () => act(async () => modalOf().props.onRequestClose())],
  ])('fecha com %s, e a Atividade mantém a seleção', async (_how, close) => {
    await open('[[Nice|nice-to-meet-you]]');
    await fireEvent.press(screen.getByRole('button', { name: 'Escolher B' }));
    const before = screen.getByTestId('picked');
    await fireEvent.press(screen.getByTestId('expression-nice-to-meet-you'));
    expect(sheetOpen()).toBe(true);
    await close();
    expect(sheetOpen()).toBe(false);
    // Mesmo nó (sem remontar) e mesmo estado.
    expect(screen.getByTestId('picked')).toBe(before);
    expect(screen.getByTestId('picked').props.children).toBe('B');
  });

  it('com a folha de feedback aberta (disabled): trechos sem toque, nunca duas folhas', async () => {
    await open('[[Nice|nice-to-meet-you]]', true);
    const chunk = screen.getByTestId('expression-nice-to-meet-you');
    expect(chunk.props.accessibilityRole).toBeUndefined();
    expect(chunk.props.onPress).toBeUndefined();
    await fireEvent.press(chunk);
    expect(sheetOpen()).toBe(false);
  });

  it('a outra folha abre com a de dicionário aberta: esta fecha e não volta sozinha', async () => {
    const view = await open('[[Nice|nice-to-meet-you]]');
    await fireEvent.press(screen.getByTestId('expression-nice-to-meet-you'));
    expect(sheetOpen()).toBe(true);
    const rerender = (disabled: boolean) =>
      view.rerender(
        <ExpressionsProvider expressions={EXPRESSIONS} disabled={disabled}>
          <Picker text="[[Nice|nice-to-meet-you]]" />
        </ExpressionsProvider>,
      );
    await rerender(true);
    expect(sheetOpen()).toBe(false);
    await rerender(false);
    expect(sheetOpen()).toBe(false);
  });
});
