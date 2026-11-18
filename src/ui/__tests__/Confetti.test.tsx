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

  it('a mudança chega antes da leitura inicial: a leitura antiga não a sobrescreve', async () => {
    let resolveRead: (value: boolean) => void = () => {};
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockReturnValue(new Promise<boolean>((resolve) => (resolveRead = resolve)));
    let onChange: (value: boolean) => void = () => {};
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, handler) => {
      onChange = handler as (value: boolean) => void;
      return { remove: () => {} } as ReturnType<typeof AccessibilityInfo.addEventListener>;
    });
    await render(<Confetti />);
    // Ligou "remover animações" antes de a leitura (antiga, sem a preferência) voltar.
    await act(async () => onChange(true));
    await act(async () => resolveRead(false));
    expect(screen.queryByTestId('confetti', { includeHiddenElements: true })).toBeNull();
  });
});
