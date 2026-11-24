// Matriz da 1.13 (Diálogo no App): o Diálogo real dentro da moldura, sem rede.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { messageFor, UNKNOWN_ERROR } from '../../api/errors';
import { STUDENT_QUERY_KEY, type StudentProfile } from '../../auth/student';
import * as sentry from '../../observability/sentry';
import { visitorStore } from '../../visitor/store';
import { clearVisitorCache } from '../../visitor/useVisitor';
import { PlayerFrame } from '../PlayerFrame';
import { PlayerSessionContext, VISITOR_SESSION } from '../playerSession';
import type { ActivityResult, ActivityView, FooterAction, SheetSpec } from '../registry';
import {
  CONTINUE_LABEL,
  COUNTRIES,
  COUNTRY_LABEL,
  DialogueActivity,
  NAME_LABEL,
  NAME_MAX,
  validName,
} from '../types/DialogueActivity';

jest.mock('../../observability/sentry', () => {
  const actual = jest.requireActual('../../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

type DialogueView = Extract<ActivityView, { type: 'dialogue' }>;
type Line = DialogueView['lines'][number];

const dialogue = (lines: Line[]): DialogueView => ({
  activityKey: 'meet-alex',
  type: 'dialogue',
  title: 'Meet Alex',
  lines,
});

const THREE = dialogue([
  { lineKey: 'l1', speaker: 'Alex', text: 'Hi!' },
  { lineKey: 'l2', speaker: 'Alex', text: "I'm Alex." },
  { lineKey: 'l3', speaker: 'Sam', text: 'Welcome!' },
]);

const ASK_NAME = dialogue([
  { lineKey: 'l1', speaker: 'Alex', text: 'Hi!' },
  { lineKey: 'l2', speaker: 'Alex', text: "What's your name?", ask: 'name' },
  { lineKey: 'l3', speaker: 'Alex', text: 'Nice to meet you, {name}!' },
]);

const ASK_COUNTRY = dialogue([
  { lineKey: 'l1', speaker: 'Alex', text: 'Where are you from?', ask: 'country' },
  { lineKey: 'l2', speaker: 'Alex', text: '{country}? Cool!' },
]);

const ASK_BOTH = dialogue([
  { lineKey: 'l1', speaker: 'Alex', text: "What's your name?", ask: 'name' },
  { lineKey: 'l2', speaker: 'Alex', text: 'Hi, {name}! Where are you from?', ask: 'country' },
  { lineKey: 'l3', speaker: 'Alex', text: "Let's start." },
]);

function Harness({ activity, advance }: { activity: ActivityView; advance: jest.Mock }) {
  const [footer, setFooter] = useState<FooterAction | null>(null);
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const frame = (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PlayerFrame
        stageNumber={1}
        stageTitle="Meet & Greet"
        position={1}
        total={4}
        xp={0}
        online
        footer={footer}
        sheet={sheet}
        onClose={jest.fn()}
        contentKey={activity.activityKey}
        bleed={DialogueActivity.bleed}
      >
        <DialogueActivity
          activity={activity}
          versionId="v1"
          setFooter={setFooter}
          setSheet={setSheet}
          advance={advance}
        />
      </PlayerFrame>
    </SafeAreaProvider>
  );
  if (!studentClient) return frame;
  return (
    <QueryClientProvider client={studentClient}>
      <PlayerSessionContext.Provider value={{ ...VISITOR_SESSION, mode: 'student' }}>
        {frame}
      </PlayerSessionContext.Provider>
    </QueryClientProvider>
  );
}

/** Com um cliente, o Diálogo roda no modo Aluno (2.9), com o perfil no cache. */
let studentClient: QueryClient | null = null;

let reduceMotion = true;

async function open(activity: ActivityView) {
  const advance = jest.fn<void, [ActivityResult?]>();
  await render(<Harness activity={activity} advance={advance} />);
  // A leitura do "remover animações" e da loja é assíncrona.
  await act(async () => {});
  return { advance };
}

const button = () => screen.getByRole('button', { name: CONTINUE_LABEL });
const line = (key: string) => screen.queryByTestId(`dialogue-line-${key}`);
const shownLines = () => screen.queryAllByTestId(/^dialogue-line-l\d$/).map((el) => el.props.testID as string);
const country = (code: string) => screen.getByTestId(`dialogue-country-${code}`);

beforeEach(() => {
  global.__resetSqlite();
  clearVisitorCache();
  reduceMotion = true;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(async () => reduceMotion);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  global.fetch = jest.fn() as jest.Mock;
  studentClient = null;
  (sentry.captureError as jest.Mock).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Diálogo: cena e falas', () => {
  it('cena do quarto com Alex wave e um balão por fala, com o falante', async () => {
    await open(THREE);
    expect(screen.getByTestId('dialogue-scene')).toBeTruthy();
    expect(screen.getByTestId('alex-wave', { includeHiddenElements: true })).toBeTruthy();
    expect(shownLines()).toEqual(['dialogue-line-l1', 'dialogue-line-l2', 'dialogue-line-l3']);
    expect(within(line('l3')!).getByText('Sam')).toBeTruthy();
    expect(within(line('l3')!).getByText('Welcome!')).toBeTruthy();
  });

  it('sem pergunta: as falas entram a 0, 650 e 1300 ms; depois, CONTINUAR liberado e conclui com viewed', async () => {
    reduceMotion = false;
    jest.useFakeTimers();
    const { advance } = await open(THREE);
    expect(shownLines()).toEqual(['dialogue-line-l1']);
    expect(button()).toBeDisabled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(649);
    });
    expect(shownLines()).toHaveLength(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(shownLines()).toHaveLength(2);
    expect(button()).toBeDisabled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(650);
    });
    expect(shownLines()).toHaveLength(3);
    expect(button()).toBeEnabled();
    await fireEvent.press(button());
    expect(advance).toHaveBeenCalledWith({ outcome: 'viewed', xp: 0 });
  });

  it('remover animações: as falas entram todas juntas, sem esperar', async () => {
    jest.useFakeTimers();
    await open(THREE);
    expect(shownLines()).toHaveLength(3);
    expect(button()).toBeEnabled();
  });

  it('o leitor de tela anuncia cada fala nova, com o falante', async () => {
    reduceMotion = false;
    jest.useFakeTimers();
    const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;
    announce.mockClear();
    await open(THREE);
    expect(announce).toHaveBeenLastCalledWith('Alex: Hi!');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(650);
    });
    expect(announce).toHaveBeenLastCalledWith("Alex: I'm Alex.");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(650);
    });
    expect(announce).toHaveBeenLastCalledWith('Sam: Welcome!');
    expect(announce).toHaveBeenCalledTimes(3);
    // A fala tem o próprio rótulo, em texto puro.
    expect(screen.getByLabelText('Sam: Welcome!')).toBeTruthy();
  });
});

