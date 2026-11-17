import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';

import { styleOf } from '../../test-utils/kit';
import { EXPRESSION_EYEBROW } from '../ExpressionCard';
import { EXPRESSION_CLOSE_LABEL, ExpressionSheet } from '../ExpressionSheet';

const EXPRESSION = {
  expressionKey: 'im-new-here',
  term: "I'm new here",
  meaning: 'Usado quando você acabou de chegar.',
  examples: ["Sorry, I'm new here."],
};

let announce: jest.SpyInstance;
let focus: jest.SpyInstance;

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

async function open(onClose = jest.fn()) {
  await render(<ExpressionSheet expression={EXPRESSION} onClose={onClose} />);
  await act(async () => {});
  return onClose;
}

describe('ExpressionSheet (1.14)', () => {
  it('fechada: não desenha a folha', async () => {
    await render(<ExpressionSheet expression={null} onClose={jest.fn()} />);
    expect(screen.queryByTestId('expression-sheet')).toBeNull();
  });

  it('o cartão rola dentro da folha; ENTENDI fica fora da rolagem e fecha', async () => {
    const onClose = await open();
    const body = screen.getByTestId('expression-sheet-body');
    expect(within(body).getByText('Usado quando você acabou de chegar.')).toBeTruthy();
    expect(within(body).queryByRole('button', { name: EXPRESSION_CLOSE_LABEL })).toBeNull();
    expect(styleOf(body)).toEqual(expect.objectContaining({ flexShrink: 1 }));
    await fireEvent.press(screen.getByRole('button', { name: EXPRESSION_CLOSE_LABEL }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ao abrir, o foco vai para o termo e o leitor anuncia (UX-DR135)', async () => {
    await open();
    expect(announce).toHaveBeenCalledWith(`${EXPRESSION_EYEBROW}: I'm new here`);
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
  });

  it('sobe com mola', async () => {
    const spring = jest.spyOn(Animated, 'spring');
    await open();
    expect(spring).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0 }));
  });

  it('com "remover animações": aparece direto, sem mola', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const spring = jest.spyOn(Animated, 'spring');
    await open();
    expect(spring).not.toHaveBeenCalled();
    const transform = styleOf(screen.getByTestId('expression-sheet')).transform as { translateY: number }[];
    expect(transform[0]?.translateY).toBe(0);
  });
});
