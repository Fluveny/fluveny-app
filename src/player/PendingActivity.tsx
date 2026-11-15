import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '../ui';
import { color, spacing, typography } from '../ui/tokens';
import { plainText } from './plainText';
import type { ActivityProps } from './registry';

// [ASSUMPTION] Copy do cartão do Tipo sem componente (matriz da 1.10).
export const PENDING_TITLE = 'Atividade em preparação';
export const PENDING_BODY = 'Esta parte ainda está sendo montada. Toque em CONTINUAR para seguir.';
export const CONTINUE_LABEL = 'CONTINUAR';

/**
 * Cartão do Tipo que ainda não tem componente: mostra o título da Atividade
 * como texto puro e libera CONTINUAR, que avança sem gravar Progresso.
 */
export function PendingActivity({ activity, setFooter, advance }: ActivityProps) {
  useEffect(() => {
    setFooter({ label: CONTINUE_LABEL, onPress: () => advance() });
  }, [setFooter, advance]);

  const title = plainText(activity.title);
  return (
    <Card testID="pending-activity">
      <View style={styles.body}>
        <Text style={styles.title} accessibilityRole="header">
          {PENDING_TITLE}
        </Text>
        {title ? <Text style={styles.activity}>{title}</Text> : null}
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
