import type { ProgressEntry } from '../../visitor/types';
import { fromStudentSummary, isStageComplete, skippedLine, summarizeStage } from '../stageStats';

const KEYS = ['a1', 'a2', 'a3', 'a4'];

describe('números do Resumo do Estágio (1.20)', () => {
  it('XP, Resultado médio das avaliadas (sem vistas e puladas), minutos arredondados e puladas', () => {
    const progress: ProgressEntry[] = [
      { activityKey: 'a1', outcome: 'completed', xp: 10, resultPct: 100, studyTimeMs: 50_000 },
      { activityKey: 'a2', outcome: 'completed', xp: 6, resultPct: 67, studyTimeMs: 40_000 },
      { activityKey: 'a3', outcome: 'viewed', xp: 0, studyTimeMs: 30_000 },
      { activityKey: 'a4', outcome: 'skipped', xp: 0, studyTimeMs: 1_000 },
      // De outro Estágio: não conta.
      { activityKey: 'outra', outcome: 'completed', xp: 50, resultPct: 0, studyTimeMs: 600_000 },
    ];
    expect(summarizeStage(progress, KEYS)).toEqual({ xp: 16, resultPct: 84, minutes: 2, skipped: 1 });
  });

  it('Progresso antigo, sem Resultado nem tempo: calcula com o que há, e sem nenhum tempo os minutos são null', () => {
    const progress: ProgressEntry[] = [
      { activityKey: 'a1', outcome: 'completed', xp: 10 },
      { activityKey: 'a2', outcome: 'completed', xp: 5, resultPct: 50 },
      { activityKey: 'a3', outcome: 'viewed', xp: 0 },
    ];
    expect(summarizeStage(progress, KEYS)).toEqual({ xp: 15, resultPct: 50, minutes: null, skipped: 0 });
    expect(summarizeStage([], KEYS)).toEqual({ xp: 0, resultPct: null, minutes: null, skipped: 0 });
    // Com algum tempo gravado, as antigas contam como zero.
    const mixed: ProgressEntry[] = [...progress, { activityKey: 'a4', outcome: 'viewed', xp: 0, studyTimeMs: 90_000 }];
    expect(summarizeStage(mixed, KEYS).minutes).toBe(2);
  });

  it('com algum tempo, no mínimo 1 minute', () => {
    const progress: ProgressEntry[] = [{ activityKey: 'a1', outcome: 'viewed', xp: 0, studyTimeMs: 10_000 }];
    expect(summarizeStage(progress, KEYS).minutes).toBe(1);
  });

  it('Estágio completo: o Progresso tem todas as Atividades do Estágio', () => {
    const all = KEYS.map((activityKey): ProgressEntry => ({ activityKey, outcome: 'viewed', xp: 0 }));
    expect(isStageComplete(all, KEYS)).toBe(true);
    expect(isStageComplete(all.slice(1), KEYS)).toBe(false);
    expect(isStageComplete(all, [])).toBe(false);
  });

  it('a linha das puladas, com plural; sem puladas, nenhuma', () => {
    expect(skippedLine(0)).toBeNull();
    expect(skippedLine(1)).toBe('1 speaking activity skipped. You can redo it anytime.');
    expect(skippedLine(2)).toBe('2 speaking activities skipped. You can redo them anytime.');
  });
});

describe('fromStudentSummary (2.7)', () => {
  it('sem média: null; puladas passam; minutos arredondados, mínimo 1, 0 sem tempo', () => {
    expect(fromStudentSummary({ xpAwarded: 7, skippedCount: 2, studyTimeMs: 150_000 })).toEqual({
      xp: 7,
      resultPct: null,
      minutes: 3,
      skipped: 2,
    });
    expect(fromStudentSummary({ xpAwarded: 0, averageResultPct: 67, skippedCount: 0, studyTimeMs: 1 }).minutes).toBe(1);
    expect(fromStudentSummary({ xpAwarded: 0, averageResultPct: 67, skippedCount: 0, studyTimeMs: 0 })).toEqual({
      xp: 0,
      resultPct: 67,
      minutes: 0,
      skipped: 0,
    });
  });

  it('valor fora do contrato: média e minutos null, XP e puladas 0', () => {
    const odd = { xpAwarded: NaN, averageResultPct: Infinity, skippedCount: NaN } as unknown as Parameters<
      typeof fromStudentSummary
    >[0];
    expect(fromStudentSummary(odd)).toEqual({ xp: 0, resultPct: null, minutes: null, skipped: 0 });
  });
});
