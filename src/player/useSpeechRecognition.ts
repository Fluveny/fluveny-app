// Reconhecimento de fala da Fala (história 1.15, AD-16), sobre o
// expo-speech-recognition: no web, a Web Speech API do navegador; no Android,
// o reconhecedor do sistema, no aparelho quando ele suporta. Em `en-US`, sem
// gravar áudio, só com o resultado final. Um toque começa; o fim vem pelo
// silêncio (o reconhecedor para sozinho) ou por um segundo toque. Nada
// transcrito em 7 s: para e volta ao início com o aviso (UX-DR114).
//
// O módulo é carregado na primeira chamada, não no import: um APK sem o módulo
// nativo (antigo) deixa o microfone indisponível em vez de quebrar o player. No
// web, ele só entra com o player (que é quem importa este arquivo).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { ExpoSpeechRecognitionModule as SpeechModuleValue } from 'expo-speech-recognition';

import { messageFor, NETWORK_ERROR } from '../api/errors';
import { captureError } from '../observability/sentry';

type SpeechModule = typeof SpeechModuleValue;

/** Idioma do reconhecimento (o conteúdo do curso é em inglês). */
export const SPEECH_LANG = 'en-US';
/** Nada transcrito neste tempo: para e volta ao início (UX-DR114). */
export const SILENCE_MS = 7000;
/** O aviso de quando nada foi ouvido (UX-DR114). */
export const SILENCE_MESSAGE = 'Não ouvimos nada. Toque e tente de novo.';
/** O reconhecedor precisou da rede e ela falhou (o texto do `messageFor`). */
export const NETWORK_MESSAGE = messageFor(NETWORK_ERROR);
/** O microfone não abriu (captura, ou `start`/`stop` lançou). */
export const CAPTURE_MESSAGE = 'Não conseguimos usar o microfone. Tente de novo.';
/** Quanto esperar o `end` de uma sessão abortada antes de começar outra. */
const DRAIN_MS = 1000;

let loaded: SpeechModule | null | undefined;

/** O módulo do expo-speech-recognition, ou `null` sem ele (vai ao Sentry uma vez). */
export function speechModule(): SpeechModule | null {
  if (loaded === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const lib = require('expo-speech-recognition') as { ExpoSpeechRecognitionModule?: SpeechModule };
      loaded = lib.ExpoSpeechRecognitionModule ?? null;
    } catch (error) {
      captureError(error);
      loaded = null;
    }
  }
  return loaded;
}

/** Se o aparelho ou o navegador tem reconhecimento (o Firefox não tem a Web Speech API). */
function recognitionAvailable(module: SpeechModule | null): boolean {
  if (!module) return false;
  try {
    return module.isRecognitionAvailable();
  } catch (error) {
    captureError(error);
    return false;
  }
}

/** No Android, só no aparelho quando ele suporta (o áudio não sai do aparelho). */
function onDevice(module: SpeechModule): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    return module.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
}

/**
 * `checking`: lendo a disponibilidade e a permissão. `idle`: pronto para o
 * toque. `listening`: ouvindo. `unavailable`: sem reconhecimento ou sem permissão.
 */
export type MicStatus = 'checking' | 'idle' | 'listening' | 'unavailable';
/** Por que o microfone está indisponível: permissão negada ou sem reconhecimento. */
export type MicUnavailable = 'denied' | 'unsupported';

type State = { status: MicStatus; reason: MicUnavailable | null; message: string | null };

const INITIAL: State = { status: 'checking', reason: null, message: null };

export type SpeechRecognitionOptions = {
  /** A transcrição final, como o reconhecedor a deu (sem espaços nas pontas). */
  onFinal: (transcript: string) => void;
};

/**
 * O microfone da Fala. `toggle` começa a ouvir ou, ouvindo, encerra e usa o que
 * foi transcrito. `requestAccess` pede a permissão do sistema (depois do aviso
 * de privacidade); permissão negada deixa o microfone indisponível. `cancel`
 * para sem transcrição (pular, sair).
 *
 * O relógio de 7 s para quando o reconhecedor ouve som ou fala (`soundstart`,
 * `speechstart`): só "nada ouvido" volta ao início. Uma sessão abortada ainda
 * manda o `end` (às vezes depois de um novo toque): esses eventos são
 * descartados, e a sessão nova só começa depois deles (ou de 1 s).
 */
