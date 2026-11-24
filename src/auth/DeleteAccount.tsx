import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '../api/errors';
import { Button, Card, NoticeSheet, TextField } from '../ui';
import { color, spacing, typography } from '../ui/tokens';
import { CURRENT_PASSWORD_INVALID, deleteAccount } from './account';
import { ACCOUNT_DELETED_REASON } from './accountPaths';

// Exclusão da conta (2.10, FR-6). [ASSUMPTION: copy] Textos propostos na 2.10, sujeitos à revisão jurídica (NFR24).
export const DELETE_SECTION = 'Excluir conta';
export const DELETE_BODY =
  'A exclusão é definitiva. Apagamos seus dados, seu progresso e suas respostas. Não dá para desfazer.';
export const DELETE_PASSWORD_FIELD = 'Senha atual';
export const DELETE_LABEL = 'EXCLUIR CONTA';
export const DELETE_SHEET_TEXT =
  'Excluir sua conta? Seus dados pessoais, seu progresso e suas respostas serão apagados agora, neste e em todos os aparelhos. Não dá para desfazer.';
export const DELETE_CONFIRM = 'EXCLUIR';
export const DELETE_CANCEL = 'CANCELAR';

/**
 * A seção Excluir conta da Conta (2.10): senha atual, EXCLUIR CONTA (desabilitado
 * com a senha vazia) e a folha de confirmação. Com a conta excluída (204 ou
 * 404), a limpeza do sair já rodou: volta à boas-vindas, sem histórico, com o
 * aviso. Senha errada fica no campo; 429, 503 e sem rede, no rodapé. A senha
 * só vive no estado desta seção.
 */
export function DeleteAccount() {
  const client = useQueryClient();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [passwordProblem, setPasswordProblem] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const remove = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setConfirming(false);
    setBusy(true);
    setFailure(null);
    setPasswordProblem(undefined);
    let leaving = false;
    try {
      const outcome = await deleteAccount(client, password);
      if (outcome.kind === 'ok') {
        if (!mounted.current) return;
        leaving = true;
        if (router.canDismiss()) router.dismissAll();
        router.replace({ pathname: '/', params: { motivo: ACCOUNT_DELETED_REASON } });
        return;
      }
      if (!mounted.current) return;
      const text = messageFor(outcome.code);
      if (outcome.code === CURRENT_PASSWORD_INVALID) setPasswordProblem(text);
      else setFailure(text);
      AccessibilityInfo.announceForAccessibility(text);
    } finally {
      if (!leaving) {
        running.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }, [client, router, password]);

  return (
    <Card testID="account-deletion">
      <View style={styles.section}>
        <Text style={styles.title} accessibilityRole="header">
          {DELETE_SECTION}
        </Text>
        <Text style={styles.body}>{DELETE_BODY}</Text>
        <TextField
          label={DELETE_PASSWORD_FIELD}
          value={password}
          onChangeText={(text) => {
            setFailure(null);
            setPasswordProblem(undefined);
            setPassword(text);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          error={passwordProblem}
          editable={!busy}
          testID="account-deletion-password"
        />
        {failure ? (
          <Text
            style={styles.error}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID="account-deletion-failure"
          >
            {failure}
          </Text>
        ) : null}
        <Button
          label={DELETE_LABEL}
          variant="danger"
          onPress={() => {
            if (busy) return;
            setFailure(null);
            setConfirming(true);
          }}
          disabled={!password}
          busy={busy}
          fullWidth
          testID="account-deletion-submit"
        />
      </View>
      <NoticeSheet
        open={confirming}
        text={DELETE_SHEET_TEXT}
        confirmLabel={DELETE_CONFIRM}
        onConfirm={() => void remove()}
        declineLabel={DELETE_CANCEL}
        onDecline={() => setConfirming(false)}
        onRequestClose={() => setConfirming(false)}
        testID="account-deletion-sheet"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing[3] },
  title: { ...typography.item, color: color.ink },
  body: { ...typography.body, color: color.mutedStrong },
  error: { ...typography.bodyStrong, color: color.redDk },
});