describe('Diálogo: pergunta do nome', () => {
  it('pausa na fala com ask; CONTINUAR grava o nome e mostra a fala seguinte com ele, em ouro; depois conclui', async () => {
    const { advance } = await open(ASK_NAME);
    expect(shownLines()).toEqual(['dialogue-line-l1', 'dialogue-line-l2']);
    const field = screen.getByLabelText(NAME_LABEL);
    expect(field.props.autoFocus).toBe(true);
    expect(field.props.maxLength).toBe(NAME_MAX);
    expect(button()).toBeDisabled();
    await fireEvent.changeText(field, '  Ana ');
    expect(button()).toBeEnabled();
    await fireEvent.press(button());
    expect(await visitorStore.getVariable('name')).toBe('Ana');
    await waitFor(() => expect(screen.getByTestId('student-var').props.children).toBe('Ana'));
    // A resposta vira a página: as falas de antes saem da cena.
    expect(shownLines()).toEqual(['dialogue-line-l3']);
    expect(screen.queryByLabelText(NAME_LABEL)).toBeNull();
    expect(advance).not.toHaveBeenCalled();
    await fireEvent.press(button());
    expect(advance).toHaveBeenCalledWith({ outcome: 'viewed', xp: 0 });
  });

  it('com animações: depois de CONTINUAR na pergunta, a cena vira a página e a fala seguinte entra na hora', async () => {
    reduceMotion = false;
    jest.useFakeTimers();
    await open(ASK_NAME);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(650);
    });
    expect(shownLines()).toEqual(['dialogue-line-l1', 'dialogue-line-l2']);
    await fireEvent.changeText(screen.getByLabelText(NAME_LABEL), 'Ana');
    await fireEvent.press(button());
    await act(async () => {});
    expect(await visitorStore.getVariable('name')).toBe('Ana');
    expect(shownLines()).toEqual(['dialogue-line-l3']);
    expect(button()).toBeEnabled();
  });

  it('enviar pelo teclado: nome válido grava e retoma; vazio ou inválido não faz nada', async () => {
    await open(ASK_NAME);
    const field = () => screen.getByLabelText(NAME_LABEL);
    await fireEvent.changeText(field(), '   ');
    await fireEvent(field(), 'submitEditing');
    await fireEvent.changeText(field(), 'a'.repeat(41));
    await fireEvent(field(), 'submitEditing');
    expect(await visitorStore.getVariable('name')).toBeNull();
    expect(shownLines()).toHaveLength(2);
    await fireEvent.changeText(field(), 'Ana');
    await fireEvent(field(), 'submitEditing');
    expect(await visitorStore.getVariable('name')).toBe('Ana');
    await waitFor(() => expect(shownLines()).toEqual(['dialogue-line-l3']));
  });

  it('gravar o nome falha: vai ao Sentry, a pergunta fica com a mensagem no rodapé, que some na nova tentativa', async () => {
    const failure = new Error('disco cheio');
    const save = jest.spyOn(visitorStore, 'setVariable').mockRejectedValue(failure);
    await open(ASK_NAME);
    await fireEvent.changeText(screen.getByLabelText(NAME_LABEL), 'Ana');
    await fireEvent.press(button());
    expect(sentry.captureError).toHaveBeenCalledWith(failure);
    expect(await screen.findByText(messageFor(UNKNOWN_ERROR))).toBeTruthy();
    expect(button()).toBeEnabled();
    expect(button().props.accessibilityState).not.toMatchObject({ busy: true });
    expect(line('l3')).toBeNull();
    expect(screen.getByLabelText(NAME_LABEL)).toBeTruthy();

    save.mockRestore();
    await fireEvent.press(button());
    await waitFor(() => expect(line('l3')).toBeTruthy());
    expect(screen.queryByText(messageFor(UNKNOWN_ERROR))).toBeNull();
  });

  it('nome vazio ou só espaços: CONTINUAR desabilitado', async () => {
    await open(ASK_NAME);
    await fireEvent.changeText(screen.getByLabelText(NAME_LABEL), '');
    expect(button()).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText(NAME_LABEL), '    ');
    expect(button()).toBeDisabled();
  });

  it('nome com 41 caracteres: CONTINUAR desabilitado; 40 vale', async () => {
    await open(ASK_NAME);
    await fireEvent.changeText(screen.getByLabelText(NAME_LABEL), 'a'.repeat(41));
    expect(button()).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText(NAME_LABEL), 'a'.repeat(40));
    expect(button()).toBeEnabled();
    expect(validName(` ${'a'.repeat(40)} `)).toBe(true);
    expect(validName('a'.repeat(41))).toBe(false);
  });

  it('nome já salvo: o campo vem com ele e CONTINUAR já está liberado', async () => {
    await visitorStore.setVariable('name', 'Ana');
    await open(ASK_NAME);
    await waitFor(() => expect(screen.getByLabelText(NAME_LABEL).props.value).toBe('Ana'));
    expect(button()).toBeEnabled();
  });
});

