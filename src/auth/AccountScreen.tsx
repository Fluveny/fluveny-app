import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../api/client';
import { messageFor, NETWORK_ERROR } from '../api/errors';
import countries from '../player/countries.json';
import { Button, Card, StatusBanner, TextField, TextLink, WordChip } from '../ui';
import { color, spacing, typography } from '../ui/tokens';
import {
  accountNameOk,
  changePassword,
  CURRENT_PASSWORD_INVALID,
  profileChanges,
  requestEmailChange,
  updateProfile,
} from './account';
import { DeleteAccount } from './DeleteAccount';
import { useLeave } from './FormFrame';
import { EMAIL_MAX, EMAIL_PROBLEM, emailOk, NAME_MAX, PASSWORD_HINT, PASSWORD_PROBLEM, passwordOk } from './signupForm';
import { savePronouns, type PronounSet, type StudentProfile } from './student';
import { SignOut } from './StudentHome';

// Copy da Conta (2.9, UX-DR108). [ASSUMPTION: copy] Textos propostos na 2.9, a revisar com UX.
export const ACCOUNT_TITLE = 'Conta';
export const BACK_LABEL = 'Voltar';
export const DATA_SECTION = 'Seus dados';
export const NAME_FIELD = 'Nome';
export const COUNTRY_FIELD = 'País';
export const NAME_PROBLEM = `O nome pode ter até ${NAME_MAX} caracteres.`;
export const SAVE_LABEL = 'SALVAR';
export const DATA_SAVED = 'Dados salvos.';
export const PRONOUNS_SECTION = 'Pronomes';
export const PRONOUNS_TITLE = 'Nas histórias, como Alex deve se referir a você?';
export const PRONOUN_OPTIONS: readonly { value: PronounSet; label: string; example: string }[] = [
  { value: 'SHE', label: 'she/her', example: 'She is from Brazil.' },
  { value: 'HE', label: 'he/him', example: 'He is from Brazil.' },
  { value: 'THEY', label: 'they/them', example: 'They are from Brazil.' },
];
export const EMAIL_SECTION = 'E-mail';
export const currentEmailLine = (email: string) => `Seu e-mail: ${email}`;
export const NEW_EMAIL_FIELD = 'Novo e-mail';
export const CURRENT_PASSWORD_FIELD = 'Senha atual';
export const CHANGE_EMAIL_LABEL = 'TROCAR E-MAIL';
export const pendingEmailText = (pending: string, email: string) =>
  `Enviamos um link para ${pending}. Seu e-mail continua ${email} até você confirmar.`;
export const RESEND_EMAIL_LABEL = 'Enviar de novo';
export const RESEND_NEEDS_PASSWORD = 'Digite a senha atual para enviar de novo.';
export const PASSWORD_REQUIRED = 'Digite a senha atual.';
export const PASSWORD_SECTION = 'Senha';
export const NEW_PASSWORD_FIELD = 'Nova senha';
export const SAVE_PASSWORD_LABEL = 'SALVAR SENHA';
// [ASSUMPTION: copy] A frase dos outros aparelhos segue a API (as outras sessões são encerradas).
export const PASSWORD_CHANGED = 'Senha alterada. Os outros aparelhos foram desconectados.';
export const SAME_PASSWORD = 'A nova senha precisa ser diferente da atual.';
export const SAME_EMAIL = 'Esse já é o seu e-mail.';
export const PENDING_SAME_EMAIL = 'Já pedimos a troca para esse e-mail. Use "Enviar de novo".';
export const emailRequested = (email: string) => `Enviamos um link para ${email}.`;

/** Os países, como no Diálogo (a `countries.json` da API). */
const COUNTRIES: readonly { code: string; name: string }[] = countries;
const KEYBOARD_AVOIDING = Platform.OS !== 'web';

const codeOf = (error: unknown) => (error instanceof ApiError ? error.code : NETWORK_ERROR);

function announce(text: string) {
  AccessibilityInfo.announceForAccessibility(text);
}

/** Trava de toque duplo: a ação só roda de novo depois de terminar. */
function useOnce() {
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  return { busy, run, mounted };
}

/**
 * A Conta do Aluno (2.9, FR-5, UX-DR108): tela rolável em `canvas`, com as
 * seções Seus dados, Pronomes, E-mail e Senha, o Sair (2.3) e a exclusão
 * da conta (2.10). Senha e e-mail digitados ficam só no estado da tela.
 */
export function AccountScreen({ student }: { student: StudentProfile }) {
  const leave = useLeave();
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']} testID="account-screen">
      <KeyboardAvoidingView style={styles.grow} behavior="padding" enabled={KEYBOARD_AVOIDING}>
        <ScrollView style={styles.grow} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <TextLink label={BACK_LABEL} small onPress={leave} testID="account-back" />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {ACCOUNT_TITLE}
          </Text>
          <DataSection student={student} />
          <PronounSection student={student} />
          <EmailSection student={student} />
          <PasswordSection />
          <SignOut />
          <DeleteAccount />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, children, testID }: { title: string; children: ReactNode; testID: string }) {
  return (
    <Card testID={testID}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {children}
      </View>
    </Card>
  );
}

