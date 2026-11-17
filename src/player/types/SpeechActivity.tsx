import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { messageFor } from '../../api/errors';
import { captureError } from '../../observability/sentry';
import { chooseVariant, RenderedText, tokenizeVariables, useRenderVars, type ContentText } from '../../renderer';
import { Card, MicButton, NoticeSheet, SceneFrame, TextLink } from '../../ui';
import { color, spacing, typography } from '../../ui/tokens';
import { useVisitor } from '../../visitor/useVisitor';
import type { ActivityProps, ActivityView } from '../registry';
import { useEvaluation, type Answer } from '../useEvaluation';
import { privacyText } from '../speechPrivacy';
import { useSpeechRecognition } from '../useSpeechRecognition';

export { PRIVACY_TEXT, privacyText } from '../speechPrivacy';

type SpeechView = Extract<ActivityView, { type: 'speech' }>;

/** O pular da Fala (EXPERIENCE.md, Voice and Tone: nunca "Pular"). */
export const SKIP_LABEL = 'NÃO POSSO FALAR AGORA';
/** O botão que aceita o aviso de privacidade. */
export const PRIVACY_OK_LABEL = 'ENTENDI';
/** Link para as configurações do App, com a permissão negada (UX-DR113). */
export const ALLOW_MIC_LABEL = 'Permitir microfone';
/** O flag do aviso de privacidade na loja do Visitante (não é Variável do Aluno). */
export const PRIVACY_SEEN_KEY = 'speech-privacy';

/**
 * `loading`: lendo o flag. `pending`: falta o aviso (abre quando o microfone
 * está pronto). `closed`: fechado sem decidir (o toque no microfone o reabre).
 * `accepted`: visto, neste aparelho ou agora.
 */
type Notice = 'loading' | 'pending' | 'closed' | 'accepted';

/**
 * Fala "It's your turn" (FR-16, UX-DR74, UX-DR75, UX-DR112 a UX-DR114): a cena
 * com Alex `listen`, o enunciado, a frase-alvo com as Variáveis do Aluno e o
 * microfone. Antes do primeiro uso no aparelho, a folha de privacidade; ENTENDI
 * segue para a permissão do sistema. A transcrição sai com as Variáveis do
 * Aluno trocadas pelos tokens e vai pelo `useEvaluation` (o microfone dispara a
 * Tentativa, sem VERIFICAR). "NÃO POSSO FALAR AGORA" pula (`skipped`, xp 0)
 * até haver Resultado; com o microfone indisponível, vira o botão primário.
 */
