// Matriz da 1.15 (Fala "It's your turn"): a Fala real dentro da moldura, com o
// reconhecimento simulado (jest.setup.js) e a API pelo corretor do mock.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as React from 'react';
import { useState } from 'react';
import { AccessibilityInfo, AppState, Linking, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { messageFor, NETWORK_ERROR } from '../../api/errors';
import { PRIVACY_LINK, PRIVACY_PATH, TERMS_LINK, TERMS_PATH } from '../../legal/paths';
import { mockResponse } from '../../api/mocks/handlers';
import { mockRoutes, resetMockVisitorRecords } from '../../api/mocks/routes';
import {
  FEEDBACK_TITLES,
  MIC_IDLE_CAPTION,
  MIC_LABEL,
  MIC_LISTENING_CAPTION,
  MIC_STOP_LABEL,
  MIC_UNAVAILABLE_CAPTION,
} from '../../ui';
import { color } from '../../ui/tokens';
import { visitorStore } from '../../visitor/store';
import { clearVisitorCache } from '../../visitor/useVisitor';
import { PlayerFrame } from '../PlayerFrame';
import { heardLine } from '../PlayerSheet';
import type { ActivityResult, ActivityView, FooterAction, SheetSpec } from '../registry';
import {
  ALLOW_MIC_LABEL,
  PRIVACY_OK_LABEL,
  PRIVACY_SEEN_KEY,
  PRIVACY_TEXT,
  SKIP_LABEL,
  SpeechActivity,
} from '../types/SpeechActivity';
import { CONTINUE_LABEL, RETRY_LABEL, REVEAL_LABEL } from '../useEvaluation';
import { CAPTURE_MESSAGE, NETWORK_MESSAGE, SILENCE_MESSAGE, SILENCE_MS } from '../useSpeechRecognition';

jest.mock('../../observability/sentry', () => {
  const actual = jest.requireActual('../../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const STAGE = mockRoutes['/api/v1/units/{unitKey}/stages/{stageKey}'].get(new Request('http://mock')).data;
const SPEECH = STAGE.activities.find((activity) => activity.type === 'speech')!;

const bodies: Record<string, unknown>[] = [];

/** A API pelo mock; `fail` troca a resposta da Tentativa. */
function api(fail?: () => Response | undefined) {
  bodies.length = 0;
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    bodies.push(JSON.parse(String(init?.body)));
    const failure = url.endsWith('/visitor/attempts') ? fail?.() : undefined;
    if (failure) return failure;
    const route = url.endsWith('/reveal') ? '/api/v1/visitor/attempts/reveal' : '/api/v1/visitor/attempts';
    return mockResponse(mockRoutes[route].post, new Request(url, init));
  }) as jest.Mock;
}

function Harness({ activity, advance }: { activity: ActivityView; advance: jest.Mock }) {
  const [footer, setFooter] = useState<FooterAction | null>(null);
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PlayerFrame
        stageNumber={1}
        stageTitle="Meet & Greet"
        position={7}
        total={7}
        xp={0}
        online
        footer={footer}
        sheet={sheet}
        onClose={jest.fn()}
        contentKey={activity.activityKey}
        bleed
      >
        <SpeechActivity
          activity={activity}
          versionId={STAGE.versionId}
          setFooter={setFooter}
          setSheet={setSheet}
          advance={advance}
        />
      </PlayerFrame>
    </SafeAreaProvider>
  );
}

async function open({
  seen = true,
  advance = jest.fn<void | Promise<void>, [ActivityResult?]>(),
}: { seen?: boolean; advance?: jest.Mock } = {}) {
  await visitorStore.setVariable('name', 'Ana');
  if (seen) await visitorStore.markSeen(PRIVACY_SEEN_KEY);
  const view = await render(<Harness activity={SPEECH} advance={advance} />);
  await act(async () => {});
  return { advance, unmount: view.unmount };
}

const button = (name: string) => screen.getByRole('button', { name });
const caption = () => screen.getByTestId('mic-caption');
const pressMic = async () => fireEvent.press(screen.getByTestId('mic'));
const attempts = () => bodies.filter((body) => body.answer !== undefined);
/** O rodapé é o botão primário (azul) ou o link (sem fundo)? */
const footerIsPrimary = () =>
  (StyleSheet.flatten(screen.getByTestId('player-action').props.style) as { backgroundColor?: string })
    .backgroundColor === color.blue;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  global.__resetSqlite();
  global.__speech.reset();
  jest.clearAllMocks();
  clearVisitorCache();
  resetMockVisitorRecords();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  api();
});

