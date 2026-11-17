import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';

import { messageFor, UNKNOWN_ERROR } from '../../api/errors';
import { captureError } from '../../observability/sentry';
import { RenderedText, renderLabel, useRenderVars, type ContentText, type RenderContext } from '../../renderer';
import { motion, SceneFrame, SpeechBubble, TextField, useReducedMotion, WordChip } from '../../ui';
import { color, spacing, typography } from '../../ui/tokens';
import { useVisitor } from '../../visitor/useVisitor';
import countries from '../countries.json';
import type { ActivityProps, ActivityView } from '../registry';

type DialogueView = Extract<ActivityView, { type: 'dialogue' }>;
type DialogueLine = DialogueView['lines'][number];
type Ask = NonNullable<DialogueLine['ask']>;

export const CONTINUE_LABEL = 'CONTINUAR';
export const NAME_LABEL = 'Seu nome';
export const COUNTRY_LABEL = 'Seu país';
/** Limite do nome, depois do `trim`. */
export const NAME_MAX = 40;

/** Os países da pergunta `country` (cópia da `countries.json` da API, pelo `api:sync`). */
export const COUNTRIES: readonly { code: string; name: string }[] = countries;

/** O nome vale com 1 a 40 caracteres depois do `trim`. */
export function validName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= NAME_MAX;
}

/** Texto puro da fala, para o leitor de tela; conteúdo malformado vai ao Sentry. */
function plain(text: ContentText | undefined, { vars, pronoun }: RenderContext): string {
  if (text === undefined || text === null) return '';
  try {
    return renderLabel(text, vars, pronoun);
  } catch (error) {
    captureError(error);
    return '';
  }
}

/**
 * Diálogo (FR-13, EXPERIENCE.md): a cena do quarto com Alex `wave` e as falas
 * em balões, uma a uma a cada 650 ms (todas juntas com "remover animações").
 * Uma fala com `ask` pausa as falas e mostra a pergunta abaixo da cena: o nome
 * (campo de texto) ou o país (chips de escolha única). CONTINUAR, com a
 * resposta válida, grava a Variável do Aluno (só no aparelho) e retoma as
 * falas; depois da última, conclui com `viewed`. Sem correção, sem rede.
 */
