import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../../src/api/client';
import { mayHaveSession, useStudent, type StudentProfile } from '../../src/auth/student';
import { messageFor, STAGE_LOCKED } from '../../src/api/errors';
import { invalidateDashboard } from '../../src/dashboard/dashboard';
import { useOnline } from '../../src/network/useOnline';
import { captureError } from '../../src/observability/sentry';
import { ActivityTransition } from '../../src/player/ActivityTransition';
import { needsCompletion, useCompletion, type UngradedOutcome } from '../../src/player/completion';
import { PlayerSessionContext, type PlayerMode, type PlayerSession } from '../../src/player/playerSession';
import { PlayerFooter, PlayerFrame, PlayerTop } from '../../src/player/PlayerFrame';
import { playerTarget } from '../../src/player/playerRoute';
import { resolveActivity, type ActivityResult, type FooterAction, type SheetSpec } from '../../src/player/registry';
import { SIGN_UP_PATH } from '../../src/player/StageInvite';
import { StageSummary } from '../../src/player/StageSummary';
import { summarizeStage, type StageSummary as Summary } from '../../src/player/stageStats';
import {
  fetchProgress,
  invalidateProgress,
  PROGRESS_QUERY_KEY,
  progressEntries,
  reportReadFailure,
  sendStudentEvent,
  useStudentProgress,
  type StudentProgress,
} from '../../src/player/studentProgress';
import { useStudyClock } from '../../src/player/studyClock';
import { UNIT_KEY, useStage } from '../../src/player/useStage';
import { ExpressionsProvider, renderPlain, toRenderContext } from '../../src/renderer';
import { color, spacing, typography } from '../../src/ui/tokens';
import { sendVisitorEvent } from '../../src/visitor/events';
import type { ProgressEntry } from '../../src/visitor/types';
import { useVisitor } from '../../src/visitor/useVisitor';

export const RETRY_LABEL = 'TENTAR DE NOVO';
export const LOADING_LABEL = 'Carregando o Estágio';

// Salvar falhou, só no modo Aluno (2.4, UX-DR111): a ação que disparou a conclusão.
export const SAVING_LABEL = 'SALVANDO…';
export const SAVE_RETRY_LABEL = 'TENTAR SALVAR DE NOVO';
export const SAVE_FAILED = 'Não conseguimos salvar sua resposta. Nada foi perdido.';

/** O Estágio travado (2.5): a ação que volta ao painel. [ASSUMPTION: copy] */
export const BACK_HOME_LABEL = 'VOLTAR AO INÍCIO';

/** O modo pelo Aluno da sessão: com perfil, o Aluno; `null`, o Visitante; sem resposta ainda, indefinido. */
function modeOf(student: StudentProfile | null | undefined): PlayerMode | null {
  if (student === undefined) return null;
  return student ? 'student' : 'visitor';
}

/** O Progresso com a entrada que acabou de ser gravada, se ele ainda não a tem (só a primeira conclusão vale). */
function withEntry(progress: ProgressEntry[], recorded: ProgressEntry | undefined): ProgressEntry[] {
  if (!recorded || progress.some((entry) => entry.activityKey === recorded.activityKey)) return progress;
  return [...progress, recorded];
}

/** Sai do player para a raiz (a boas-vindas do Visitante ou a tela inicial do Aluno), sem confirmação. */
function useLeave() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
}