afterEach(() => jest.restoreAllMocks());

describe('Fala: tela', () => {
  it('Alex em listen, título, enunciado, alvo com o nome em ouro e o microfone com rótulo e legenda', async () => {
    await open();
    expect(screen.getByTestId('alex-listen')).toBeTruthy();
    expect(screen.getByText(SPEECH.title as string)).toBeTruthy();
    expect(screen.getByText(SPEECH.prompt as string)).toBeTruthy();
    expect(screen.getByTestId('speech-target')).toHaveTextContent("Hi Alex, I'm Ana.");
    expect(screen.getAllByTestId('student-var').map((node) => node.props.children)).toEqual(['Ana']);
    expect(button(MIC_LABEL)).toBeEnabled();
    expect(caption()).toHaveTextContent(MIC_IDLE_CAPTION);
    // O pular é um link no rodapé, sempre visível até haver Resultado.
    expect(button(SKIP_LABEL)).toBeEnabled();
    expect(footerIsPrimary()).toBe(false);
  });
});

describe('Fala: aviso de privacidade', () => {
  it('primeira vez: a folha nomeia quem transcreve; ENTENDI grava o flag e pede a permissão', async () => {
    await open({ seen: false });
    expect(screen.getByTestId('speech-privacy')).toBeTruthy();
    expect(screen.getByText(PRIVACY_TEXT.android)).toBeTruthy();
    expect(global.__speech.module.requestPermissionsAsync).not.toHaveBeenCalled();
    await fireEvent.press(button(PRIVACY_OK_LABEL));
    await act(async () => {});
    expect(screen.queryByTestId('speech-privacy')).toBeNull();
    expect(global.__speech.module.requestPermissionsAsync).toHaveBeenCalled();
    expect(await visitorStore.seen(PRIVACY_SEEN_KEY)).toBe(true);
    // O flag é da loja, não uma Variável do Aluno.
    expect(await visitorStore.variables()).toEqual({ name: 'Ana' });
    expect(button(MIC_LABEL)).toBeEnabled();
  });

  it('no web, o texto fala do navegador', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await open({ seen: false });
    expect(screen.getByText(PRIVACY_TEXT.web)).toBeTruthy();
  });

  it('já viu: sem folha', async () => {
    await open();
    expect(screen.queryByTestId('speech-privacy')).toBeNull();
  });

  it('pular no aviso: "Não posso falar agora" conclui como pulada, sem XP, e fecha a folha', async () => {
    const { advance } = await open({ seen: false });
    await fireEvent.press(screen.getByTestId('speech-privacy-decline'));
    expect(advance).toHaveBeenCalledWith({ outcome: 'skipped', xp: 0 });
    expect(screen.queryByTestId('speech-privacy')).toBeNull();
    expect(await visitorStore.seen(PRIVACY_SEEN_KEY)).toBe(false);
  });

  it('links da política e dos termos: fecham a folha sem decidir e abrem o documento', async () => {
    const navigate = jest.spyOn(router, 'navigate').mockImplementation(() => {});
    await open({ seen: false });
    expect(button(PRIVACY_LINK)).toBeTruthy();
    expect(button(TERMS_LINK)).toBeTruthy();
    await fireEvent.press(button(PRIVACY_LINK));
    expect(navigate).toHaveBeenCalledWith(PRIVACY_PATH);
    await waitFor(() => expect(screen.queryByTestId('speech-privacy')).toBeNull());
    expect(await visitorStore.seen(PRIVACY_SEEN_KEY)).toBe(false);
    expect(global.__speech.module.requestPermissionsAsync).not.toHaveBeenCalled();
    // Na volta, o microfone abre a folha de novo; dela, os termos.
    await pressMic();
    await fireEvent.press(button(TERMS_LINK));
    expect(navigate).toHaveBeenCalledWith(TERMS_PATH);
  });

  it('fechar a folha sem decidir: o toque no microfone a abre de novo, sem ouvir', async () => {
    await open({ seen: false });
    await act(async () => screen.getByTestId('speech-privacy-root').parent?.props.onRequestClose?.());
    await waitFor(() => expect(screen.queryByTestId('speech-privacy')).toBeNull());
    await pressMic();
    expect(screen.getByTestId('speech-privacy')).toBeTruthy();
    expect(global.__speech.module.start).not.toHaveBeenCalled();
  });
});