export function DialogueActivity({ activity, setFooter, advance }: ActivityProps) {
  const context = useRenderVars();
  const { variables, store } = useVisitor();
  const reduced = useReducedMotion();
  const view = activity as DialogueView;
  const lines = useMemo<DialogueLine[]>(() => (Array.isArray(view.lines) ? view.lines : []), [view.lines]);

  /** As perguntas já respondidas nesta Atividade. */
  const [answered, setAnswered] = useState<ReadonlySet<Ask>>(() => new Set());
  /** Quantas falas estão na tela (a primeira entra na hora). */
  const [shown, setShown] = useState(Math.min(1, lines.length));
  /** O que o aluno digitou ou tocou; `undefined` mostra a variável salva. */
  const [nameDraft, setNameDraft] = useState<string | undefined>(undefined);
  const [countryDraft, setCountryDraft] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  /** A gravação da resposta falhou: a pergunta fica, com a mensagem no rodapé. */
  const [failed, setFailed] = useState(false);

  // A fala com pergunta sem resposta pausa as seguintes.
  const pauseAt = lines.findIndex((line) => line.ask && !answered.has(line.ask));
  const limit = pauseAt === -1 ? lines.length : pauseAt + 1;
  // Com "remover animações", as falas entram todas juntas até a pausa.
  const count = reduced ? limit : Math.min(shown, limit);
  const entering = count < limit;
  const asking = !entering && pauseAt !== -1 ? lines[pauseAt]!.ask! : null;

  useEffect(() => {
    if (reduced || shown >= limit) return;
    const timer = setTimeout(() => setShown((value) => Math.min(value + 1, limit)), motion.dialogueLineMs);
    return () => clearTimeout(timer);
  }, [shown, limit, reduced]);

  // O leitor de tela anuncia cada fala nova. No web, a lista é uma região viva.
  const announced = useRef(0);
  useEffect(() => {
    if (count <= announced.current) return;
    const fresh = lines.slice(announced.current, count);
    announced.current = count;
    if (Platform.OS === 'web') return;
    const text = fresh.map((line) => `${line.speaker}: ${plain(line.text, context)}`).join(' ');
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [count, lines, context]);

  const name = nameDraft ?? variables.name ?? '';
  const country = countryDraft ?? variables.country ?? '';
  const answer = asking === 'name' ? name.trim() : asking === 'country' ? country : null;
  const valid =
    asking === 'name' ? validName(name) : asking === 'country' ? COUNTRIES.some((c) => c.name === country) : true;

  const onContinue = useCallback(async () => {
    if (asking && answer !== null) {
      setSaving(true);
      setFailed(false);
      try {
        // A resposta fica só no aparelho (nunca vai para a API).
        await store.setVariable(asking, answer);
      } catch (error) {
        captureError(error);
        setFailed(true);
        return;
      } finally {
        setSaving(false);
      }
      setAnswered((previous) => new Set(previous).add(asking));
      return;
    }
    advance({ outcome: 'viewed', xp: 0 });
  }, [asking, answer, store, advance]);

  useEffect(() => {
    setFooter({
      label: CONTINUE_LABEL,
      disabled: entering || !valid,
      busy: saving,
      onPress: () => void onContinue(),
      ...(failed ? { message: messageFor(UNKNOWN_ERROR) } : {}),
    });
  }, [setFooter, entering, valid, saving, failed, onContinue]);

  const visible = lines.slice(0, count);
  return (
    <View style={styles.body} testID="dialogue-activity">
      <SceneFrame pose="wave" testID="dialogue-scene">
        <View
          style={styles.lines}
          accessibilityLiveRegion={Platform.OS === 'web' ? 'polite' : undefined}
          testID="dialogue-lines"
        >
          {visible.map((line) => (
            <SpeechBubble key={line.lineKey} speaker={line.speaker} testID={`dialogue-line-${line.lineKey}`}>
              {/* A fala tem nós (a variável em ouro): o rótulo do leitor ("Alex: …") vai no próprio texto. */}
              <RenderedText
                style={styles.line}
                text={line.text}
                vars={context.vars}
                pronoun={context.pronoun}
                accessible
                accessibilityLabel={`${line.speaker}: ${plain(line.text, context)}`}
              />
            </SpeechBubble>
          ))}
        </View>
      </SceneFrame>
      {asking === 'name' ? (
        <View style={styles.question} testID="dialogue-ask-name">
          <TextField
            label={NAME_LABEL}
            value={name}
            onChangeText={setNameDraft}
            maxLength={NAME_MAX}
            autoFocus
            autoCapitalize="words"
            autoComplete="given-name"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (validName(name) && !saving) void onContinue();
            }}
            testID="dialogue-name"
          />
        </View>
      ) : null}
      {asking === 'country' ? (
        <View style={styles.question} testID="dialogue-ask-country">
          <Text style={styles.label} accessibilityRole="header">
            {COUNTRY_LABEL}
          </Text>
          <View style={styles.chips} accessibilityLabel={COUNTRY_LABEL}>
            {COUNTRIES.map((entry) => (
              <WordChip
                key={entry.code}
                label={entry.name}
                state={entry.name === country ? 'placed' : 'idle'}
                onPress={() => setCountryDraft(entry.name)}
                testID={`dialogue-country-${entry.code}`}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** A cena ocupa a largura toda: a moldura tira o recuo lateral. */
DialogueActivity.bleed = true;

const styles = StyleSheet.create({
  body: { gap: spacing[4] },
  lines: { gap: spacing[3] },
  line: { ...typography.bubble, color: color.ink },
  question: { paddingHorizontal: spacing.screenX, gap: spacing[2] },
  label: { ...typography.bodyStrong, color: color.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
});