export function useSpeechRecognition({ onFinal }: SpeechRecognitionOptions) {
  const [state, setState] = useState<State>(INITIAL);
  /** O estado mais novo, para os eventos do reconhecedor (o `update` o mantém). */
  const current = useRef<State>(INITIAL);
  const final = useRef(onFinal);
  useEffect(() => {
    final.current = onFinal;
  }, [onFinal]);
  const alive = useRef(true);
  const transcript = useRef<string | null>(null);
  /** O aviso da falha da sessão em curso (rede, captura); sem ele, o de silêncio. */
  const failure = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const granted = useRef(false);
  /** Sessões abortadas cujo `end` ainda não chegou: os eventos delas são descartados. */
  const draining = useRef(0);
  const drained = useRef<(() => void) | null>(null);
  /** Um `begin` em curso (permissão, espera do `end` abortado). */
  const starting = useRef(false);
  /** A sessão em curso pediu reconhecimento no aparelho. */
  const onDeviceNow = useRef(false);
  /** Faltou o modelo en-US no aparelho: tentar de novo sem `requiresOnDeviceRecognition`. */
  const retryOnline = useRef(false);
  /** O reconhecimento no aparelho já falhou nesta tela: as próximas sessões vão sem ele. */
  const onDeviceBroken = useRef(false);

  const update = useCallback((next: State) => {
    current.current = next;
    if (alive.current) setState(next);
  }, []);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Aborta a sessão em curso; os eventos que ela ainda mandar são descartados. */
  const abortSession = useCallback(() => {
    clearTimer();
    draining.current += 1;
    try {
      speechModule()?.abort();
    } catch (error) {
      captureError(error);
    }
  }, []);

  const unavailable = useCallback(
    (reason: MicUnavailable) => {
      clearTimer();
      update({ status: 'unavailable', reason, message: null });
    },
    [update],
  );

  // Disponibilidade e permissão já negada de vez (sem pedir).
  const check = useCallback(async () => {
    const module = speechModule();
    if (!recognitionAvailable(module)) {
      unavailable('unsupported');
      return;
    }
    try {
      const permission = await module!.getPermissionsAsync();
      granted.current = permission.granted;
      if (!permission.granted && !permission.canAskAgain) {
        unavailable('denied');
        return;
      }
    } catch (error) {
      captureError(error);
    }
    const { status } = current.current;
    if (status === 'checking' || status === 'unavailable') update({ status: 'idle', reason: null, message: null });
  }, [unavailable, update]);

  /** Começa a ouvir (o relógio de silêncio e o `start`). */
  const listen = useCallback(
    (module: SpeechModule) => {
      transcript.current = null;
      failure.current = null;
      update({ status: 'listening', reason: null, message: null });
      clearTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        if (current.current.status !== 'listening' || transcript.current) return;
        // Nada ouvido: para e volta ao início, sem Tentativa.
        update({ status: 'idle', reason: null, message: SILENCE_MESSAGE });
        abortSession();
      }, SILENCE_MS);
      onDeviceNow.current = !onDeviceBroken.current && onDevice(module);
      try {
        module.start({
          lang: SPEECH_LANG,
          interimResults: false,
          continuous: false,
          maxAlternatives: 1,
          requiresOnDeviceRecognition: onDeviceNow.current,
        });
      } catch (error) {
        captureError(error);
        clearTimer();
        update({ status: 'idle', reason: null, message: CAPTURE_MESSAGE });
      }
    },
    [abortSession, update],
  );

  useEffect(() => {
    alive.current = true;
    void check();
    const module = speechModule();
    /** Evento de uma sessão abortada (ou fora da escuta): descarta. */
    const stale = () => draining.current > 0 || current.current.status !== 'listening';
    const subscriptions = module
      ? [
          module.addListener('result', (event) => {
            if (stale() || !event?.isFinal) return;
            const text = event.results?.[0]?.transcript?.trim();
            if (text) {
              transcript.current = text;
              clearTimer();
            }
          }),
          // Ouviu som ou fala: não é mais "nada ouvido"; o reconhecedor termina sozinho.
          module.addListener('soundstart', () => {
            if (!stale()) clearTimer();
          }),
          module.addListener('speechstart', () => {
            if (!stale()) clearTimer();
          }),
          module.addListener('error', (event) => {
            if (stale()) return;
            const code = event?.error;
            if (code === 'language-not-supported' && onDeviceNow.current) {
              // Falta o modelo en-US no aparelho: tenta de novo pelo reconhecedor online.
              onDeviceBroken.current = true;
              retryOnline.current = true;
            } else if (code === 'not-allowed') unavailable('denied');
            else if (code === 'service-not-allowed' || code === 'language-not-supported') unavailable('unsupported');
            else if (code === 'network') failure.current = NETWORK_MESSAGE;
            else if (code === 'audio-capture') failure.current = CAPTURE_MESSAGE;
            // O resto (sem fala, abortado) termina no `end`, sem transcrição.
          }),
          module.addListener('end', () => {
            if (draining.current > 0) {
              draining.current -= 1;
              if (draining.current === 0) drained.current?.();
              return;
            }
            if (current.current.status !== 'listening') return;
            if (retryOnline.current) {
              retryOnline.current = false;
              listen(module);
              return;
            }
            clearTimer();
            const text = transcript.current;
            transcript.current = null;
            update({ status: 'idle', reason: null, message: text ? null : (failure.current ?? SILENCE_MESSAGE) });
            if (text) final.current(text);
          }),
        ]
      : [];
    // Voltou das configurações: a permissão pode ter mudado.
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active' && current.current.reason === 'denied') void check();
    });
    return () => {
      alive.current = false;
      clearTimer();
      if (current.current.status === 'listening') abortSession();
      drained.current?.();
      for (const subscription of subscriptions) subscription.remove();
      appState.remove();
    };
  }, [check, unavailable, update, listen, abortSession]);

  /** Pede a permissão do sistema; negada, o microfone fica indisponível. */
  const requestAccess = useCallback(async (): Promise<boolean> => {
    const module = speechModule();
    if (!recognitionAvailable(module)) {
      unavailable('unsupported');
      return false;
    }
    try {
      const permission = await module!.requestPermissionsAsync();
      granted.current = permission.granted;
    } catch (error) {
      captureError(error);
      granted.current = false;
    }
    if (!granted.current) unavailable('denied');
    return granted.current;
  }, [unavailable]);

  /** Espera o `end` das sessões abortadas (no máximo `DRAIN_MS`). */
  const drain = useCallback(async () => {
    if (draining.current === 0) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(limit);
        drained.current = null;
        resolve();
      };
      const limit = setTimeout(done, DRAIN_MS);
      drained.current = done;
    });
    // O `end` não veio: os eventos atrasados que ainda vierem são da sessão nova.
    draining.current = 0;
  }, []);

  const begin = useCallback(async () => {
    const module = speechModule();
    if (!module) {
      unavailable('unsupported');
      return;
    }
    if (starting.current) return;
    starting.current = true;
    try {
      if (!granted.current && !(await requestAccess())) return;
      await drain();
      if (!alive.current || current.current.status !== 'idle') return;
      listen(module);
    } finally {
      starting.current = false;
    }
  }, [requestAccess, unavailable, drain, listen]);

  /** Toque no microfone: começa a ouvir ou encerra e usa o que foi transcrito. */
  const toggle = useCallback(() => {
    const { status } = current.current;
    if (status === 'idle') {
      void begin();
      return;
    }
    if (status !== 'listening') return;
    try {
      speechModule()?.stop();
    } catch (error) {
      captureError(error);
      update({ status: 'idle', reason: null, message: CAPTURE_MESSAGE });
      abortSession();
    }
  }, [begin, update, abortSession]);

  /** Para sem usar a transcrição (pular a Atividade). */
  const cancel = useCallback(() => {
    if (current.current.status !== 'listening') return;
    update({ status: 'idle', reason: null, message: null });
    abortSession();
  }, [update, abortSession]);

  /** Some com o aviso de silêncio (TENTAR DE NOVO volta ao microfone limpo). */
  const clearMessage = useCallback(() => {
    if (current.current.message) update({ ...current.current, message: null });
  }, [update]);

  return { ...state, toggle, requestAccess, cancel, clearMessage };
}
