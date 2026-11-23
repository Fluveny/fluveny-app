// O relógio de estudo do player (2.4): soma os intervalos entre interações,
// sem os maiores que 5 min e sem o tempo em segundo plano, com teto de 24 h.
import { createStudyClock, IDLE_CUTOFF_MS, MAX_STUDY_TIME_MS } from '../studyClock';

const MINUTE = 60_000;

function clockAt(start = 1_000_000) {
  let now = start;
  const clock = createStudyClock(() => now);
  return { clock, wait: (ms: number) => (now += ms) };
}

describe('relógio de estudo (2.4)', () => {
  it('soma os intervalos entre interações; a leitura é uma interação', () => {
    const { clock, wait } = clockAt();
    wait(30_000);
    clock.touch();
    wait(20_000);
    expect(clock.elapsed()).toBe(50_000);
    wait(10_000);
    expect(clock.elapsed()).toBe(60_000);
  });

  it('pausa: um intervalo maior que 5 min não conta, inteiro; o de 5 min conta', () => {
    const { clock, wait } = clockAt();
    wait(MINUTE);
    clock.touch();
    wait(6 * MINUTE);
    clock.touch();
    wait(IDLE_CUTOFF_MS);
    expect(clock.elapsed()).toBe(MINUTE + IDLE_CUTOFF_MS);
  });

  it('segundo plano: o tempo fora da tela não conta; a volta começa um intervalo novo', () => {
    const { clock, wait } = clockAt();
    wait(MINUTE);
    clock.pause();
    wait(2 * MINUTE);
    // Um toque fora da tela (não acontece) não conta o tempo fora.
    clock.resume();
    wait(30_000);
    expect(clock.elapsed()).toBe(MINUTE + 30_000);
  });

  it('segundo plano depois de uma pausa longa: o intervalo antes de sair também segue o corte', () => {
    const { clock, wait } = clockAt();
    wait(6 * MINUTE);
    clock.pause();
    wait(MINUTE);
    clock.resume();
    expect(clock.elapsed()).toBe(0);
  });

  it('volta ao primeiro plano sem ter saído: conta como interação, sem perder o intervalo aberto', () => {
    const { clock, wait } = clockAt();
    wait(MINUTE);
    clock.resume();
    wait(10_000);
    expect(clock.elapsed()).toBe(MINUTE + 10_000);
  });

  it('reset: outra Atividade começa do zero', () => {
    const { clock, wait } = clockAt();
    wait(MINUTE);
    clock.touch();
    clock.reset();
    wait(10_000);
    expect(clock.elapsed()).toBe(10_000);
  });

  it('reset em segundo plano: continua parado até a volta', () => {
    const { clock, wait } = clockAt();
    clock.pause();
    clock.reset();
    wait(MINUTE);
    clock.resume();
    wait(5_000);
    expect(clock.elapsed()).toBe(5_000);
  });

  it('teto de 24 h', () => {
    const { clock, wait } = clockAt();
    for (let i = 0; i < (25 * 60) / 5; i += 1) {
      wait(IDLE_CUTOFF_MS);
      clock.touch();
    }
    expect(clock.elapsed()).toBe(MAX_STUDY_TIME_MS);
  });

  it('relógio que volta no tempo não desconta', () => {
    const { clock, wait } = clockAt();
    wait(10_000);
    clock.touch();
    wait(-5_000);
    expect(clock.elapsed()).toBe(10_000);
  });
});