export function SpeechActivity({ activity, versionId, setFooter, setSheet, advance }: ActivityProps) {
  const context = useRenderVars();
  const { store } = useVisitor();
  const view = activity as SpeechView;
  const [heard, setHeard] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>('loading');

  useEffect(() => {
    let alive = true;
    store
      .seen(PRIVACY_SEEN_KEY)
      .catch((error: unknown) => {
        captureError(error);
        return false;
      })
      .then((seen) => {
        if (alive) setNotice(seen ? 'accepted' : 'pending');
      });
    return () => {
      alive = false;
    };
  }, [store]);

  const expectedLines = useCallback(
    (expected: Answer): ContentText[] =>
      'transcript' in expected && typeof expected.transcript === 'string' ? [expected.transcript] : [],
    [],
  );

  // Envia a Tentativa: o `check` vem do `useEvaluation`, logo abaixo.
  const send = useRef<(transcript: string) => void>(() => {});
  const onFinal = useCallback((transcript: string) => send.current(transcript), []);
  const mic = useSpeechRecognition({ onFinal });
  // As funções do microfone são estáveis; o objeto `mic` muda a cada render.
  const { cancel, clearMessage, requestAccess, toggle } = mic;

  const onRetry = useCallback(() => {
    setHeard(null);
    clearMessage();
  }, [clearMessage]);

  const { phase, attempts, check, error } = useEvaluation({
    activity,
    versionId,
    setFooter,
    setSheet,
    advance,
    answer: null,
    trigger: 'activity',
    heard,
    onRetry,
    expectedLines,
  });

  // Antes de enviar, o nome e o país viram tokens ({name}): faz o possível para o valor não ir à API.
  // A palavra que a frase-alvo também tem como literal (o aluno se chama Alex) fica como veio.
  const { vars, pronoun } = context;
  const target = useMemo(() => {
    try {
      return chooseVariant(view.target, pronoun);
    } catch (failure) {
      captureError(failure);
      return undefined;
    }
  }, [view.target, pronoun]);
  useEffect(() => {
    send.current = (transcript: string) => {
      setHeard(transcript);
      void check({ type: 'speech', transcript: tokenizeVariables(transcript, vars, undefined, target) });
    };
  }, [check, vars, target]);

  // Pular passa pela rota `completions` no player (recibo, depois Progresso com xp 0);
  // a falha fica no rodapé, com a folha de aviso fechada.
  // Enquanto a conclusão está no ar, o microfone fica travado (nunca Tentativa e conclusão juntas).
  const [skipping, setSkipping] = useState(false);
  const skip = useCallback(async () => {
    cancel();
    setNotice((value) => (value === 'pending' ? 'closed' : value));
    setSkipping(true);
    try {
      await advance({ outcome: 'skipped', xp: 0 });
    } finally {
      setSkipping(false);
    }
  }, [cancel, advance]);
  const onSkip = useCallback(() => void skip(), [skip]);

  const unavailable = mic.status === 'unavailable';
  const answering = phase === 'answering' || phase === 'checking';

  // O rodapé é da Fala enquanto o aluno responde: o pular, até haver Resultado. Com o
  // microfone indisponível, ele é o botão primário sempre (senão, depois de um TENTAR
  // DE NOVO, não haveria saída). A falha de envio vai na legenda do microfone.
  useEffect(() => {
    if (!answering) return;
    if (attempts > 0 && !unavailable) {
      setFooter(null);
      return;
    }
    setFooter({
      label: SKIP_LABEL,
      variant: unavailable ? 'primary' : 'link',
      busy: phase === 'checking',
      onPress: onSkip,
    });
  }, [answering, attempts, unavailable, phase, onSkip, setFooter]);

  const accepting = useRef(false);
  const onAccept = useCallback(async () => {
    if (accepting.current) return;
    accepting.current = true;
    setNotice('accepted');
    try {
      await store.markSeen(PRIVACY_SEEN_KEY);
    } catch (failure) {
      captureError(failure);
    }
    await requestAccess();
  }, [store, requestAccess]);

  const onMic = useCallback(() => {
    if (notice !== 'accepted') {
      setNotice('pending');
      return;
    }
    toggle();
  }, [notice, toggle]);

  const ready = mic.status === 'idle' || mic.status === 'listening';
  const noticeOpen = notice === 'pending' && ready;
  const denied = unavailable && mic.reason === 'denied' && Platform.OS !== 'web';

  return (
    <View style={styles.body} testID="speech-activity">
      <View style={styles.head}>
        <RenderedText
          style={styles.title}
          accessibilityRole="header"
          text={view.title}
          vars={context.vars}
          pronoun={context.pronoun}
        />
        {view.prompt ? (
          <RenderedText style={styles.prompt} text={view.prompt} vars={context.vars} pronoun={context.pronoun} />
        ) : null}
      </View>
      <SceneFrame pose="listen" testID="speech-scene">
        <Card testID="speech-target">
          <RenderedText style={styles.target} text={view.target} vars={context.vars} pronoun={context.pronoun} />
        </Card>
      </SceneFrame>
      <View style={styles.mic}>
        <MicButton
          listening={mic.status === 'listening'}
          disabled={unavailable}
          onPress={answering && phase !== 'checking' && mic.status !== 'checking' && !skipping ? onMic : undefined}
          message={error ? messageFor(error) : (mic.message ?? undefined)}
        />
        {denied ? (
          <TextLink
            label={ALLOW_MIC_LABEL}
            onPress={() => {
              Linking.openSettings().catch(captureError);
            }}
            testID="speech-allow-mic"
          />
        ) : null}
      </View>
      <NoticeSheet
        open={noticeOpen}
        text={privacyText()}
        confirmLabel={PRIVACY_OK_LABEL}
        onConfirm={() => void onAccept()}
        declineLabel={SKIP_LABEL}
        onDecline={onSkip}
        onRequestClose={() => setNotice('closed')}
        testID="speech-privacy"
      />
    </View>
  );
}

/** A cena ocupa a largura toda: a moldura tira o recuo lateral. */
SpeechActivity.bleed = true;

const styles = StyleSheet.create({
  body: { gap: spacing[4] },
  head: { paddingHorizontal: spacing.screenX, gap: spacing[2] },
  title: { ...typography.title, color: color.ink },
  prompt: { ...typography.body, color: color.mutedStrong },
  target: { ...typography.target, color: color.ink },
  mic: { alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing.screenX },
});