describe('Diálogo: pergunta do país', () => {
  it('chips em inglês, um por país da countries.json, escolha única; grava o name em inglês', async () => {
    await open(ASK_COUNTRY);
    expect(screen.getByText(COUNTRY_LABEL)).toBeTruthy();
    expect(screen.queryAllByTestId(/^dialogue-country-/)).toHaveLength(COUNTRIES.length);
    expect(button()).toBeDisabled();
    await fireEvent.press(country('BR'));
    expect(country('BR').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(country('CA'));
    expect(country('CA').props.accessibilityState).toMatchObject({ selected: true });
    expect(country('BR').props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getAllByRole('button', { selected: true }).filter((el) => el !== button())).toHaveLength(1);
    await fireEvent.press(button());
    expect(await visitorStore.getVariable('country')).toBe('Canada');
    await waitFor(() => expect(screen.getByTestId('student-var').props.children).toBe('Canada'));
  });

  it('país já salvo: o chip vem selecionado', async () => {
    await visitorStore.setVariable('country', 'Brazil');
    await open(ASK_COUNTRY);
    await waitFor(() => expect(country('BR').props.accessibilityState).toMatchObject({ selected: true }));
    expect(button()).toBeEnabled();
  });
});

describe('Diálogo: as duas perguntas', () => {
  it('cada pergunta pausa na sua vez; a resposta só fica no aparelho, sem rede', async () => {
    const { advance } = await open(ASK_BOTH);
    expect(shownLines()).toEqual(['dialogue-line-l1']);
    expect(screen.queryByTestId('dialogue-ask-country')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText(NAME_LABEL), 'Ana');
    await fireEvent.press(button());
    await waitFor(() => expect(shownLines()).toEqual(['dialogue-line-l2']));
    expect(screen.queryByLabelText(NAME_LABEL)).toBeNull();
    expect(screen.getByTestId('dialogue-ask-country')).toBeTruthy();
    expect(button()).toBeDisabled();
    await fireEvent.press(country('BR'));
    await fireEvent.press(button());
    await waitFor(() => expect(shownLines()).toEqual(['dialogue-line-l3']));
    expect(screen.queryByTestId('dialogue-ask-country')).toBeNull();
    await fireEvent.press(button());
    expect(advance).toHaveBeenCalledWith({ outcome: 'viewed', xp: 0 });
    expect(await visitorStore.variables()).toMatchObject({ name: 'Ana', country: 'Brazil' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('Diálogo do Aluno (2.9)', () => {
  const PROFILE: StudentProfile = {
    email: 'ana@exemplo.test',
    name: 'Ana',
    country: null,
    pronounSet: null,
    emailConfirmed: true,
    emailConfirmationOverdue: false,
    status: 'ACTIVE',
  };

  function asStudent(profile: StudentProfile = PROFILE) {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
    studentClient = new QueryClient();
    studentClient.setQueryData(STUDENT_QUERY_KEY, profile);
  }

  const bodies = () =>
    (global.fetch as jest.Mock).mock.calls.map(([url, init]: [string, RequestInit]) => ({
      url: String(url),
      method: init.method,
      body: JSON.parse(String(init.body)),
    }));

  it('ask name com perfil "Ana": campo pré-preenchido; CONTINUAR faz o PUT e atualiza o cache', async () => {
    asStudent();
    (global.fetch as jest.Mock).mockResolvedValue(new Response(null, { status: 204 }));
    await open(ASK_NAME);
    expect(screen.getByLabelText(NAME_LABEL).props.value).toBe('Ana');
    await fireEvent.changeText(screen.getByLabelText(NAME_LABEL), 'Bia');
    await fireEvent.press(button());
    await waitFor(() => expect(line('l3')).toBeTruthy());
    expect(bodies()).toEqual([
      {
        url: 'https://api.exemplo.test/api/v1/students/me/dialogue-answers',
        method: 'PUT',
        body: { versionId: 'v1', activityKey: 'meet-alex', name: 'Bia' },
      },
    ]);
    expect(studentClient!.getQueryData<StudentProfile>(STUDENT_QUERY_KEY)?.name).toBe('Bia');
    expect(await visitorStore.variables()).not.toHaveProperty('name');
  });

  it('conta sem nome: o campo vem vazio, sem a Variável do aparelho (de outro Visitante); o PUT invalida o painel', async () => {
    await visitorStore.setVariable('name', 'Zé');
    asStudent({ ...PROFILE, name: null });
    studentClient!.setQueryData(['student', 'dashboard'], { name: null });
    (global.fetch as jest.Mock).mockResolvedValue(new Response(null, { status: 204 }));
    await open(ASK_NAME);
    expect(screen.getByLabelText(NAME_LABEL).props.value).toBe('');
    expect(button()).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText(NAME_LABEL), 'Bia');
    await fireEvent.press(button());
    await waitFor(() => expect(line('l3')).toBeTruthy());
    expect(studentClient!.getQueryState(['student', 'dashboard'])?.isInvalidated).toBe(true);
  });

  it('desmontado durante o PUT: sem avançar nem mudar estado', async () => {
    asStudent();
    let answer!: (response: Response) => void;
    (global.fetch as jest.Mock).mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    const { advance } = await open(ASK_NAME);
    await fireEvent.press(button());
    await act(async () => screen.unmount());
    await act(async () => answer(new Response(null, { status: 204 })));
    expect(advance).not.toHaveBeenCalled();
    // Depois do PUT, o cache recebe o valor mesmo com a tela fechada.
    expect(studentClient!.getQueryData<StudentProfile>(STUDENT_QUERY_KEY)?.name).toBe('Ana');
  });

  it('ask country: o país da conta vem selecionado e vai no PUT', async () => {
    asStudent({ ...PROFILE, country: 'Brazil' });
    (global.fetch as jest.Mock).mockResolvedValue(new Response(null, { status: 204 }));
    await open(ASK_COUNTRY);
    expect(country('BR').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(button());
    await waitFor(() => expect(line('l2')).toBeTruthy());
    expect(bodies()[0]!.body).toEqual({ versionId: 'v1', activityKey: 'meet-alex', country: 'Brazil' });
  });

  it('PUT falha: messageFor do código, a pergunta fica e nada vai ao aparelho', async () => {
    asStudent();
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ code: 'TOO_MANY_REQUESTS' }), {
        status: 429,
        headers: { 'Content-Type': 'application/problem+json' },
      }),
    );
    await open(ASK_NAME);
    await fireEvent.press(button());
    expect(await screen.findByText(messageFor('TOO_MANY_REQUESTS'))).toBeTruthy();
    expect(line('l3')).toBeNull();
    expect(screen.getByLabelText(NAME_LABEL)).toBeTruthy();
    expect(studentClient!.getQueryData<StudentProfile>(STUDENT_QUERY_KEY)?.name).toBe('Ana');
    expect(sentry.captureError).not.toHaveBeenCalled();
  });

  it('Visitante: só no aparelho, nenhuma requisição com nome ou país', async () => {
    const { advance } = await open(ASK_BOTH);
    await fireEvent.changeText(screen.getByLabelText(NAME_LABEL), 'Ana');
    await fireEvent.press(button());
    await waitFor(() => expect(screen.getByTestId('dialogue-ask-country')).toBeTruthy());
    await fireEvent.press(country('BR'));
    await fireEvent.press(button());
    await waitFor(() => expect(shownLines()).toEqual(['dialogue-line-l3']));
    await fireEvent.press(button());
    expect(advance).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
