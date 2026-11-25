// Números do Resumo do Estágio (história 1.20, UX-DR104), a partir do Progresso
// do aparelho. Só contam as entradas das Atividades do Estágio. Entradas de
// antes da 1.20, sem `resultPct` nem `studyTimeMs`, contam como sem Resultado
// e sem tempo.
import type { ProgressEntry } from '../visitor/types';

export type StageSummary = {
  /** XP do Estágio (o local, do Progresso). */
  xp: number;
  /** Média dos Resultados das Atividades avaliadas, arredondada; `null` sem nenhuma. */
  resultPct: number | null;
  /**
   * Minutos de estudo (a soma dos tempos), arredondados; com algum tempo, no
   * mínimo 1. `null` sem nenhum tempo gravado (Progresso de antes da 1.20).
   */
  minutes: number | null;
  /** Atividades puladas ("Não posso falar agora"). */
  skipped: number;
};

const MINUTE_MS = 60_000;

/** Os minutos de estudo de um tempo somado: arredondados, no mínimo 1 com algum tempo, 0 sem nenhum. */
export function minutesOf(timeMs: number): number {
  return timeMs > 0 ? Math.max(1, Math.round(timeMs / MINUTE_MS)) : 0;
}

/** O resumo do Estágio do Aluno como vem da API (2.7). */
export type StudentStageSummaryData = {
  xpAwarded: number;
  averageResultPct?: number;
  skippedCount: number;
  studyTimeMs: number;
};

/**
 * O resumo do Aluno (`GET /students/me/units/{unitKey}/stages/{stageKey}/summary`)
 * nos números da tela: a média ausente vira `null` ("–").
 */
export function fromStudentSummary(data: StudentStageSummaryData): StageSummary {
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  return {
    xp: finite(data.xpAwarded) ? data.xpAwarded : 0,
    resultPct: finite(data.averageResultPct) ? data.averageResultPct : null,
    // Sem tempo na resposta, como o Progresso sem tempo do `summarizeStage`: sem o cartão.
    minutes: finite(data.studyTimeMs) ? minutesOf(data.studyTimeMs) : null,
    skipped: finite(data.skippedCount) ? data.skippedCount : 0,
  };
}

function entriesOf(progress: readonly ProgressEntry[], activityKeys: readonly string[]): ProgressEntry[] {
  const keys = new Set(activityKeys);
  return progress.filter((entry) => keys.has(entry.activityKey));
}

/** O Estágio está completo no aparelho: o Progresso tem todas as Atividades dele. */
export function isStageComplete(progress: readonly ProgressEntry[], activityKeys: readonly string[]): boolean {
  if (activityKeys.length === 0) return false;
  const done = new Set(progress.map((entry) => entry.activityKey));
  return activityKeys.every((key) => done.has(key));
}

export function summarizeStage(progress: readonly ProgressEntry[], activityKeys: readonly string[]): StageSummary {
  const entries = entriesOf(progress, activityKeys);
  // Avaliadas: as concluídas com Resultado (sem as vistas e as puladas).
  const graded = entries.flatMap((entry) =>
    entry.outcome === 'completed' && entry.resultPct !== undefined ? [entry.resultPct] : [],
  );
  const timed = entries.filter((entry) => entry.studyTimeMs !== undefined);
  const timeMs = timed.reduce((sum, entry) => sum + (entry.studyTimeMs ?? 0), 0);
  return {
    xp: entries.reduce((sum, entry) => sum + entry.xp, 0),
    resultPct: graded.length > 0 ? Math.round(graded.reduce((sum, pct) => sum + pct, 0) / graded.length) : null,
    minutes: timed.length === 0 ? null : minutesOf(timeMs),
    skipped: entries.filter((entry) => entry.outcome === 'skipped').length,
  };
}

/** "1 speaking activity skipped. …" (EXPERIENCE.md, Voice and Tone), com plural; sem puladas, `null`. */
export function skippedLine(skipped: number): string | null {
  if (skipped <= 0) return null;
  const noun = skipped === 1 ? 'speaking activity' : 'speaking activities';
  return `${skipped} ${noun} skipped. You can redo ${skipped === 1 ? 'it' : 'them'} anytime.`;
}
