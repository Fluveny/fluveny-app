import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import openapi from '../../api/openapi.json';
import { styleOf } from '../../test-utils/kit';
import { color, size } from '../../ui/tokens';
import { ActivityTransition } from '../ActivityTransition';
import { PendingActivity } from '../PendingActivity';
import { CLOSE_LABEL, OFFLINE_LABEL, PlayerFrame, type PlayerFrameProps } from '../PlayerFrame';
import { PENDING, registry, resolveActivity, type ActivityProps } from '../registry';
import { ChoiceActivity } from '../types/ChoiceActivity';

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function frame(props: Partial<PlayerFrameProps> = {}) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PlayerFrame
        stageNumber={1}
        stageTitle="Meet & Greet"
        position={2}
        total={13}
        xp={30}
        online
        footer={{ label: 'VERIFICAR', disabled: true, onPress: jest.fn() }}
        onClose={jest.fn()}
        contentKey="a2"
        {...props}
      >
        {Array.from({ length: 30 }, (_, i) => (
          <Text key={i}>linha {i}</Text>
        ))}
      </PlayerFrame>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(() => jest.restoreAllMocks());

describe('PlayerFrame', () => {
  it('Atividade incompleta: o rodapé fica desabilitado; topo e rodapé ficam fora da rolagem', async () => {
    await render(frame());
    expect(screen.getByRole('button', { name: 'VERIFICAR' })).toBeDisabled();
    const content = screen.getByTestId('player-content');
    expect(within(content).queryByTestId('player-top')).toBeNull();
    expect(within(content).queryByTestId('player-footer')).toBeNull();
    expect(within(content).getByText('linha 29')).toBeTruthy();
    expect(screen.getByTestId('player-top')).toBeTruthy();
    expect(screen.getByTestId('player-footer')).toBeTruthy();
  });

  it('topo: ✕ "Sair" de 48 dp em muted, barra de posição e XP; linha "ESTÁGIO 1 · …" e "n DE m"', async () => {
    const onClose = jest.fn();
    await render(frame({ onClose }));
    const close = screen.getByRole('button', { name: CLOSE_LABEL });
    expect(styleOf(close).minHeight).toBeGreaterThanOrEqual(size.touchMin);
    expect(styleOf(close).width).toBe(size.touchMin);
    expect(screen.getByLabelText('30 XP')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 15 });
    expect(screen.getByText('ESTÁGIO 1 · Meet & Greet')).toBeTruthy();
    expect(screen.getByText('2 DE 13')).toBeTruthy();
    const icon = within(close).getByTestId('icon-x', { includeHiddenElements: true });
    // O react-native-svg guarda a cor como ARGB: 0xFF + o hex do token.
    const argb = (hex: string) => String(parseInt(`FF${hex.slice(1)}`, 16));
    expect(JSON.stringify(icon)).toContain(`"payload":${argb(color.muted)}`);
    expect(JSON.stringify(icon)).not.toContain(argb(color.faint));
    await fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('rodapé liberado: o rótulo, o disabled e o onPress vêm da Atividade', async () => {
    const onPress = jest.fn();
    await render(frame({ footer: { label: 'CONTINUAR', onPress } }));
    await fireEvent.press(screen.getByRole('button', { name: 'CONTINUAR' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('sem rede: faixa no topo e "SEM CONEXÃO" desabilitado por cima da ação da Atividade', async () => {
    const onPress = jest.fn();
    await render(frame({ online: false, footer: { label: 'CONTINUAR', onPress } }));
    expect(screen.getByTestId('status-banner')).toBeTruthy();
    const action = screen.getByRole('button', { name: OFFLINE_LABEL });
    expect(action).toBeDisabled();
    await fireEvent.press(action);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ActivityTransition', () => {
  it('fade com subida de 12 dp em 260 ms a cada Atividade nova', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const { rerender } = await render(
      <ActivityTransition id="a1">
        <Text>a1</Text>
      </ActivityTransition>,
    );
    await act(async () => {});
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: 260 }));
    const calls = timing.mock.calls.length;
    await rerender(
      <ActivityTransition id="a2">
        <Text>a2</Text>
      </ActivityTransition>,
    );
    expect(timing.mock.calls.length).toBe(calls + 1);
    const style = styleOf(screen.getByTestId('activity-transition'));
    expect(style.transform).toBeDefined();
  });

  it('com "remover animações": instantânea, sem animar', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const timing = jest.spyOn(Animated, 'timing');
    const { rerender } = await render(
      <ActivityTransition id="a1">
        <Text>a1</Text>
      </ActivityTransition>,
    );
    await act(async () => {});
    timing.mockClear();
    await rerender(
      <ActivityTransition id="a2">
        <Text>a2</Text>
      </ActivityTransition>,
    );
    expect(timing).not.toHaveBeenCalled();
    expect(styleOf(screen.getByTestId('activity-transition')).opacity).toBe(1);
  });
});

describe('registry', () => {
  it('a Escolha (1.11) usa o componente do Vocab Mode', () => {
    expect(registry.choice).toBe(ChoiceActivity);
    expect(resolveActivity('choice')).toBe(ChoiceActivity);
  });

  it('todo `type` do ActivityStudentView do openapi.json está no registro', () => {
    type Schema = { $ref?: string; oneOf?: Schema[]; discriminator?: { mapping?: Record<string, string> } };
    const schemas = (
      openapi as unknown as {
        components: { schemas: Record<string, Schema & { properties?: Record<string, { enum?: string[] }> }> };
      }
    ).components.schemas;
    const union = schemas.ActivityStudentView!;
    const types = new Set(Object.keys(union.discriminator?.mapping ?? {}));
    for (const variant of union.oneOf ?? []) {
      const name = variant.$ref?.split('/').pop() ?? '';
      for (const type of schemas[name]?.properties?.type?.enum ?? []) types.add(type);
    }
    expect(types.size).toBeGreaterThan(0);
    const missing = [...types].filter((type) => !Object.prototype.hasOwnProperty.call(registry, type));
    expect(missing).toEqual([]);
  });

  it('um Tipo PENDING cai no cartão "em preparação"', () => {
    expect(resolveActivity('choice', { choice: PENDING })).toBe(PendingActivity);
  });

  it('Tipo desconhecido também cai no cartão, e um Tipo com componente usa o dele', () => {
    const Custom = (_: ActivityProps) => null;
    expect(resolveActivity('drop-the-lyrics')).toBe(PendingActivity);
    expect(resolveActivity('toString')).toBe(PendingActivity);
    expect(resolveActivity('choice', { choice: Custom })).toBe(Custom);
  });
});
