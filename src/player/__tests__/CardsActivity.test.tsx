// Matriz da 1.14 (App): os Cartões de expressões dentro da moldura, sem rede.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { clearVisitorCache } from '../../visitor/useVisitor';
import { PlayerFrame } from '../PlayerFrame';
import { registry, resolveActivity, type ActivityResult, type ActivityView, type FooterAction } from '../registry';
import { blockLine, CardsActivity, CONTINUE_LABEL, NEXT_BLOCK_LABEL } from '../types/CardsActivity';

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

type CardsView = Extract<ActivityView, { type: 'cards' }>;

const THREE: CardsView = {
  activityKey: 'greetings-cards',
  type: 'cards',
  title: 'Greetings & Introductions',
  blocks: [
    { blockKey: 'b1', emoji: '👋', title: 'Saying hello', items: [{ itemKey: 'i1', text: 'Hi! / Hello!' }] },
    { blockKey: 'b2', title: 'Introducing yourself', items: [{ itemKey: 'i2', text: "Hi, I'm {name}." }] },
    { blockKey: 'b3', emoji: '🤝', title: 'Being polite', items: [{ itemKey: 'i3', text: 'Nice to meet you.' }] },
  ],
};

function Harness({ activity, advance }: { activity: ActivityView; advance: jest.Mock }) {
  const [footer, setFooter] = useState<FooterAction | null>(null);
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PlayerFrame
        stageNumber={1}
        stageTitle="Meet & Greet"
        position={2}
        total={6}
        xp={0}
        online
        footer={footer}
        onClose={jest.fn()}
        contentKey={activity.activityKey}
      >
        <CardsActivity
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

async function open(activity: ActivityView = THREE) {
  const advance = jest.fn<void, [ActivityResult?]>();
  await render(<Harness activity={activity} advance={advance} />);
  await act(async () => {});
  return { advance };
}

const action = (label: string) => screen.getByRole('button', { name: label });
const segment = (n: number) => screen.getByTestId(`cards-segment-${n}`);

beforeEach(() => {
  global.__resetSqlite();
  clearVisitorCache();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

let announce: jest.SpyInstance;
afterEach(() => jest.restoreAllMocks());

describe('Cartões de expressões (1.14)', () => {
  it('o registro liga `cards` ao componente', () => {
    expect(registry.cards).toBe(CardsActivity);
    expect(resolveActivity('cards')).toBe(CardsActivity);
  });

  it('3 blocos: "Bloco 1 de 3" + PRÓXIMO BLOCO; no 3, CONTINUAR conclui com viewed', async () => {
    const { advance } = await open();
    expect(screen.getByText('Greetings & Introductions')).toBeTruthy();
    expect(screen.getByText(blockLine(1, 3))).toBeTruthy();
    expect(screen.getByText('Saying hello')).toBeTruthy();
    expect(screen.getByText('👋', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Hi! / Hello!')).toBeTruthy();
    expect(screen.queryByText('Introducing yourself')).toBeNull();
    // A entrada não é anunciada; a troca de bloco é (VoiceOver e web).
    expect(announce).not.toHaveBeenCalled();

    await fireEvent.press(action(NEXT_BLOCK_LABEL));
    expect(screen.getByText('Bloco 2 de 3')).toBeTruthy();
    expect(announce).toHaveBeenLastCalledWith('Bloco 2 de 3');
    // Sem emoji: só o título e os itens.
    expect(screen.getByText('Introducing yourself')).toBeTruthy();
    expect(screen.queryByText('👋', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText("Hi, I'm {name}.")).toBeTruthy();

    await fireEvent.press(action(NEXT_BLOCK_LABEL));
    expect(screen.getByText('Bloco 3 de 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: NEXT_BLOCK_LABEL })).toBeNull();
    expect(advance).not.toHaveBeenCalled();
    await fireEvent.press(action(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'viewed', xp: 0 });
  });

  it('voltar bloco: no 3, o segmento 1 mostra o bloco 1; segmento não visto não responde', async () => {
    await open();
    expect(segment(2)).toBeDisabled();
    await fireEvent.press(segment(3));
    expect(screen.getByText('Bloco 1 de 3')).toBeTruthy();

    await fireEvent.press(action(NEXT_BLOCK_LABEL));
    await fireEvent.press(action(NEXT_BLOCK_LABEL));
    expect(screen.getByText('Bloco 3 de 3')).toBeTruthy();
    expect(segment(3).props.accessibilityState).toMatchObject({ selected: true });

    await fireEvent.press(segment(1));
    expect(screen.getByText('Bloco 1 de 3')).toBeTruthy();
    expect(screen.getByText('Saying hello')).toBeTruthy();
    expect(announce).toHaveBeenLastCalledWith('Bloco 1 de 3');
    // Fora do último, o rodapé volta a PRÓXIMO BLOCO; os vistos continuam tocáveis.
    expect(action(NEXT_BLOCK_LABEL)).toBeTruthy();
    expect(segment(3)).toBeEnabled();
    await fireEvent.press(segment(3));
    expect(screen.getByText('Bloco 3 de 3')).toBeTruthy();
  });

  it('um bloco só: sem indicador, e CONTINUAR direto', async () => {
    const { advance } = await open({ ...THREE, blocks: THREE.blocks.slice(0, 1) });
    expect(screen.queryByTestId('cards-segments')).toBeNull();
    await fireEvent.press(action(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'viewed', xp: 0 });
  });
});
