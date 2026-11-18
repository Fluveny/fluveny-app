import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, StyleSheet, Text, View, type TextInput } from 'react-native';

import { captureError } from '../../observability/sentry';
import { RenderedText, useRenderVars, type ContentText } from '../../renderer';
import { Button, Card, SpeechBubble, TextField } from '../../ui';
import { color, spacing, typography } from '../../ui/tokens';
import type { ActivityProps, ActivityView } from '../registry';
import { GapFill } from '../GapFill';
import { useGapAttempt } from '../useGapAttempt';
import { CONTINUE_LABEL } from '../useEvaluation';
import { useRevealField } from '../PlayerFrame';

type FreeView = Extract<ActivityView, { type: 'free' }>;

export const SEND_LABEL = 'ENVIAR';
export const EXTRA_HELP_LABEL = 'EXTRA HELP';
export const ANSWER_LABEL = 'Sua resposta';
export const ANSWER_PLACEHOLDER = 'Type your answer…';
export const EXTRA_HELP_HINT = 'Travou? O Extra Help transforma a pergunta num exercício guiado.';
export const YOU_WROTE = 'Você escreveu';
export const MODEL_ANSWER = 'Uma resposta possível';
export const COMPARE = 'Compare com a sua. Não existe uma única resposta certa aqui.';

/** ENVIAR pede ao menos 2 caracteres, sem contar os espaços nas pontas (UX-DR77). */
export const MIN_ANSWER = 2;

/** Limite do campo: o texto nunca sai do aparelho, é só para a tela não crescer sem fim. */
const MAX_ANSWER = 500;

/** O texto do aluno basta para ENVIAR. */
export function canSend(text: string): boolean {
  return [...text.trim()].length >= MIN_ANSWER;
}

/**
 * Resposta Livre com Extra Help (FR-17, UX-DR77, UX-DR78). Alex pergunta, o
 * aluno escreve com as próprias palavras e ENVIAR conclui com `VIEWED`: o texto
 * dele nunca vai ao servidor nem fica gravado no aparelho (FR-7, NFR4), e a
 * tela mostra o que ele escreveu, sempre como texto puro, ao lado da resposta-
 * modelo que veio na conclusão. Sem correção. Se travar, EXTRA HELP troca a
 * tela, sem volta, pelas lacunas do banco, avaliadas como no Completar lacunas.
 */
export function FreeActivity(props: ActivityProps) {
  const [extraHelp, setExtraHelp] = useState(false);
  const { clearCompletionError } = props;
  const openExtraHelp = useCallback(() => {
    // Uma falha do ENVIAR não fica no rodapé nem nas folhas do Extra Help.
    clearCompletionError?.();
    setExtraHelp(true);
  }, [clearCompletionError]);
  if (extraHelp) return <ExtraHelp {...props} />;
  return <FreeAnswer {...props} onExtraHelp={openExtraHelp} />;
}

/** A pergunta de Alex, em balão, ao lado do avatar. */
function Question({ view }: { view: FreeView }) {
  const context = useRenderVars();
  return (
    <SpeechBubble avatar="listen" testID="free-question">
      <RenderedText style={styles.bubble} text={view.prompt} vars={context.vars} pronoun={context.pronoun} />
    </SpeechBubble>
  );
}

function Title({ view }: { view: FreeView }) {
  const context = useRenderVars();
  return (
    <RenderedText
      style={styles.title}
      accessibilityRole="header"
      text={view.title}
      vars={context.vars}
      pronoun={context.pronoun}
    />
  );
}