describe('Fala: Tentativa', () => {
  it('falar: en-US, sem parciais; envia o nome como token; Acerto com "A gente ouviu" e XP', async () => {
    const { advance } = await open();
    await pressMic();
    expect(global.__speech.module.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en-US', interimResults: false, continuous: false }),
    );
    expect(global.__speech.module.start!.mock.calls[0][0]).not.toHaveProperty('recordingOptions');
    expect(caption()).toHaveTextContent(MIC_LISTENING_CAPTION);
    await act(async () => global.__speech.finish("hi alex i'm ana"));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(attempts()).toHaveLength(1);
    expect(attempts()[0]!.answer).toEqual({ type: 'speech', transcript: "hi alex i'm {name}" });
    // O nome nunca vai para a API.
    expect(JSON.stringify(bodies)).not.toMatch(/\bana\b/i);
    expect(screen.getByTestId('sheet-heard')).toHaveTextContent(heardLine("hi alex i'm ana"));
    expect(screen.getByLabelText('+10 XP')).toBeTruthy();
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'completed', xp: 10, resultPct: 100 });
    expect(await visitorStore.receipts()).toEqual([{ activityKey: SPEECH.activityKey, receipt: expect.any(String) }]);
  });

  it('segundo toque: encerra e usa o que foi transcrito', async () => {
    await open();
    await pressMic();
    global.__speech.hear('hello alex my name is ana');
    await pressMic();
    expect(global.__speech.module.stop).toHaveBeenCalled();
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(attempts()[0]!.answer).toEqual({ type: 'speech', transcript: 'hello alex my name is {name}' });
  });

  it('Erro: TENTAR DE NOVO volta ao microfone, sem o pular; o Acerto depois não dá XP', async () => {
    const { advance } = await open();
    await pressMic();
    await act(async () => global.__speech.finish('hi'));
    expect(await screen.findByText(FEEDBACK_TITLES.wrong)).toBeTruthy();
    expect(screen.getByTestId('sheet-heard')).toHaveTextContent(heardLine('hi'));
    expect(button(REVEAL_LABEL)).toBeTruthy();
    await fireEvent.press(button(RETRY_LABEL));
    expect(screen.queryByTestId('feedback-sheet')).toBeNull();
    expect(caption()).toHaveTextContent(MIC_IDLE_CAPTION);
    // Já há Resultado: o pular some.
    expect(screen.queryByRole('button', { name: SKIP_LABEL })).toBeNull();
    await pressMic();
    await act(async () => global.__speech.finish("Hi Alex, I'm Ana."));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(screen.queryByLabelText('+10 XP')).toBeNull();
    await fireEvent.press(button(CONTINUE_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'completed', xp: 0, resultPct: 0 });
  });

  it('VER RESPOSTA encerra com a frase-alvo renderizada', async () => {
    await open();
    await pressMic();
    await act(async () => global.__speech.finish('good night'));
    await fireEvent.press(await screen.findByRole('button', { name: REVEAL_LABEL }));
    expect(await screen.findByText(FEEDBACK_TITLES.review)).toBeTruthy();
    expect(screen.getByTestId('feedback-expected')).toHaveTextContent(/Hi Alex, I'm Ana\.$/);
  });

  it('silêncio: nada em 7 s para, volta ao início com a mensagem e não conta como tentativa', async () => {
    const timeout = jest.spyOn(global, 'setTimeout');
    await open();
    await pressMic();
    const index = timeout.mock.calls.findIndex(([, delay]) => delay === SILENCE_MS);
    expect(index).toBeGreaterThanOrEqual(0);
    // Os 7 s passam: o teste chama o callback e desarma o relógio de verdade.
    clearTimeout(timeout.mock.results[index]!.value as ReturnType<typeof setTimeout>);
    await act(async () => (timeout.mock.calls[index]![0] as () => void)());
    expect(global.__speech.module.abort).toHaveBeenCalled();
    expect(caption()).toHaveTextContent(SILENCE_MESSAGE);
    expect(attempts()).toHaveLength(0);
    expect(button(SKIP_LABEL)).toBeEnabled();
    // O fim pelo silêncio sem texto também volta com a mensagem.
    await pressMic();
    expect(caption()).toHaveTextContent(MIC_LISTENING_CAPTION);
    await act(async () => global.__speech.finish());
    expect(caption()).toHaveTextContent(SILENCE_MESSAGE);
    expect(attempts()).toHaveLength(0);
  });

  it('falha do envio: a mensagem fica no rodapé e o microfone volta', async () => {
    api(() => {
      throw new TypeError('Network request failed');
    });
    await open();
    await pressMic();
    await act(async () => global.__speech.finish("hi alex i'm ana"));
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    expect(screen.queryByTestId('feedback-sheet')).toBeNull();
    expect(button(MIC_LABEL)).toBeEnabled();
  });
});

