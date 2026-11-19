import { StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '../ui';
import { color, spacing, typography } from '../ui/tokens';

// Copy do convite do Visitante (EXPERIENCE.md, Voice and Tone; UX-DR115).
export const INVITE_TITLE = 'Seu progresso está só neste aparelho';
export const INVITE_BODY = 'Crie uma conta grátis para guardar o Estágio 1 e continuar no Estágio 2.';
export const INVITE_SIGN_UP = 'CRIAR CONTA';
/** Destino de CRIAR CONTA: o cadastro, com o cartão ouro e o nome do Visitante (2.1, UX-DR98). */
export const SIGN_UP_PATH = { pathname: '/cadastro', params: { de: 'convite' } } as const;

/**
 * O cartão ouro do convite ao cadastro (UX-DR115): no Resumo do Estágio 1, no
 * lugar do CONTINUAR, e ao tentar o Estágio 2. CRIAR CONTA é a ação principal.
 */
export function StageInvite({ onSignUp }: { onSignUp: () => void }) {
  return (
    <Card tone="reward" testID="stage-invite">
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {INVITE_TITLE}
        </Text>
        <Text style={styles.body}>{INVITE_BODY}</Text>
        <Button label={INVITE_SIGN_UP} onPress={onSignUp} fullWidth testID="stage-invite-sign-up" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing[3] },
  title: { ...typography.item, color: color.ink },
  body: { ...typography.body, color: color.ink },
});