/**
 * Player do Estágio 1, do Visitante e do Aluno. Fechar (✕ ou voltar do Android) volta à
 * boas-vindas sem confirmação, e a Atividade em curso não é gravada. Com a
 * folha de feedback aberta, o voltar também sai do player e não fecha a folha
 * [ASSUMPTION: EXPERIENCE.md, o feedback pede uma decisão explícita].
 *
 * Atividade vista ou pulada (`viewed`/`skipped`) passa pela rota `completions`
 * antes de avançar (1.12): o recibo é guardado, depois o Progresso com xp 0.
 * Sem rede ou com erro, a tela fica com `messageFor(code)` e a ação volta.
 *
 * Expressões Úteis (1.14): o `ExpressionsProvider` em volta da moldura torna
 * tocáveis os trechos `[[rótulo|chave]]` das Atividades. A folha de dicionário
 * fecha com o voltar do Android (o `Modal` o recebe antes do player) e com Esc
 * no web; o voltar do navegador ainda sai do player (UX-DR130, adiado).
 *
 * Fim do Estágio (1.20): o CONTINUAR da última Atividade abre o Resumo do
 * Estágio com o convite ao cadastro, no lugar da boas-vindas; o ✕ e o voltar
 * dele saem para a boas-vindas. Cada Atividade concluída guarda no Progresso o
 * Resultado da primeira Tentativa e o tempo de estudo. Eventos (AD-14): cada
 * Atividade que aparece manda `ACTIVITY_STARTED`, sem esperar e sem mostrar
 * falha; a sessão sai no toque que abre o player (`openPlayer`).
 *
 * Progresso do Aluno (2.4): quem joga é fixado na abertura (`modeOf`): com o
 * Aluno da sessão no cache, ou buscado (`useStudent`), é o Aluno, e a
 * Tentativa, o reveal, a conclusão e o `ACTIVITY_STARTED` vão às rotas
 * `/students/me/*` (o contexto `PlayerSessionContext` leva o modo aos Tipos).
 * O Aluno não grava Progresso nem recibos no aparelho: o chip de XP e o resumo
 * leem `GET /students/me/progress`, relido a cada gravação confirmada. A
 * conclusão que falha mostra "TENTAR SALVAR DE NOVO" com a linha vermelha, e a
 * volta da rede a repete uma vez. Nos dois modos, o tempo de estudo é o do
 * relógio do player (`useStudyClock`, corte de 5 min).
 *
 * Painel e retomada (2.5): o Aluno abre o player em `unidade`, `estagio` e
 * `atividade` (chaves do conteúdo, lidas uma vez na abertura; valor inválido é
 * ignorado). Sem `estagio`, o primeiro Estágio; sem `atividade`, ou com uma que
 * não está no Estágio, a Atividade 1. A Atividade na tela fica na URL
 * (`setParams`, sem histórico), para o `volta` de Entrar depois de um 401. O
 * Visitante ignora os parâmetros. Uma gravação recusada com `STAGE_LOCKED`
 * troca a tela pelo aviso com VOLTAR AO INÍCIO e relê o painel.
 */
