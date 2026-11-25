import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RenderedText, useRenderVars } from '../renderer';
import { Card } from '../ui';
import { color, spacing, typography } from '../ui/tokens';
import type { ActivityProps } from './registry';

// [ASSUMPTION] Copy do cartão do Tipo sem componente (matriz da 1.10).
export const PENDING_TITLE = 'Activity in the works';
export const PENDING_BODY = 'This part is still being built. Tap CONTINUE to move on.';
export const CONTINUE_LABEL = 'CONTINUE';

/**
 * Cartão do Tipo que ainda não tem componente: mostra o título da Atividade,
 * renderizado com as Variáveis do Aluno, e libera CONTINUAR, que avança sem
 * gravar Progresso.
 */
export function PendingActivity({ activity, setFooter, advance }: ActivityProps) {
  useEffect(() => {
    setFooter({ label: CONTINUE_LABEL, onPress: () => advance() });
  }, [setFooter, advance]);

  const { vars, pronoun } = useRenderVars();
  return (
    <Card testID="pending-activity">
      <View style={styles.body}>
        <Text style={styles.title} accessibilityRole="header">
          {PENDING_TITLE}
        </Text>
        {activity.title ? (
          <RenderedText style={styles.activity} text={activity.title} vars={vars} pronoun={pronoun} />
        ) : null}
        <Text style={styles.text}>{PENDING_BODY}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[2] },
  title: { ...typography.title, color: color.ink },
  activity: { ...typography.item, color: color.ink },
  text: { ...typography.body, color: color.muted },
});