describe('Fala: pular e microfone indisponível', () => {
  it('o link "Não posso falar agora" pula, parando o microfone', async () => {
    const { advance } = await open();
    await pressMic();
    await fireEvent.press(button(SKIP_LABEL));
    expect(global.__speech.module.abort).toHaveBeenCalled();
    expect(advance).toHaveBeenCalledWith({ outcome: 'skipped', xp: 0 });
  });

  it('permissão negada: microfone cinza com a legenda, pular primário e "Permitir microfone"', async () => {
    global.__speech.set({ request: { granted: false, canAskAgain: false, status: 'denied' } });
    const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const { advance } = await open({ seen: false });
    await fireEvent.press(button(PRIVACY_OK_LABEL));
    await act(async () => {});
    expect(button(MIC_LABEL)).toBeDisabled();
    expect(caption()).toHaveTextContent(MIC_UNAVAILABLE_CAPTION);
    expect(footerIsPrimary()).toBe(true);
    await fireEvent.press(button(ALLOW_MIC_LABEL));
    expect(settings).toHaveBeenCalled();
    await fireEvent.press(button(SKIP_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'skipped', xp: 0 });
  });

  it('permissão negada de vez antes: indisponível já ao abrir, sem folha', async () => {
    global.__speech.set({ permission: { granted: false, canAskAgain: false, status: 'denied' } });
    await open({ seen: false });
    expect(button(MIC_LABEL)).toBeDisabled();
    expect(screen.queryByTestId('speech-privacy')).toBeNull();
    expect(button(ALLOW_MIC_LABEL)).toBeTruthy();
  });

  it('sem Web Speech API (Firefox): microfone cinza, pular primário, sem folha nem "Permitir microfone"', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    global.__speech.set({ available: false });
    await open({ seen: false });
    expect(button(MIC_LABEL)).toBeDisabled();
    expect(caption()).toHaveTextContent(MIC_UNAVAILABLE_CAPTION);
    expect(footerIsPrimary()).toBe(true);
    expect(screen.queryByTestId('speech-privacy')).toBeNull();
    expect(screen.queryByRole('button', { name: ALLOW_MIC_LABEL })).toBeNull();
  });

  it('o navegador recusa o microfone ao ouvir (not-allowed): fica indisponível, sem Tentativa', async () => {
    await open();
    await pressMic();
    await act(async () => global.__speech.error('not-allowed'));
    expect(button(MIC_LABEL)).toBeDisabled();
    expect(attempts()).toHaveLength(0);
  });

  it('Android com reconhecimento no aparelho: pede requiresOnDeviceRecognition', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    global.__speech.set({ onDevice: true });
    await open();
    await pressMic();
    expect(global.__speech.module.start).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: true }),
    );
  });
});

/** O relógio de silêncio da sessão em curso: o id e o callback. */
function silenceTimer(timeout: jest.SpyInstance) {
  const index = timeout.mock.calls.map(([, delay]) => delay).lastIndexOf(SILENCE_MS);
  expect(index).toBeGreaterThanOrEqual(0);
  return { id: timeout.mock.results[index]!.value, fire: timeout.mock.calls[index]![0] as () => void };
}

