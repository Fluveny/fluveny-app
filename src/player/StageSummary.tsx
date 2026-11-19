import { useEffect, useRef } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RenderedText, useRenderVars, type ContentText } from '../renderer';
import { Alex, Button, Card, Confetti } from '../ui';
import { color, size, spacing, typography } from '../ui/tokens';
import { PlayerTop } from './PlayerFrame';
import { StageInvite } from './StageInvite';
import { skippedLine, type StageSummary as Summary } from './stageStats';

/** "Estágio 1 concluído". */
export const stageDoneLabel = (number: number) => `Estágio ${number} concluído`;
/** "Meet & Greet: check!" (EXPERIENCE.md, Voice and Tone). */
export const stageDoneTitle = (title: string) => (title ? `${title}: check!` : 'Check!');
export const XP_STAT = 'XP';
export const RESULT_STAT = 'Resultado';
export const MINUTES_STAT = 'Minutos';
/** A ação do Aluno com conta no fim do Estágio (2.1), no lugar do convite. */
export const SUMMARY_CONTINUE = 'CONTINUAR';

type Props = {
  stageNumber: number;
  /** O título do Estágio já em texto puro, com as Variáveis do Aluno. */
  stageTitle: string;
  /** A frase do `completion` do Estágio, crua, como vem na visão do Estágio; sem ela (ausente ou `null`), a linha não aparece. */
  completion: ContentText | null | undefined;
  summary: Summary;
  online: boolean;
  onClose: () => void;
  onSignUp: () => void;
  /** Aluno com conta (2.1): CONTINUAR primário no lugar do convite ao cadastro. */
  onContinue?: () => void;
};

function Stat({ label, value, spoken, tone }: { label: string; value: string; spoken: string; tone: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={spoken}>
      <Card>
        <View style={styles.statContent}>
          <Text style={[styles.statValue, { color: tone }]}>{value}</Text>
          <Text style={styles.statLabel}>{label}</Text>
        </View>
      </Card>
    </View>
  );
}

/**
 * Resumo do fim do Estágio do Visitante (UX-DR104, UX-DR115): Alex `cheer` e
 * confete (sem confete com "remover animações"), "{Estágio}: check!", a frase
 * do conteúdo, XP, Resultado médio, minutos e as puladas; no lugar do
 * CONTINUAR, o convite ouro (o Aluno com conta, 2.1, vê o CONTINUAR, que volta à raiz). O ✕ (e o voltar) leva à boas-vindas. Ao abrir,
 * o título é anunciado ao leitor de tela.
 */
export function StageSummary({
  stageNumber,
  stageTitle,
  completion,
  summary,
  online,
  onClose,
  onSignUp,
  onContinue,
}: Props) {
  const { vars, pronoun } = useRenderVars();
  const skipped = skippedLine(summary.skipped);
  const title = stageDoneTitle(stageTitle);
  // O fim do Estágio é anunciado, como as outras trocas do player; uma vez, ao abrir.
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    AccessibilityInfo.announceForAccessibility(title);
  }, [title]);
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']} testID="stage-summary">
      <PlayerTop onClose={onClose} online={online} />
      <View style={styles.body}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.alex}>
            <Alex pose="cheer" size={size.stageAlex} />
          </View>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>{stageDoneLabel(stageNumber)}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            {completion === undefined || completion === null ? null : (
              <RenderedText
                text={completion}
                vars={vars}
                pronoun={pronoun}
                style={styles.phrase}
                lang="en"
                testID="stage-completion"
              />
            )}
          </View>
          <View style={styles.stats}>
            <Stat label={XP_STAT} value={`+${summary.xp}`} spoken={`${summary.xp} XP`} tone={color.red} />
            {summary.resultPct === null ? null : (
              <Stat
                label={RESULT_STAT}
                value={`${summary.resultPct}%`}
                spoken={`${RESULT_STAT} médio: ${summary.resultPct}%`}
                tone={color.tealDk}
              />
            )}
            {summary.minutes === null ? null : (
              <Stat
                label={MINUTES_STAT}
                value={String(summary.minutes)}
                spoken={`${summary.minutes} ${summary.minutes === 1 ? 'minuto' : 'minutos'}`}
                tone={color.blue}
              />
            )}
          </View>
          {skipped ? (
            <Text style={styles.skipped} testID="stage-skipped">
              {skipped}
            </Text>
          ) : null}
          <View style={styles.grow} />
          {onContinue ? (
            <Button label={SUMMARY_CONTINUE} onPress={onContinue} fullWidth testID="stage-summary-continue" />
          ) : (
            <StageInvite onSignUp={onSignUp} />
          )}
        </ScrollView>
        {/* Depois da rolagem: o confete cai por cima dos cartões. */}
        <Confetti />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  body: { flex: 1 },
  content: { flexGrow: 1, gap: spacing[4], paddingHorizontal: spacing.screenX, paddingBottom: spacing[6] },
  alex: { alignItems: 'center' },
  heading: { alignItems: 'center', gap: spacing[2] },
  eyebrow: { ...typography.eyebrow, color: color.tealDk, textTransform: 'uppercase', textAlign: 'center' },
  title: { ...typography.h1, color: color.ink, textAlign: 'center' },
  phrase: { ...typography.body, color: color.mutedStrong, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: spacing.half },
  stat: { flex: 1 },
  statContent: { alignItems: 'center', gap: spacing[1] },
  statValue: { ...typography.title },
  statLabel: { ...typography.caption, color: color.mutedStrong },
  skipped: { ...typography.caption, color: color.mutedStrong, textAlign: 'center' },
  grow: { flexGrow: 1 },
});
