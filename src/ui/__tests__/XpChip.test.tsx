import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';

import { XpChip, XpChipLight } from '../XpChip';
import { color } from '../tokens';
import { styleOf } from '../../test-utils/kit';

let spring: jest.SpyInstance;

beforeEach(() => {
  spring = jest.spyOn(Animated, 'spring');
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(() => jest.restoreAllMocks());

const settle = () => act(async () => {});

describe('XpChip (UX-DR31)', () => {
  it('mostra o total e o anuncia como "N XP"', async () => {
    await render(<XpChip xp={30} />);
    expect(screen.getByLabelText('30 XP')).toBeTruthy();
    expect(screen.getByText('30 XP')).toBeTruthy();
    expect(styleOf(screen.getByTestId('xp-chip')).backgroundColor).toBe(color.red);
  });

  it('XP sobe (10 → 20): pula; cai ou repete: não pula', async () => {
    const { rerender } = await render(<XpChip xp={10} />);
    await settle();
    expect(spring).not.toHaveBeenCalled();
    await rerender(<XpChip xp={20} />);
    expect(spring).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('20 XP')).toBeTruthy();
    await rerender(<XpChip xp={20} />);
    await rerender(<XpChip xp={10} />);
    expect(spring).toHaveBeenCalledTimes(1);
  });

  it('com "remover animações", não pula', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const { rerender } = await render(<XpChip xp={10} />);
    await settle();
    await rerender(<XpChip xp={20} />);
    expect(spring).not.toHaveBeenCalled();
    expect(screen.getByLabelText('20 XP')).toBeTruthy();
  });
});

describe('XpChipLight (UX-DR32)', () => {
  it('"+N" em gold-text sobre gold-lt, anunciado como "+N XP"', async () => {
    await render(<XpChipLight gain={10} />);
    const chip = screen.getByLabelText('+10 XP');
    expect(styleOf(chip).backgroundColor).toBe(color.goldLt);
    expect(styleOf(screen.getByText('+10')).color).toBe(color.goldText);
    expect(chip.props.accessibilityLiveRegion).toBe('polite');
  });
});