describe('Fala: revisão (silêncio, sessões, erros)', () => {
  it('fala longa: o som e a fala param o relógio de 7 s; o resultado chega depois e vira Tentativa', async () => {
    const timeout = jest.spyOn(global, 'setTimeout');
    const clear = jest.spyOn(global, 'clearTimeout');
    await open();
    await pressMic();
    const { id } = silenceTimer(timeout);
    await act(async () => global.__speech.emit('speechstart', null));
    expect(clear).toHaveBeenCalledWith(id);
    expect(caption()).toHaveTextContent(MIC_LISTENING_CAPTION);
    // Passados os 7 s, nada é abortado: o aluno ainda fala.
    expect(global.__speech.module.abort).not.toHaveBeenCalled();
    await act(async () => global.__speech.finish("hi alex i'm ana and i'm very happy to be here today"));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
    expect(attempts()).toHaveLength(1);
  });

  it('o end atrasado da sessão abortada não encerra a sessão nova', async () => {
    const timeout = jest.spyOn(global, 'setTimeout');
    global.__speech.set({ lateAbort: true });
    await open();
    await pressMic();
    const first = silenceTimer(timeout);
    clearTimeout(first.id);
    await act(async () => first.fire());
    expect(caption()).toHaveTextContent(SILENCE_MESSAGE);
    // Novo toque: a sessão nova espera o end da abortada.
    await pressMic();
    expect(global.__speech.module.start).toHaveBeenCalledTimes(1);
    await act(async () => global.__speech.emit('end', null));
    await waitFor(() => expect(global.__speech.module.start).toHaveBeenCalledTimes(2));
    expect(caption()).toHaveTextContent(MIC_LISTENING_CAPTION);
    // O resultado e o fim da sessão nova valem.
    await act(async () => global.__speech.finish("hi alex i'm ana"));
    expect(await screen.findByText(FEEDBACK_TITLES.correct)).toBeTruthy();
  });

  it('desmontar enquanto pede a permissão: o reconhecedor não começa', async () => {
    global.__speech.set({ permission: { granted: false, canAskAgain: true, status: 'undetermined' } });
    let grant: (value: unknown) => void = () => {};
    global.__speech.module.requestPermissionsAsync!.mockImplementationOnce(
      () => new Promise((resolve) => (grant = resolve)),
    );
    const { unmount } = await open();
    await pressMic();
    await unmount();
    await act(async () => grant({ granted: true, canAskAgain: true, status: 'granted' }));
    expect(global.__speech.module.start).not.toHaveBeenCalled();
  });

  it('desmontar ouvindo aborta o reconhecedor', async () => {
    const { unmount } = await open();
    await pressMic();
    await unmount();
    expect(global.__speech.module.abort).toHaveBeenCalled();
  });

  it('Android sem o modelo en-US no aparelho: tenta de novo online, sem ficar indisponível', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    global.__speech.set({ onDevice: true });
    await open();
    await pressMic();
    await act(async () => global.__speech.error('language-not-supported'));
    expect(global.__speech.module.start).toHaveBeenCalledTimes(2);
    expect(global.__speech.module.start).toHaveBeenLastCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: false }),
    );
    expect(caption()).toHaveTextContent(MIC_LISTENING_CAPTION);
    expect(button(MIC_STOP_LABEL)).toBeEnabled();
  });

  it.each(['not-allowed', 'service-not-allowed', 'language-not-supported'])(
    'erro %s ao ouvir: microfone indisponível e o pular primário',
    async (code) => {
      await open();
      await pressMic();
      await act(async () => global.__speech.error(code));
      expect(button(MIC_LABEL)).toBeDisabled();
      expect(caption()).toHaveTextContent(MIC_UNAVAILABLE_CAPTION);
      expect(footerIsPrimary()).toBe(true);
      expect(attempts()).toHaveLength(0);
    },
  );

  it.each([
    ['network', NETWORK_MESSAGE],
    ['audio-capture', CAPTURE_MESSAGE],
    ['no-speech', SILENCE_MESSAGE],
  ])('erro %s: volta ao início com o aviso certo, sem Tentativa', async (code, message) => {
    await open();
    await pressMic();
    await act(async () => global.__speech.error(code));
    expect(caption()).toHaveTextContent(message);
    expect(button(MIC_LABEL)).toBeEnabled();
    expect(attempts()).toHaveLength(0);
  });

  it('start() lança: o aviso de captura, e o microfone volta', async () => {
    global.__speech.set({ startThrows: true });
    await open();
    await pressMic();
    expect(caption()).toHaveTextContent(CAPTURE_MESSAGE);
    expect(button(MIC_LABEL)).toBeEnabled();
  });

  it('rótulo: "toque para parar" ouvindo', async () => {
    await open();
    await pressMic();
    expect(button(MIC_STOP_LABEL)).toBeEnabled();
    expect(screen.getByTestId('mic').props.accessibilityState).toMatchObject({ selected: true, disabled: false });
  });

  it('depois de um Resultado, o microfone ficou indisponível: o pular volta como primário', async () => {
    const { advance } = await open();
    await pressMic();
    await act(async () => global.__speech.finish('hi'));
    await fireEvent.press(await screen.findByRole('button', { name: RETRY_LABEL }));
    expect(screen.queryByRole('button', { name: SKIP_LABEL })).toBeNull();
    await pressMic();
    await act(async () => global.__speech.error('not-allowed'));
    expect(footerIsPrimary()).toBe(true);
    await fireEvent.press(button(SKIP_LABEL));
    expect(advance).toHaveBeenCalledWith({ outcome: 'skipped', xp: 0 });
  });

  it('falha do envio numa Tentativa seguinte: a mensagem aparece na legenda', async () => {
    await open();
    await pressMic();
    await act(async () => global.__speech.finish('hi'));
    await fireEvent.press(await screen.findByRole('button', { name: RETRY_LABEL }));
    api(() => {
      throw new TypeError('Network request failed');
    });
    await pressMic();
    await act(async () => global.__speech.finish("hi alex i'm ana"));
    await waitFor(() => expect(caption()).toHaveTextContent(messageFor(NETWORK_ERROR)));
  });

  it('pulando: o microfone trava até a conclusão terminar', async () => {
    let finish: () => void = () => {};
    const advance = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await open({ advance });
    await fireEvent.press(button(SKIP_LABEL));
    expect(screen.getByTestId('mic').props.accessibilityState).toMatchObject({ disabled: true });
    await pressMic();
    expect(global.__speech.module.start).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(button(MIC_LABEL)).toBeEnabled();
  });

  it('ENTENDI tocado duas vezes pede a permissão uma vez só; o scrim não fecha o aviso', async () => {
    await open({ seen: false });
    expect(screen.queryByTestId('speech-privacy-scrim')).toBeNull();
    const ok = button(PRIVACY_OK_LABEL);
    await fireEvent.press(ok);
    await fireEvent.press(ok);
    await act(async () => {});
    expect(global.__speech.module.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('voltou das configurações com a permissão concedida: o microfone volta', async () => {
    const listeners: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
    global.__speech.set({ permission: { granted: false, canAskAgain: false, status: 'denied' } });
    await open();
    expect(button(MIC_LABEL)).toBeDisabled();
    global.__speech.set({ permission: { granted: true, canAskAgain: true, status: 'granted' } });
    await act(async () => listeners.forEach((listener) => listener('active')));
    expect(button(MIC_LABEL)).toBeEnabled();
    await pressMic();
    expect(global.__speech.module.start).toHaveBeenCalled();
  });
});

describe('Fala: sem o módulo nativo', () => {
  it('o require que lança deixa o microfone indisponível, sem quebrar', async () => {
    let useSpeech: typeof import('../useSpeechRecognition').useSpeechRecognition = () => {
      throw new Error('não carregou');
    };
    let speechModule: () => unknown = () => undefined;
    // A simulação já instanciada no jest.setup.js venceria o doMock: o registro recomeça
    // (último teste do arquivo), com o mesmo React da árvore.
    jest.resetModules();
    jest.isolateModules(() => {
      jest.doMock('react', () => React);
      jest.doMock('expo-speech-recognition', () => {
        throw new Error('Cannot find native module ExpoSpeechRecognition');
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ useSpeechRecognition: useSpeech, speechModule } = require('../useSpeechRecognition'));
      // O require lazy acontece aqui, com o mock que lança; o `null` fica guardado no módulo.
      expect(speechModule()).toBeNull();
    });
    function Probe() {
      const mic = useSpeech({ onFinal: () => {} });
      return (
        <React.Fragment>{mic.status === 'unavailable' ? <MicStatusText status={mic.reason} /> : null}</React.Fragment>
      );
    }
    await render(<Probe />);
    expect(await screen.findByText('unsupported')).toBeTruthy();
  });
});

function MicStatusText({ status }: { status: string | null }) {
  const { Text } = jest.requireActual('react-native') as typeof import('react-native');
  return <Text>{status}</Text>;
}
