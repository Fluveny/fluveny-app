import { StyleSheet, Text } from 'react-native';

import { RenderedText, useRenderVars } from '../renderer';
import { FeedbackSheet, type FeedbackAction } from '../ui';
import { color, typography } from '../ui/tokens';
import type { SheetSpec } from './registry';

/** "We heard: “hi alex i'm julia”" (EXPERIENCE.md, Voice and Tone). */
export const heardLine = (transcript: string) => `We heard: “${transcript}”`;

/**
 * A folha de feedback no lugar do rodapé. Na Fala, mostra o que o aluno disse
 * ("A gente ouviu"), como veio, sem renderizar. Justificativas e resposta esperada
 * vêm cruas do servidor e saem renderizadas com as Variáveis do Aluno. Sem
 * rede, a ação que chama o servidor vira "SEM CONEXÃO" desabilitada.
 */
export function PlayerSheet({
  sheet,
  online,
  offlineLabel,
}: {
  sheet: SheetSpec;
  online: boolean;
  offlineLabel: string;
}) {
  const { vars, pronoun } = useRenderVars();
  const actions: FeedbackAction[] = sheet.actions.map((action, index) =>
    action.network && !online
      ? { label: offlineLabel, disabled: true, variant: action.variant, testID: `sheet-offline-${index}` }
      : { label: action.label, variant: action.variant, onPress: action.onPress, busy: action.busy },
  );
  const expected = sheet.expected?.length
    ? sheet.expected.map((line, i) => (
        <RenderedText key={i} style={styles.expected} text={line} vars={vars} pronoun={pronoun} />
      ))
    : undefined;
  return (
    // Uma folha por tom: trocar de tom (Erro → Vamos revisar) sobe a folha de novo.
    <FeedbackSheet
      key={sheet.tone}
      tone={sheet.tone}
      result={sheet.result}
      xpGain={sheet.xpGain}
      expected={expected}
      error={sheet.error}
      actions={actions}
    >
      {sheet.heard ? (
        <Text style={styles.heard} testID="sheet-heard">
          {heardLine(sheet.heard)}
        </Text>
      ) : null}
      {(sheet.justifications ?? []).map((text, i) => (
        <RenderedText
          key={i}
          testID="sheet-justification"
          style={styles.justification}
          text={text}
          vars={vars}
          pronoun={pronoun}
        />
      ))}
    </FeedbackSheet>
  );
}

const styles = StyleSheet.create({
  expected: { ...typography.item, color: color.ink },
  justification: { ...typography.body, color: color.ink },
  heard: { ...typography.bodyStrong, color: color.ink },
});