export default function Player() {
  const router = useRouter();
  const leave = useLeave();
  const client = useQueryClient();
  // Quem joga, fixado na abertura: a sessão que vence no meio não troca o modo (o 401 leva a Entrar).
  // Sem sessão possível (o Android sem token), o Visitante, sem perguntar à API.
  const [askStudent] = useState(mayHaveSession);
  const studentQuery = useStudent(askStudent);
  const [fixedMode, setFixedMode] = useState<PlayerMode | null>(
    () => modeOf(studentQuery.data) ?? (askStudent ? null : 'visitor'),
  );
  const mode = fixedMode ?? (studentQuery.isSuccess ? modeOf(studentQuery.data) : null);
  if (fixedMode === null && mode !== null) setFixedMode(mode);
  const online = useOnline();
  const visitor = useVisitor();
  // Onde o Aluno abre o player, lido uma vez na abertura: o `setParams` abaixo não o muda.
  const params = useLocalSearchParams();
  const [target] = useState(() => playerTarget(params));
  const asStudent = mode === 'student';
  const unitKey = (asStudent && target.unidade) || UNIT_KEY;
  const { stage, usefulExpressions, stageNumber, error, missingStage, loading, fetching, retry } = useStage(
    unitKey,
    asStudent ? target.estagio : undefined,
    // Só depois de decidir quem joga: senão, o Estágio 1 viria antes do `estagio` do Aluno.
    mode !== null,
  );
  // `null` até o primeiro avanço: a Atividade de abertura (o `atividade` do Aluno, ou a 1).
  const [index, setIndex] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [footer, setFooter] = useState<FooterAction | null>(null);
  const [sheet, setSheet] = useState<SheetSpec | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const { store } = visitor;

  // A rede de agora, para o ACTIVITY_STARTED (sem rede, o evento é descartado); antes do efeito que a lê.
  // A sessão (VISITOR_SESSION_STARTED) sai no toque que abre o player (`openPlayer`), não aqui.
  const onlineNow = useRef(online);
  useEffect(() => {
    onlineNow.current = online;
  }, [online]);

  // O voltar do Android é o ✕.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => subscription.remove();
  }, [leave]);

  const activities = useMemo(() => (Array.isArray(stage?.activities) ? stage.activities : []), [stage]);
  const total = activities.length;
  const startIndex = useMemo(() => {
    if (!asStudent || !target.atividade) return 0;
    return Math.max(
      0,
      activities.findIndex((entry) => entry.activityKey === target.atividade),
    );
  }, [asStudent, target.atividade, activities]);
  // Uma resposta com menos Atividades não deixa o índice fora da lista.
  const position = Math.min(index ?? startIndex, Math.max(0, total - 1));
  const activity = activities[position];

  // Título do Estágio em texto puro (a junção dos segmentos), com as Variáveis do Aluno.
  // Antes da primeira leitura do Visitante, vazio: assim o `{name}` não aparece cru.
  const { variables, ready } = visitor;
  const stageTitle = useMemo(() => {
    if (!stage || !ready) return '';
    const { vars, pronoun } = toRenderContext(variables);
    try {
      return renderPlain(stage.title, vars, pronoun);
    } catch (failure) {
      captureError(failure);
      return '';
    }
  }, [stage, variables, ready]);

  // O relógio de estudo da Atividade na tela (os dois modos).
  const clock = useStudyClock(activity?.activityKey);
  // O XP do Aluno vem do servidor, relido a cada gravação confirmada.
  const progress = useStudentProgress(mode === 'student');
  // A leitura que falha vai ao Sentry (menos sem rede e o 401); o chip fica escondido até a próxima.
  const progressError = progress.error;
  useEffect(() => {
    if (progressError) reportReadFailure(progressError);
  }, [progressError]);
  // A gravação confirmada muda o XP do chip e os números do painel.
  const onSaved = useCallback(() => {
    invalidateProgress(client);
    invalidateDashboard(client);
  }, [client]);
  // A sequência recusou a gravação: a tela troca pelo aviso, e o painel é relido (o Estágio está travado).
  const onStageLocked = useCallback(() => {
    setLocked(true);
    invalidateDashboard(client);
  }, [client]);
  const session = useMemo<PlayerSession>(
    () => ({ mode: mode ?? 'visitor', clock, onSaved, onStageLocked }),
    [mode, clock, onSaved, onStageLocked],
  );

  const {
    complete,
    clearError: clearCompletionError,
    completing,
    error: completionError,
    retryable: saveRetryable,
  } = useCompletion(store, activity?.activityKey, stage?.versionId, { mode, clock, onSaved, onStageLocked });

  // Uma abertura por Atividade que aparece na tela (também ao refazer: cada abertura do player é outra).
  // Só depois de decidir quem joga: o Aluno pela rota dele, sem `deviceId`.
  const versionId = stage?.versionId;
  const shownKey = summary || !activity || missingStage ? undefined : activity.activityKey;
  const lastStarted = useRef<string | null>(null);
  useEffect(() => {
    if (!mode || !shownKey || !versionId || lastStarted.current === shownKey) return;
    lastStarted.current = shownKey;
    const event = { type: 'ACTIVITY_STARTED', versionId, activityKey: shownKey } as const;
    if (mode === 'student') sendStudentEvent(event, onlineNow.current);
    else sendVisitorEvent(store, event, onlineNow.current);
  }, [mode, store, shownKey, versionId]);

  // O Aluno: a Atividade na tela fica na URL, sem entrada no histórico, para voltar a ela depois de um 401
  // (UX-DR118). O Visitante não muda a URL.
  const shownStageKey = stage?.stageKey;
  const { setParams } = router;
  useEffect(() => {
    if (!asStudent || !shownKey || !shownStageKey) return;
    const next = { unidade: unitKey, estagio: shownStageKey, atividade: shownKey };
    const now = playerTarget(params);
    if (now.unidade === next.unidade && now.estagio === next.estagio && now.atividade === next.atividade) return;
    setParams(next);
  }, [asStudent, shownKey, shownStageKey, unitKey, params, setParams]);

  /**
   * Fecha o Estágio: os números do Resumo saem do Progresso já gravado (o do
   * aparelho, no Visitante; o do servidor, relido depois da última gravação,
   * no Aluno). Se a leitura falhar, usa o Progresso em memória (ou o do cache)
   * com a entrada que acabou de ser concluída (ele foi lido antes dela).
   */
  const finishStage = useCallback(
    async (recorded?: ProgressEntry) => {
      const keys = activities.map((entry) => entry.activityKey);
      if (mode === 'student') {
        let entries: ProgressEntry[];
        try {
          entries = progressEntries(await fetchProgress(client), unitKey);
        } catch {
          // A falha vai ao Sentry pelo efeito da consulta do Progresso (a mesma).
          const cached = client.getQueryData<StudentProgress>(PROGRESS_QUERY_KEY);
          entries = withEntry(progressEntries(cached, unitKey), recorded);
        }
        setSummary(summarizeStage(entries, keys));
        return;
      }
      let progress = visitor.progress;
      try {
        progress = await store.progress();
      } catch (failure) {
        captureError(failure);
        progress = withEntry(progress, recorded);
      }
      setSummary(summarizeStage(progress, keys));
    },
    [mode, client, store, visitor.progress, activities, unitKey],
  );
  const advance = useCallback(
    async (result?: ActivityResult) => {
      let recorded: ProgressEntry | undefined;
      if (result && activity) {
        // O tempo de estudo vai até o toque, sem a espera da conclusão.
        const studyTimeMs = clock.elapsed();
        let xp = result.xp;
        if (needsCompletion(result.outcome)) {
          // A tela fica na falha (com a mensagem) e quando o player já saiu.
          if (!result.recorded && (await complete(result.outcome)).status !== 'done') return;
          xp = 0;
        }
        recorded = {
          activityKey: activity.activityKey,
          outcome: result.outcome,
          xp,
          ...(result.outcome === 'completed' && result.resultPct !== undefined ? { resultPct: result.resultPct } : {}),
          studyTimeMs,
        };
        // O Progresso do Aluno fica no servidor: no aparelho, só o do Visitante.
        if (mode !== 'student') {
          try {
            await store.recordProgress(recorded);
          } catch (failure) {
            captureError(failure);
          }
        }
      }
      setFooter(null);
      setSheet(null);
      if (position + 1 < total) setIndex(position + 1);
      else await finishStage(recorded);
    },
    [activity, position, total, store, complete, clock, mode, finishStage],
  );
  // A Atividade pode esperar o fim (a Fala trava o microfone enquanto o pular está no ar).
  const onAdvance = useCallback((result?: ActivityResult) => advance(result), [advance]);
  // Concluir sem avançar (a Resposta Livre, 1.18): a falha fica no rodapé, como no avançar.
  const onComplete = useCallback(
    async (outcome: UngradedOutcome) => {
      const { status, result } = await complete(outcome);
      return status === 'done' && result ? result : null;
    },
    [complete],
  );

  // A conclusão em curso ou com falha aparece por cima da ação que a Atividade definiu.
  // O Aluno (2.4): "SALVANDO…", depois, na falha de rede, 5xx ou 429, "TENTAR SALVAR DE NOVO" com a
  // linha vermelha, também sem rede. A recusa do servidor (outro 4xx) mostra `messageFor(code)`.
  const student = mode === 'student';
  const shownFooter = useMemo<FooterAction | null>(() => {
    if (!footer || (!completing && !completionError)) return footer;
    if (student && (completing || saveRetryable)) {
      const { message: _message, ...action } = footer;
      return {
        ...action,
        label: completing ? SAVING_LABEL : SAVE_RETRY_LABEL,
        busy: footer.busy || completing,
        ...(completionError ? { message: SAVE_FAILED, messageOffline: true } : {}),
      };
    }
    return {
      ...footer,
      busy: footer.busy || completing,
      ...(completionError ? { message: messageFor(completionError) } : {}),
    };
  }, [footer, completing, completionError, student, saveRetryable]);
  const shownSheet = useMemo<SheetSpec | null>(() => {
    if (!sheet || (!completing && !completionError)) return sheet;
    return {
      ...sheet,
      ...(completionError ? { error: messageFor(completionError) } : {}),
      actions: completing ? sheet.actions.map((action) => ({ ...action, busy: true })) : sheet.actions,
    };
  }, [sheet, completing, completionError]);

  // Quando a rede volta depois de uma falha que pode ser repetida (sem rede, 5xx ou 429), o player
  // repete sozinho a ação do rodapé, uma vez a cada volta, como um toque em TENTAR SALVAR DE NOVO.
  // Na volta, o Progresso que ainda não foi lido (o chip escondido) é buscado de novo.
  const failedAction = useRef<(() => void) | null>(null);
  useEffect(() => {
    failedAction.current = shownFooter?.onPress ?? null;
  }, [shownFooter]);
  const wasOnline = useRef(online);
  const refetchProgress = progress.refetch;
  const progressFailed = progress.isError;
  useEffect(() => {
    const back = online && !wasOnline.current;
    wasOnline.current = online;
    if (!back || !student) return;
    if (progressFailed) void refetchProgress();
    if (completionError && saveRetryable && !completing) failedAction.current?.();
  }, [online, student, completionError, saveRetryable, completing, progressFailed, refetchProgress]);

  // O Estágio travado (2.5): nada se repete nem se grava; VOLTAR AO INÍCIO não depende da rede.
  if (locked) {
    return (
      <PlayerMessage
        onClose={leave}
        online={online}
        footerOnline
        footer={{ label: BACK_HOME_LABEL, onPress: () => router.dismissTo('/') }}
      >
        <Text style={styles.message} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {messageFor(STAGE_LOCKED)}
        </Text>
      </PlayerMessage>
    );
  }

  if (summary && stage) {
    return (
      <StageSummary
        stageNumber={stageNumber}
        stageTitle={stageTitle}
        completion={stage.completion}
        summary={summary}
        online={online}
        onClose={leave}
        onSignUp={() => router.navigate(SIGN_UP_PATH)}
        onContinue={student ? () => router.dismissTo('/') : undefined}
      />
    );
  }

  // Quem joga não foi decidido e a busca do Aluno falhou: nada é enviado, e TENTAR DE NOVO busca de novo.
  if (mode === null && studentQuery.isError) {
    const failure = studentQuery.error;
    return (
      <PlayerMessage
        onClose={leave}
        online={online}
        footer={{
          label: RETRY_LABEL,
          onPress: () => void studentQuery.refetch(),
          busy: studentQuery.isFetching,
        }}
      >
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {messageFor(failure instanceof ApiError ? failure.code : undefined)}
        </Text>
      </PlayerMessage>
    );
  }

  if (loading || mode === null) {
    return (
      <PlayerMessage onClose={leave} online={online}>
        <ActivityIndicator size="large" color={color.blue} accessibilityLabel={LOADING_LABEL} />
      </PlayerMessage>
    );
  }

  // Com o Estágio já na tela, um erro posterior não troca a Atividade em curso.
  if (!stage || !activity || missingStage) {
    const code = error instanceof ApiError ? error.code : missingStage || stage ? 'NOT_FOUND' : undefined;
    return (
      <PlayerMessage onClose={leave} online={online} footer={{ label: RETRY_LABEL, onPress: retry, busy: fetching }}>
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {messageFor(code)}
        </Text>
      </PlayerMessage>
    );
  }

  const current = activity;
  const Activity = resolveActivity(current.type);
  // Os trechos de Expressão Útil abrem a folha de dicionário; com a de feedback aberta, não (UX-DR129).
  // O chip do Aluno é o XP do servidor, escondido até a primeira leitura.
  const serverXp = progress.data?.xpTotal;
  const xp = student ? (typeof serverXp === 'number' ? serverXp : undefined) : visitor.xp;
  return (
    <PlayerSessionContext.Provider value={session}>
      <ExpressionsProvider expressions={usefulExpressions} disabled={shownSheet !== null}>
        <PlayerFrame
          stageNumber={stageNumber}
          stageTitle={stageTitle}
          position={position + 1}
          total={total}
          xp={xp}
          online={online}
          footer={shownFooter}
          sheet={shownSheet}
          onClose={leave}
          contentKey={current.activityKey}
          bleed={Activity.bleed === true}
          onInteraction={clock.touch}
        >
          <ActivityTransition id={current.activityKey}>
            {/* O componente vem do registro: um Tipo sem componente cai em "Atividade em preparação". */}
            {createElement(Activity, {
              key: current.activityKey,
              activity: current,
              versionId: stage.versionId,
              setFooter,
              setSheet,
              advance: onAdvance,
              complete: onComplete,
              clearCompletionError,
            })}
          </ActivityTransition>
        </PlayerFrame>
      </ExpressionsProvider>
    </PlayerSessionContext.Provider>
  );
}

/** Carregando ou erro: o ✕ fica, o conteúdo no centro e, no erro, TENTAR DE NOVO no rodapé. */
function PlayerMessage({
  children,
  onClose,
  online,
  footer = null,
  footerOnline = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  online: boolean;
  footer?: FooterAction | null;
  /** A ação do rodapé não chama o servidor: fica de pé sem rede. */
  footerOnline?: boolean;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <PlayerTop onClose={onClose} online={online} />
      <View style={styles.center}>{children}</View>
      <PlayerFooter footer={footer} online={online || footerOnline} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.screenX },
  message: { ...typography.bodyStrong, color: color.ink, textAlign: 'center' },
});
