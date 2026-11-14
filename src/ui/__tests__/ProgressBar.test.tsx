import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';

import { motion } from '../motion';
import { clampProgress, ProgressBar } from '../ProgressBar';
import { overlay, size } from '../tokens';
import { styleOf } from '../../test-utils/kit';

let timing: jest.SpyInstance;

beforeEach(() => {
  timing = jest.spyOn(Animated, 'timing');
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(() => jest.restoreAllMocks());

describe('ProgressBar (UX-DR33)', () => {
  it.each([
    [0, 0],
    [0.5, 50],
    [1, 100],
    [-0.4, 0],
    [1.7, 100],
    [Number.NaN, 0],
  ])('valor %p: limitado a 0–1, progressbar com now = %p e preenchimento ≥ 26 px', async (value, now) => {
    await render(<ProgressBar value={value} accessibilityLabel="Posição no Estágio" />);
    const bar = screen.getByRole('progressbar', { name: 'Posição no Estágio' });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now });
    expect(styleOf(bar).height).toBe(size.progressHeight);
    expect(styleOf(screen.getByTestId('progress-bar-fill')).minWidth).toBe(size.progressMinFill);
  });

  it('clampProgress', () => {
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(0.3)).toBe(0.3);
    expect(clampProgress(2)).toBe(1);
    expect(clampProgress(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('anima em 450 ms ao mudar de valor', async () => {
    const { rerender } = await render(<ProgressBar value={0.2} />);
    timing.mockClear();
    await rerender(<ProgressBar value={0.6} />);
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0.6, duration: motion.progressMs }));
  });

  it('com "remover animações", pula direto para o valor', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const { rerender } = await render(<ProgressBar value={0.2} />);
    await act(async () => {});
    timing.mockClear();
    await rerender(<ProgressBar value={0.6} />);
    expect(timing).not.toHaveBeenCalled();
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(60);
    expect(styleOf(screen.getByTestId('progress-bar-fill')).width).toBe('60%');
  });

  it('brilho branco a 40% dentro do terço superior', async () => {
    await render(<ProgressBar value={0.5} />);
    const fill = screen.getByTestId('progress-bar-fill');
    const highlight = fill.children[0] as unknown as { props: Record<string, unknown> };
    const s = styleOf(highlight);
    expect(s.backgroundColor).toBe(overlay.progressHighlight);
    expect(Number(s.top) + Number(s.height)).toBeLessThanOrEqual(size.progressHeight / 3);
  });
});
