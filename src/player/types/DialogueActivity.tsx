import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';

import { QueryClientContext } from '@tanstack/react-query';

import { ApiError, putNoContent } from '../../api/client';
import { messageFor, UNKNOWN_ERROR } from '../../api/errors';
import { DASHBOARD_QUERY_KEY } from '../../dashboard/dashboard';
import { STUDENT_QUERY_KEY, useCachedStudent, type StudentProfile } from '../../auth/student';
import { captureError } from '../../observability/sentry';
import { RenderedText, renderLabel, useRenderVars, type ContentText, type RenderContext } from '../../renderer';
import { motion, SceneFrame, SpeechBubble, TextField, useReducedMotion, WordChip } from '../../ui';
import { color, spacing, typography } from '../../ui/tokens';
import { useVisitor } from '../../visitor/useVisitor';
import countries from '../countries.json';
import { usePlayerSession } from '../playerSession';
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
 * resposta válida, grava a resposta e retoma as falas; depois da última,
 * conclui com `viewed`. Sem correção. O Visitante grava a Variável só no
 * aparelho, sem rede; o Aluno (2.9) grava no perfil (`PUT
 * /students/me/dialogue-answers`) e, no 204, atualiza o perfil em cache.
 */
export function DialogueActivity({ activity, versionId, setFooter, advance }: ActivityProps) {
  const context = useRenderVars();
  const { variables, store } = useVisitor();
  const { mode } = usePlayerSession();
  const student = useCachedStudent();
  // Fora de um `QueryClientProvider` (testes de uma Atividade solta), sem cliente: só o Visitante.
  const client = useContext(QueryClientContext);
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
  /** A gravação da resposta falhou: a pergunta fica, com `messageFor(code)` no rodapé. */
  const [failed, setFailed] = useState<string | null>(null);

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

  // O Aluno (2.9): o pré-preenchimento vem da conta antes das Variáveis do aparelho.
  const asStudent = mode === 'student' && client !== undefined;
  // O Aluno pré-preenche só da conta: as Variáveis do aparelho podem ser de outro Visitante.
  const name = nameDraft ?? (asStudent ? student?.name : variables.name) ?? '';
  const country = countryDraft ?? (asStudent ? student?.country : variables.country) ?? '';
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const answer = asking === 'name' ? name.trim() : asking === 'country' ? country : null;
  const valid =
    asking === 'name' ? validName(name) : asking === 'country' ? COUNTRIES.some((c) => c.name === country) : true;

  const onContinue = useCallback(async () => {
    if (asking && answer !== null) {
      setSaving(true);
      setFailed(null);
      try {
        if (asStudent) {
          // O Aluno grava no perfil (2.9); o Visitante, só no aparelho (nunca vai para a API).
          await putNoContent('/api/v1/students/me/dialogue-answers', {
            versionId,
            activityKey: view.activityKey,
            [asking]: answer,
          });
          client?.setQueryData<StudentProfile | null>(STUDENT_QUERY_KEY, (profile) =>
            profile ? { ...profile, [asking]: answer } : profile,
          );
          // A saudação do painel traz o nome.
          void client?.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
        } else {
          await store.setVariable(asking, answer);
        }
      } catch (error) {
        if (!(error instanceof ApiError)) captureError(error);
        if (mounted.current) {
          setFailed(error instanceof ApiError ? error.code : UNKNOWN_ERROR);
          setSaving(false);
        }
        return;
      }
      if (!mounted.current) return;
      setSaving(false);
      setAnswered((previous) => new Set(previous).add(asking));
      // A cena vira a página: a fala seguinte entra na hora, sem a tela vazia.
      setShown((value) => value + 1);
      return;
    }
    advance({ outcome: 'viewed', xp: 0 });
  }, [asking, answer, asStudent, versionId, view.activityKey, client, store, advance]);

  useEffect(() => {
    setFooter({
      label: CONTINUE_LABEL,
      disabled: entering || !valid,
      busy: saving,
      onPress: () => void onContinue(),
      ...(failed ? { message: messageFor(failed) } : {}),
    });
  }, [setFooter, entering, valid, saving, failed, onContinue]);

  // Cada resposta vira a página: só ficam as falas depois da última pergunta respondida.
  let start = 0;
  lines.forEach((line, index) => {
    if (index < count && line.ask && answered.has(line.ask)) start = index + 1;
  });
  const visible = lines.slice(start, count);
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