function Feedback({ text, tone, testID }: { text: string | null; tone: 'error' | 'ok'; testID: string }) {
  if (!text) return null;
  return (
    <Text
      style={tone === 'error' ? styles.error : styles.ok}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      {text}
    </Text>
  );
}

function DataSection({ student }: { student: StudentProfile }) {
  const client = useQueryClient();
  const [name, setName] = useState(student.name ?? '');
  const [country, setCountry] = useState<string | null>(student.country ?? null);
  const [notice, setNotice] = useState<{ text: string; tone: 'error' | 'ok' } | null>(null);
  const { busy, run, mounted } = useOnce();
  // Sem edição pendente, os campos seguem o perfil (o Diálogo ou uma releitura podem mudá-lo).
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current) return;
    setName(student.name ?? '');
    setCountry(student.country ?? null);
  }, [student.name, student.country]);
  const nameValid = accountNameOk(name);
  const changes = profileChanges(student, name, country);
  const changed = Object.keys(changes).length > 0;

  const save = () =>
    void run(async () => {
      if (!nameValid || !changed) return;
      setNotice(null);
      const outcome = await updateProfile(client, changes);
      if (!mounted.current) return;
      if (outcome.kind === 'ok') dirty.current = false;
      const text = outcome.kind === 'ok' ? DATA_SAVED : messageFor(outcome.code);
      setNotice({ text, tone: outcome.kind === 'ok' ? 'ok' : 'error' });
      announce(text);
    });

  return (
    <Section title={DATA_SECTION} testID="account-data">
      <TextField
        label={NAME_FIELD}
        value={name}
        onChangeText={(text) => {
          setNotice(null);
          dirty.current = true;
          setName(text);
        }}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="nickname"
        maxLength={NAME_MAX + 20}
        error={nameValid ? undefined : NAME_PROBLEM}
        testID="account-name"
      />
      <Text style={styles.label}>{COUNTRY_FIELD}</Text>
      <View style={styles.chips} accessibilityLabel={COUNTRY_FIELD} accessibilityRole="radiogroup">
        {COUNTRIES.map((entry) => (
          <WordChip
            key={entry.code}
            label={entry.name}
            state={entry.name === country ? 'placed' : 'idle'}
            onPress={() => {
              setNotice(null);
              dirty.current = true;
              setCountry(entry.name);
            }}
            testID={`account-country-${entry.code}`}
          />
        ))}
      </View>
      <Feedback text={notice?.text ?? null} tone={notice?.tone ?? 'ok'} testID="account-data-notice" />
      <Button
        label={SAVE_LABEL}
        onPress={save}
        disabled={!changed || !nameValid}
        busy={busy}
        fullWidth
        testID="account-data-save"
      />
    </Section>
  );
}

function PronounSection({ student }: { student: StudentProfile }) {
  const client = useQueryClient();
  // A escolha em gravação (otimista); sem ela, vale a do perfil, que o cache mantém atual.
  const [pending, setPending] = useState<PronounSet | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const { busy, run, mounted } = useOnce();
  const choice = pending ?? student.pronounSet ?? null;

  const pick = (value: PronounSet) =>
    void run(async () => {
      if (value === choice) return;
      setPending(value);
      setFailure(null);
      try {
        await savePronouns(client, value);
      } catch (error) {
        if (!mounted.current) return;
        const text = messageFor(codeOf(error));
        setFailure(text);
        announce(text);
      } finally {
        // Sucesso: o perfil no cache já traz a escolha; falha: volta a anterior.
        if (mounted.current) setPending(null);
      }
    });

  return (
    <Section title={PRONOUNS_SECTION} testID="account-pronouns">
      <Text style={styles.body}>{PRONOUNS_TITLE}</Text>
      {PRONOUN_OPTIONS.map((option) => (
        <Card
          key={option.value}
          tone={choice === option.value ? 'selected' : 'neutral'}
          onPress={() => pick(option.value)}
          disabled={busy}
          accessibilityLabel={`${option.label}, ${option.example}`}
          accessibilityRole="radio"
          testID={`account-pronoun-${option.value}`}
        >
          <Text style={styles.optionLabel}>{option.label}</Text>
          <Text style={styles.body} lang="en">
            {option.example}
          </Text>
        </Card>
      ))}
      <Feedback text={failure} tone="error" testID="account-pronouns-failure" />
    </Section>
  );
}

