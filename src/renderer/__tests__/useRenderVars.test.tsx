import { act, render, screen } from '@testing-library/react-native';

import type { VisitorStore } from '../../visitor/types';
import { RenderedText } from '../RenderedText';
import { useRenderVars } from '../useRenderVars';

/** Loja falsa: `pending` deixa as leituras sem resposta. */
function fakeStore(variables: Record<string, string>) {
  let pending = false;
  const answer = <T,>(value: T) => (pending ? new Promise<T>(() => {}) : Promise.resolve(value));
  const store: VisitorStore = {
    deviceId: () => answer('device'),
    getVariable: async (key) => variables[key] ?? null,
    setVariable: async () => {},
    variables: () => answer(variables),
    progress: () => answer([]),
    recordProgress: async () => {},
    recordReceipt: async () => {},
    receipts: () => answer([]),
    subscribe: () => () => {},
  };
  return { store, stall: () => (pending = true) };
}

function Title({ store }: { store: VisitorStore }) {
  const { vars, pronoun } = useRenderVars(store);
  return <RenderedText text="Hi, {name}!" vars={vars} pronoun={pronoun} />;
}

describe('useRenderVars()', () => {
  it('uma segunda montagem já começa com o nome lido antes, sem passar por {name}', async () => {
    const { store, stall } = fakeStore({ name: 'Ana', pronoun: 'she' });
    const first = await render(<Title store={store} />);
    await act(async () => {});
    expect(screen.getByText('Hi, Ana!')).toBeTruthy();
    await first.unmount();

    stall(); // a nova leitura não responde: só o último estado lido pode dar o nome
    await render(<Title store={store} />);
    expect(screen.getByText('Hi, Ana!')).toBeTruthy();
    expect(screen.queryByText('Hi, {name}!')).toBeNull();
  });
});
