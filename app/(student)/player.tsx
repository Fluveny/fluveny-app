import { useRouter } from 'expo-router';
import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../../src/api/client';
import { messageFor } from '../../src/api/errors';
import { useOnline } from '../../src/network/useOnline';
import { captureError } from '../../src/observability/sentry';
import { ActivityTransition } from '../../src/player/ActivityTransition';
import { needsCompletion, useCompletion, type UngradedOutcome } from '../../src/player/completion';
import { PlayerFooter, PlayerFrame, PlayerTop } from '../../src/player/PlayerFrame';
import { resolveActivity, type ActivityResult, type FooterAction, type SheetSpec } from '../../src/player/registry';
import { useStage } from '../../src/player/useStage';
import { ExpressionsProvider, renderPlain, toRenderContext } from '../../src/renderer';
import { color, spacing, typography } from '../../src/ui/tokens';
import { useVisitor } from '../../src/visitor/useVisitor';

export const RETRY_LABEL = 'TENTAR DE NOVO';
export const LOADING_LABEL = 'Carregando o Estágio';

/** Sai do player para a raiz (boas-vindas do Visitante), sem confirmação. */
function useLeave() {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
}

/**
 * Player do Estágio 1 do Visitante. Fechar (✕ ou voltar do Android) volta à
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
 */
export default function Player() {
  const leave = useLeave();
  const online = useOnline();
  const visitor = useVisitor();
  const { stage, usefulExpressions, stageNumber, error, missingStage, loading, fetching, retry } = useStage();
  const [index, setIndex] = useState(0);
  const [footer, setFooter] = useState<FooterAction | null>(null);
  const [sheet, setSheet] = useState<SheetSpec | null>(null);

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
  // Uma resposta com menos Atividades não deixa o índice fora da lista.
  const position = Math.min(index, Math.max(0, total - 1));
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

  const { store } = visitor;
  const {
    complete,
    clearError: clearCompletionError,
    completing,
    error: completionError,
  } = useCompletion(store, activity?.activityKey, stage?.versionId);
  const advance = useCallback(
    async (result?: ActivityResult) => {
      if (result && activity) {
        let xp = result.xp;
        if (needsCompletion(result.outcome)) {
          // A tela fica na falha (com a mensagem) e quando o player já saiu.
          if (!result.recorded && (await complete(result.outcome)).status !== 'done') return;
          xp = 0;
        }
        try {
          await store.recordProgress({ activityKey: activity.activityKey, outcome: result.outcome, xp });
        } catch (failure) {
          captureError(failure);
        }
      }
      setFooter(null);
      setSheet(null);
      if (position + 1 < total) setIndex(position + 1);
      else leave();
    },
    [activity, position, total, leave, store, complete],
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
  const shownFooter = useMemo<FooterAction | null>(() => {
    if (!footer || (!completing && !completionError)) return footer;
    return {
      ...footer,
      busy: footer.busy || completing,
      ...(completionError ? { message: messageFor(completionError) } : {}),
    };
  }, [footer, completing, completionError]);
  const shownSheet = useMemo<SheetSpec | null>(() => {
    if (!sheet || (!completing && !completionError)) return sheet;
    return {
      ...sheet,
      ...(completionError ? { error: messageFor(completionError) } : {}),
      actions: completing ? sheet.actions.map((action) => ({ ...action, busy: true })) : sheet.actions,
    };
  }, [sheet, completing, completionError]);

  if (loading) {
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
  return (
    <ExpressionsProvider expressions={usefulExpressions} disabled={shownSheet !== null}>
      <PlayerFrame
        stageNumber={stageNumber}
        stageTitle={stageTitle}
        position={position + 1}
        total={total}
        xp={visitor.xp}
        online={online}
        footer={shownFooter}
        sheet={shownSheet}
        onClose={leave}
        contentKey={current.activityKey}
        bleed={Activity.bleed === true}
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
  );
}

/** Carregando ou erro: o ✕ fica, o conteúdo no centro e, no erro, TENTAR DE NOVO no rodapé. */
function PlayerMessage({
  children,
  onClose,
  online,
  footer = null,
}: {
  children: React.ReactNode;
  onClose: () => void;
  online: boolean;
  footer?: FooterAction | null;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <PlayerTop onClose={onClose} online={online} />
      <View style={styles.center}>{children}</View>
      <PlayerFooter footer={footer} online={online} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.screenX },
  message: { ...typography.bodyStrong, color: color.ink, textAlign: 'center' },
});
