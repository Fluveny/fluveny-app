import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';

import { STUDENT_QUERY_KEY } from '../../auth/student';

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
    seen: async () => false,
    markSeen: async () => {},
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

describe('useRenderVars() com o Aluno da sessão (2.1)', () => {
  function Sentence({ store }: { store: VisitorStore }) {
    const { vars, pronoun } = useRenderVars(store);
    return (
      <RenderedText
        text={{ he: '{name}: he is here.', she: '{name}: she is here.', they: '{name}: they are here.' }}
        vars={vars}
        pronoun={pronoun}
      />
    );
  }

  it('o nome e o pronome da conta vencem os do aparelho; sem pronome na conta, they', async () => {
    const { store } = fakeStore({ name: 'Zé', pronoun: 'he', country: 'BR' });
    // Sem gc: o timer de coleta seguraria o jest aberto.
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    client.setQueryData(STUDENT_QUERY_KEY, { email: 'ana@exemplo.test', name: 'Ana', pronounSet: 'SHE' });
    await render(
      <QueryClientProvider client={client}>
        <Sentence store={store} />
      </QueryClientProvider>,
    );
    await act(async () => {});
    expect(screen.getByText('Ana: she is here.')).toBeTruthy();

    await act(async () => client.setQueryData(STUDENT_QUERY_KEY, { email: 'ana@exemplo.test', pronounSet: null }));
    expect(screen.getByText('Zé: they are here.')).toBeTruthy();

    await act(async () => client.setQueryData(STUDENT_QUERY_KEY, null));
    expect(screen.getByText('Zé: he is here.')).toBeTruthy();
    client.clear();
  });
});
