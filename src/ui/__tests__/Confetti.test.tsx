import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { Confetti, CONFETTI_PIECES } from '../Confetti';

afterEach(() => jest.restoreAllMocks());

describe('Confetti (1.20)', () => {
  it('com animações: desenha os papéis, oculto do leitor e sem toque', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    await render(<Confetti />);
    await act(async () => {});
    const box = screen.getByTestId('confetti', { includeHiddenElements: true });
    expect(box.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(box.props.accessibilityElementsHidden).toBe(true);
    expect(box.children).toHaveLength(CONFETTI_PIECES);
  });

  it('"remover animações" ligado: não desenha nada', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<Confetti />);
    await act(async () => {});
    expect(screen.queryByTestId('confetti', { includeHiddenElements: true })).toBeNull();
  });

  it('antes de ler a configuração, e se a leitura falhar: nada', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('sem'));
    await render(<Confetti />);
    expect(screen.queryByTestId('confetti', { includeHiddenElements: true })).toBeNull();
    await act(async () => {});
    expect(screen.queryByTestId('confetti', { includeHiddenElements: true })).toBeNull();
  });
});
