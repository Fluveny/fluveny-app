// Relógio de estudo do player (2.4; PRD §7, a spine: "tempo de estudo medido no
// App, corte de 5 min"). Vale para os dois modos, Visitante e Aluno: a
// Tentativa, a conclusão e o Progresso do Visitante levam o tempo dele.
//
// O relógio soma os intervalos entre interações: um toque na moldura, uma
// mudança de texto num campo do player, a volta do App ao primeiro plano e a
// própria ação que lê o relógio (o toque em VERIFICAR, CONTINUAR, ENVIAR…). Um
// intervalo maior que 5 min não conta (a pausa), e o tempo com o App em segundo
// plano também não. A leitura tem teto de 24 h, o da API.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Um intervalo sem interação maior que este não conta. */
export const IDLE_CUTOFF_MS = 5 * 60_000;
/** Teto do `studyTimeMs` (o da API). */
export const MAX_STUDY_TIME_MS = 86_400_000;

export type StudyClock = {
  /** Uma interação: soma o intervalo desde a anterior (se não passou do corte). */
  touch(): void;
  /** O App foi para o segundo plano: fecha o intervalo aberto e para de contar. */
  pause(): void;
  /** O App voltou ao primeiro plano: uma interação, sem contar o tempo fora. */
  resume(): void;
  /** Recomeça do zero (outra Atividade na tela). */
  reset(): void;
  /** O tempo de estudo até agora, em ms inteiros; a leitura é a interação que a pediu. */
  elapsed(): number;
};

export function createStudyClock(now: () => number = Date.now): StudyClock {
  let total = 0;
  /** A última interação; `null` com o App em segundo plano. */
  let last: number | null = now();

  const close = (at: number) => {
    if (last === null) return;
    const gap = at - last;
    if (gap > 0 && gap <= IDLE_CUTOFF_MS) total += gap;
  };

  const touch = () => {
    const at = now();
    close(at);
    last = at;
  };

  return {
    touch,
    pause() {
      close(now());
      last = null;
    },
    resume() {
      // Sem ter saído (um `active` sem `background` antes), é uma interação como outra.
      if (last !== null) return touch();
      // Fora da tela, nada contou: o intervalo novo começa agora.
      last = now();
    },
    reset() {
      total = 0;
      if (last !== null) last = now();
    },
    elapsed() {
      touch();
      return Math.min(MAX_STUDY_TIME_MS, Math.max(0, Math.round(total)));
    },
  };
}

/**
 * O relógio do player: um por abertura, zerado a cada Atividade (`resetKey`) e
 * parado com o App fora do primeiro plano (`AppState`; no web, a aba escondida).
 */
export function useStudyClock(resetKey: string | undefined): StudyClock {
  const [clock] = useState(() => createStudyClock());

  useEffect(() => {
    clock.reset();
  }, [clock, resetKey]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') clock.resume();
      else clock.pause();
    });
    return () => subscription?.remove();
  }, [clock]);

  return clock;
}