function EmailSection({ student }: { student: StudentProfile }) {
  const client = useQueryClient();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problems, setProblems] = useState<{ email?: string; password?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const { busy, run, mounted } = useOnce();
  const pending = student.pendingEmail ?? null;

  const [sent, setSent] = useState<string | null>(null);

  const send = (email: string, resend: boolean) =>
    void run(async () => {
      setFailure(null);
      setSent(null);
      const next: { email?: string; password?: string } = {};
      if (!resend) {
        const typed = email.trim().toLowerCase();
        if (!emailOk(email)) next.email = EMAIL_PROBLEM;
        else if (typed === student.email.toLowerCase()) next.email = SAME_EMAIL;
        else if (pending && typed === pending.toLowerCase()) next.email = PENDING_SAME_EMAIL;
      }
      if (!password) next.password = resend ? RESEND_NEEDS_PASSWORD : PASSWORD_REQUIRED;
      setProblems(next);
      if (next.email || next.password) {
        announce((next.email ?? next.password)!);
        return;
      }
      const outcome = await requestEmailChange(client, email, password);
      if (!mounted.current) return;
      if (outcome.kind === 'ok') {
        setPassword('');
        setNewEmail('');
        // O aviso vale mesmo se a releitura do perfil falhar (a faixa só vem com ela).
        const text = emailRequested(email.trim());
        setSent(text);
        announce(text);
        return;
      }
      const text = messageFor(outcome.code);
      setFailure(text);
      announce(text);
    });

  return (
    <Section title={EMAIL_SECTION} testID="account-email">
      <Text style={styles.body} testID="account-current-email">
        {currentEmailLine(student.email)}
      </Text>
      {pending ? (
        <StatusBanner
          tone="quiet"
          text={pendingEmailText(pending, student.email)}
          action={{ label: RESEND_EMAIL_LABEL, onPress: () => send(pending, true), busy }}
          testID="account-pending-email"
        />
      ) : null}
      <TextField
        label={NEW_EMAIL_FIELD}
        value={newEmail}
        onChangeText={(text) => {
          setFailure(null);
          setSent(null);
          setProblems((p) => ({ ...p, email: undefined }));
          setNewEmail(text);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        inputMode="email"
        maxLength={EMAIL_MAX}
        error={problems.email}
        testID="account-new-email"
      />
      <TextField
        label={CURRENT_PASSWORD_FIELD}
        value={password}
        onChangeText={(text) => {
          setFailure(null);
          setProblems((p) => ({ ...p, password: undefined }));
          setPassword(text);
        }}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        error={problems.password}
        testID="account-email-password"
      />
      <Feedback text={sent} tone="ok" testID="account-email-sent" />
      <Feedback text={failure} tone="error" testID="account-email-failure" />
      <Button
        label={CHANGE_EMAIL_LABEL}
        onPress={() => send(newEmail, false)}
        busy={busy}
        fullWidth
        testID="account-email-save"
      />
    </Section>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [problems, setProblems] = useState<{ current?: string; next?: string }>({});
  const [notice, setNotice] = useState<{ text: string; tone: 'error' | 'ok' } | null>(null);
  const { busy, run, mounted } = useOnce();

  const save = () =>
    void run(async () => {
      setNotice(null);
      const found: { current?: string; next?: string } = {};
      if (!current) found.current = PASSWORD_REQUIRED;
      if (!passwordOk(next)) found.next = PASSWORD_PROBLEM;
      else if (next === current) found.next = SAME_PASSWORD;
      setProblems(found);
      if (found.current || found.next) {
        announce((found.current ?? found.next)!);
        return;
      }
      const outcome = await changePassword(current, next);
      if (!mounted.current) return;
      if (outcome.kind === 'ok') {
        setCurrent('');
        setNext('');
        setNotice({ text: PASSWORD_CHANGED, tone: 'ok' });
        announce(PASSWORD_CHANGED);
        return;
      }
      const text = messageFor(outcome.code);
      if (outcome.code === CURRENT_PASSWORD_INVALID) setProblems({ current: text });
      else setNotice({ text, tone: 'error' });
      announce(text);
    });

  return (
    <Section title={PASSWORD_SECTION} testID="account-password">
      <TextField
        label={CURRENT_PASSWORD_FIELD}
        value={current}
        onChangeText={(text) => {
          setNotice(null);
          setProblems((p) => ({ ...p, current: undefined }));
          setCurrent(text);
        }}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        error={problems.current}
        testID="account-current-password"
      />
      <TextField
        label={NEW_PASSWORD_FIELD}
        value={next}
        onChangeText={(text) => {
          setNotice(null);
          setProblems((p) => ({ ...p, next: undefined }));
          setNext(text);
        }}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        hint={PASSWORD_HINT}
        error={problems.next}
        testID="account-new-password"
      />
      <Feedback text={notice?.text ?? null} tone={notice?.tone ?? 'ok'} testID="account-password-notice" />
      <Button label={SAVE_PASSWORD_LABEL} onPress={save} busy={busy} fullWidth testID="account-password-save" />
    </Section>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  grow: { flex: 1 },
  content: {
    flexGrow: 1,
    gap: spacing[4],
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
  },
  top: { flexDirection: 'row', marginLeft: -spacing[3] },
  title: { ...typography.h1, color: color.ink },
  section: { gap: spacing[3] },
  sectionTitle: { ...typography.item, color: color.ink },
  label: { ...typography.bodyStrong, color: color.ink },
  body: { ...typography.body, color: color.mutedStrong },
  optionLabel: { ...typography.item, color: color.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  error: { ...typography.bodyStrong, color: color.redDk },
  ok: { ...typography.bodyStrong, color: color.tealDk },
});
