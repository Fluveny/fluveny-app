// Matriz da 1.14 (App): a Expressão Útil destacada, com as Expressões da Unidade.
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import * as sentry from '../../observability/sentry';
import { ExpressionsProvider, type UsefulExpression } from '../../renderer';
import { clearVisitorCache } from '../../visitor/useVisitor';
import { PlayerFrame } from '../PlayerFrame';
import { registry, resolveActivity, type ActivityResult, type ActivityView, type FooterAction } from '../registry';
import { CONTINUE_LABEL, ExpressionActivity } from '../types/ExpressionActivity';

jest.mock('../../observability/sentry', () => {
  const actual = jest.requireActual('../../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

type ExpressionView = Extract<ActivityView, { type: 'expression' }>;

const EXPRESSIONS: UsefulExpression[] = [
  { expressionKey: 'looks-like', term: 'Looks like', meaning: 'Parece que.', examples: ['It looks like rain.'] },
  { expressionKey: 'roommates', term: 'Roommates', meaning: 'Colegas de quarto.', examples: ['My roommate is nice.'] },
];

const expression = (sentence: string): ExpressionView => ({
  activityKey: 'words-expression',
  type: 'expression',
  title: 'Roommates',
  speaker: 'Alex',
  sentence,
});

const ONE = expression("It [[looks like|looks-like]] we're here.");
const TWO = expression("It [[looks like|looks-like]] we're [[roommates|roommates]].");

function Harness({ activity, advance }: { activity: ActivityView; advance: jest.Mock }) {
  const [footer, setFooter] = useState<FooterAction | null>(null);
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ExpressionsProvider expressions={EXPRESSIONS}>
        <PlayerFrame
          stageNumber={1}
          stageTitle="Meet & Greet"
          position={3}
          total={6}
          xp={0}
          online
          footer={footer}
          onClose={jest.fn()}
          contentKey={activity.activityKey}
        >
          <ExpressionActivity
            activity={activity}
            versionId="v1"
            setFooter={setFooter}
            setSheet={jest.fn()}
            advance={advance}
          />
        </PlayerFrame>
      </ExpressionsProvider>
    </SafeAreaProvider>
  );
}

async function open(activity: ActivityView) {
  const advance = jest.fn<void, [ActivityResult?]>();
  await render(<Harness activity={activity} advance={advance} />);
  await act(async () => {});
  return { advance };
}

const card = () => screen.getByTestId('expression-activity-card');
const term = () => within(card()).getByTestId('expression-activity-card-term');

beforeEach(() => {
  global.__resetSqlite();
  clearVisitorCache();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  (sentry.captureError as jest.Mock).mockClear();
});

let announce: jest.SpyInstance;
afterEach(() => jest.restoreAllMocks());

describe('Expressão Útil destacada (1.14)', () => {
  it('o registro liga `expression` ao componente', () => {
    expect(registry.expression).toBe(ExpressionActivity);
    expect(resolveActivity('expression')).toBe(ExpressionActivity);
  });

  it('1 termo: Alex diz a frase, sem chips, e o cartão do termo fica fixo', async () => {
    await open(ONE);
    expect(screen.getByTestId('alex-avatar')).toBeTruthy();
    expect(screen.getByText("It looks like we're here.")).toBeTruthy();
    expect(screen.queryByTestId('expression-chips')).toBeNull();
    expect(term()).toHaveTextContent('Looks like', { exact: true });
    expect(within(card()).getByText('Parece que.')).toBeTruthy();
  });

  it('2 termos: chips na ordem da frase; toque no chip ou no termo troca o cartão, sem abrir a folha', async () => {
    await open(TWO);
    const chips = within(screen.getByTestId('expression-chips')).getAllByRole('button');
    expect(chips.map((chip) => chip.props.accessibilityLabel)).toEqual(['Looks like', 'Roommates']);
    expect(screen.getByTestId('expression-chip-looks-like').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(within(card()).getByText('Parece que.')).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('expression-chip-roommates'));
    expect(term()).toHaveTextContent('Roommates', { exact: true });
    expect(within(card()).getByText('Colegas de quarto.')).toBeTruthy();
    expect(announce).toHaveBeenLastCalledWith('Roommates');
    expect(screen.getByTestId('expression-chip-roommates').props.accessibilityState).toMatchObject({
      selected: true,
    });

    // O termo da frase é botão com a dica, mas só troca o termo ativo.
    const inSentence = screen.getByTestId('expression-looks-like');
    expect(inSentence.props.accessibilityRole).toBe('button');
    await fireEvent.press(inSentence);
    expect(term()).toHaveTextContent('Looks like', { exact: true });
    expect(within(card()).getByText('Parece que.')).toBeTruthy();
    expect(announce).toHaveBeenLastCalledWith('Looks like');
    expect(screen.queryByTestId('expression-sheet')).toBeNull();
  });

  it('termo que a Unidade não conhece: texto comum, sem chip nem cartão dele', async () => {
    await open(expression('Hi, [[stranger|nao-existe]] and [[roommates|roommates]]!'));
    expect(screen.queryByTestId('expression-nao-existe')).toBeNull();
    expect(screen.queryByTestId('expression-chips')).toBeNull();
    expect(within(card()).getByText('Colegas de quarto.')).toBeTruthy();
  });

  it('frase malformada (sem a variante they): sem cartão nem chips, CONTINUAR fica e o erro vai ao Sentry', async () => {
    const broken = { ...ONE, sentence: { he: '[[He|looks-like]] is here.', she: '[[She|looks-like]] is here.' } };
    const { advance } = await open(broken as unknown as ExpressionView);
    expect(screen.queryByTestId('expression-activity-card')).toBeNull();
    expect(screen.queryByTestId('expression-chips')).toBeNull();
    expect(sentry.captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('they') }),
    );
    await fireEvent.press(screen.getByRole('button', { name: CONTINUE_LABEL }));
    expect(advance).toHaveBeenCalledWith({ outcome: 'viewed', xp: 0 });
  });

  it('CONTINUAR conclui com viewed', async () => {
    const { advance } = await open(ONE);
    await fireEvent.press(screen.getByRole('button', { name: CONTINUE_LABEL }));
    expect(advance).toHaveBeenCalledWith({ outcome: 'viewed', xp: 0 });
  });
});
