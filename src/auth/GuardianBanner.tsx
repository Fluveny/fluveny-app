import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { messageFor } from '../api/errors';
import { Button, StatusBanner, TextField, TextLink } from '../ui';
import { spacing } from '../ui/tokens';
import { resendGuardianConsent, waitText, type GuardianResendOutcome } from './guardianConsent';
import { EMAIL_MAX, guardianEmailProblem } from './signupForm';

// Faixa ouro do adolescente pendente (2.11, UX-DR116). [ASSUMPTION: copy]
// REVISÃO JURÍDICA (NFR24)
export const GUARDIAN_PENDING_TEXT = 'Seu progresso fica só neste aparelho até seu responsável confirmar pelo e-mail.';
export const GUARDIAN_RESEND_LABEL = 'Reenviar e-mail';
export const GUARDIAN_RESENT = 'Enviamos de novo.';
export const GUARDIAN_FIX_LABEL = 'Corrigir e-mail do responsável';
export const GUARDIAN_NEW_FIELD = 'Novo e-mail do responsável';
export const GUARDIAN_SEND_LABEL = 'ENVIAR';
export const GUARDIAN_FIXED = 'Enviamos para o novo e-mail.';
export const GUARDIAN_CANCEL_LABEL = 'Cancelar';

/** O texto do resultado do reenvio (o 400 do campo fica com o campo). */
function noticeOf(outcome: GuardianResendOutcome, fixed: boolean): string {
  switch (outcome.kind) {
    case 'sent':
      return fixed ? GUARDIAN_FIXED : GUARDIAN_RESENT;
    case 'not-pending':
      return messageFor('GUARDIAN_CONSENT_NOT_PENDING');
    case 'throttled':
      return outcome.retryAfter === undefined ? messageFor('TOO_MANY_REQUESTS') : waitText(outcome.retryAfter);
    case 'invalid-email':
      return messageFor('VALIDATION_FAILED');
    case 'error':
      return messageFor(outcome.code);
  }
}

/**
 * A faixa ouro do adolescente à espera do responsável: "Reenviar e-mail" e
 * "Corrigir e-mail do responsável" (um campo que troca o e-mail e reenvia).
 * O 409 relê o perfil (a conta já está ativa: a faixa some e a migração corre).
 * O e-mail digitado fica só no estado do campo e sai dele depois do 202.
 */
export function GuardianBanner({ ownEmail }: { ownEmail: string }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [guardianEmail, setGuardianEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  /** Depois de um 429 com `Retry-After`: o reenvio fica desabilitado até o prazo, e o aviso sai. */
  const [waiting, setWaiting] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const closeFix = useCallback(() => {
    setFixing(false);
    setGuardianEmail('');
    setFieldError(undefined);
  }, []);

  const send = useCallback(
    async (email?: string) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      const outcome = await resendGuardianConsent(client, email);
      running.current = false;
      if (!mounted.current) return;
      setBusy(false);
      const fixed = email !== undefined;
      if (fixed && outcome.kind === 'invalid-email') {
        setFieldError(messageFor('VALIDATION_FAILED'));
        return;
      }
      // Enviado ao novo e-mail ou a conta já ativa: o campo fecha (e o valor sai).
      if ((fixed && outcome.kind === 'sent') || outcome.kind === 'not-pending') closeFix();
      if (outcome.kind === 'throttled' && outcome.retryAfter !== undefined) {
        setWaiting(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          if (!mounted.current) return;
          setWaiting(false);
          setNotice(null);
        }, outcome.retryAfter * 1000);
      }
      const text = noticeOf(outcome, fixed);
      setNotice(text);
      AccessibilityInfo.announceForAccessibility(text);
    },
    [client, closeFix],
  );

  const submitFix = () => {
    const problem = guardianEmailProblem(guardianEmail, ownEmail);
    setFieldError(problem);
    if (!problem) void send(guardianEmail.trim());
  };

  return (
    <View style={styles.wrap} testID="guardian-banner">
      <StatusBanner
        tone="notice"
        text={notice ? `${GUARDIAN_PENDING_TEXT} ${notice}` : GUARDIAN_PENDING_TEXT}
        action={{
          label: GUARDIAN_RESEND_LABEL,
          onPress: () => void send(),
          busy: busy && !fixing,
          disabled: fixing || busy || waiting,
        }}
        testID="guardian-pending-banner"
      />
      {fixing ? (
        <View style={styles.fix}>
          <TextField
            label={GUARDIAN_NEW_FIELD}
            value={guardianEmail}
            onChangeText={(text) => {
              setFieldError(undefined);
              setGuardianEmail(text);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            inputMode="email"
            maxLength={EMAIL_MAX}
            error={fieldError}
            testID="guardian-fix-email"
          />
          <View style={styles.row}>
            <Button
              label={GUARDIAN_SEND_LABEL}
              small
              onPress={submitFix}
              busy={busy}
              disabled={waiting}
              testID="guardian-fix-send"
            />
            <TextLink
              label={GUARDIAN_CANCEL_LABEL}
              small
              onPress={closeFix}
              disabled={busy}
              testID="guardian-fix-cancel"
            />
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          <TextLink label={GUARDIAN_FIX_LABEL} small onPress={() => setFixing(true)} testID="guardian-fix" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[2] },
  fix: { gap: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
});