function FreeAnswer({
  activity,
  setFooter,
  setSheet,
  advance,
  complete,
  onExtraHelp,
}: ActivityProps & { onExtraHelp: () => void }) {
  const context = useRenderVars();
  const view = activity as FreeView;
  const reveal = useRevealField();
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  /** A resposta-modelo da conclusão: com ela, a tela de comparação. */
  const [modelAnswer, setModelAnswer] = useState<ContentText | null>(null);
  const [sent, setSent] = useState('');
  const finished = useRef(false);
  /** Envio em curso: dois toques antes do re-render não mandam duas conclusões. */
  const inFlight = useRef(false);

  const send = useCallback(async () => {
    if (inFlight.current || !canSend(text)) return;
    if (!complete) {
      captureError(new Error('Resposta Livre sem complete no player'));
      return;
    }
    inFlight.current = true;
    setSending(true);
    Keyboard.dismiss();
    try {
      // Só a conclusão VIEWED vai ao servidor; o texto fica nesta tela.
      const result = await complete('viewed');
      if (!result) return;
      setSent(text.trim());
      // Sem a resposta-modelo (não deveria acontecer), a comparação mostra só o texto do aluno.
      if (result.modelAnswer === undefined) captureError(new Error('Conclusão da Resposta Livre sem modelAnswer'));
      setModelAnswer(result.modelAnswer ?? '');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }, [text, complete]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    void advance({ outcome: 'viewed', xp: 0, recorded: true });
  }, [advance]);

  const done = modelAnswer !== null;

  useEffect(() => {
    setSheet(null);
    if (done) {
      setFooter({ label: CONTINUE_LABEL, onPress: finish });
      return;
    }
    setFooter({ label: SEND_LABEL, disabled: !canSend(text), busy: sending, onPress: () => void send() });
  }, [done, text, sending, send, finish, setFooter, setSheet]);

  return (
    <View style={styles.body} testID="free-activity">
      <Title view={view} />
      <Question view={view} />
      {done ? (
        <View style={styles.compare} testID="free-compare">
          <Card>
            <Text style={styles.eyebrow}>{YOU_WROTE}</Text>
            {/* Texto puro: o que o aluno escreveu não passa pelo renderizador do conteúdo. */}
            <Text style={styles.answer} testID="free-you-wrote">
              {sent}
            </Text>
          </Card>
          {modelAnswer ? (
            <Card>
              <Text style={styles.eyebrow}>{MODEL_ANSWER}</Text>
              <RenderedText
                style={styles.answer}
                text={modelAnswer}
                vars={context.vars}
                pronoun={context.pronoun}
                testID="free-model-answer"
              />
            </Card>
          ) : null}
          <Text style={styles.hint}>{COMPARE}</Text>
        </View>
      ) : (
        <>
          <TextField
            label={ANSWER_LABEL}
            placeholder={ANSWER_PLACEHOLDER}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={4}
            maxLength={MAX_ANSWER}
            editable={!sending}
            autoCapitalize="sentences"
            autoCorrect={false}
            inputRef={field}
            onFocus={() => reveal(field.current)}
            testID="free-answer"
          />
          <View style={styles.extraHelp}>
            <Text style={styles.hint}>{EXTRA_HELP_HINT}</Text>
            <Button
              label={EXTRA_HELP_LABEL}
              variant="reward"
              small
              disabled={sending}
              onPress={onExtraHelp}
              testID="free-extra-help"
            />
          </View>
        </>
      )}
    </View>
  );
}

/** O Extra Help: as lacunas do banco, com o fluxo de avaliação do Completar lacunas. */
function ExtraHelp({ activity, versionId, setFooter, setSheet, advance }: ActivityProps) {
  const context = useRenderVars();
  const view = activity as FreeView;
  const help = view.extraHelp;
  const { lines, bank, values, setValues, kept, marks, locked } = useGapAttempt({
    activity,
    versionId,
    setFooter,
    setSheet,
    advance,
    type: 'free',
    mode: 'bank',
    lines: help?.lines,
    items: help?.items,
    bank: help?.bank,
  });
  return (
    <View style={styles.body} testID="free-extra-help-activity">
      <Title view={view} />
      <Question view={view} />
      {help?.prompt ? (
        <RenderedText style={styles.prompt} text={help.prompt} vars={context.vars} pronoun={context.pronoun} />
      ) : null}
      <GapFill
        lines={lines}
        mode="bank"
        bank={bank}
        values={values}
        onChange={setValues}
        marks={marks}
        kept={kept}
        disabled={locked}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[4] },
  title: { ...typography.title, color: color.ink },
  bubble: { ...typography.bubble, color: color.ink },
  prompt: { ...typography.body, color: color.mutedStrong },
  extraHelp: { gap: spacing[3], alignItems: 'flex-start' },
  hint: { ...typography.body, color: color.mutedStrong },
  compare: { gap: spacing[3] },
  eyebrow: { ...typography.eyebrow, color: color.mutedStrong, marginBottom: spacing[1] },
  answer: { ...typography.reading, color: color.ink },
});
