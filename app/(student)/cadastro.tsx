import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../src/api/client';
import { messageFor, NETWORK_ERROR } from '../../src/api/errors';
import {
  ageBand,
  AGE_BELOW_TEXT,
  isoDate,
  maskBirthDate,
  NAME_MAX,
  EMAIL_MAX,
  parseBirthDate,
  PASSWORD_HINT,
  signupProblems,
  type SignupProblems,
} from '../../src/auth/signupForm';
import { FormFrame as Frame, useLeave } from '../../src/auth/FormFrame';
import { RECOVER_PASSWORD_SCREEN } from '../../src/auth/passwordReset';
import { SIGN_IN_PATH } from '../../src/auth/sessionEnd';
import { savePronouns, signUp, type PronounSet } from '../../src/auth/student';
import { PRIVACY_LINK, PRIVACY_PATH, TERMS_LINK, TERMS_PATH } from '../../src/legal/paths';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../src/legal/versions';
import { Button, Card, Checkbox, TextField, TextLink } from '../../src/ui';
import { color, spacing, typography } from '../../src/ui/tokens';
import { useVisitor } from '../../src/visitor/useVisitor';

// Copy do cadastro (EXPERIENCE.md, Voice and Tone; UX-DR97, UX-DR98).
// [ASSUMPTION] Textos sem frase fixa no EXPERIENCE.md propostos na 2.1, a revisar com UX.
export const SIGNUP_TITLE = 'Crie sua conta';
export const INVITE_NOTICE = 'Crie sua conta para guardar o Estágio 1 e o XP que você já ganhou.';
export const NAME_FIELD = 'Como quer ser chamado';
export const EMAIL_FIELD = 'E-mail';
export const BIRTH_FIELD = 'Data de nascimento';
export const BIRTH_PLACEHOLDER = 'DD/MM/AAAA';
export const PASSWORD_FIELD = 'Senha';
export const ACCEPT_LABEL = 'Li e aceito os Termos de uso e a Política de privacidade.';
export const CREATE_LABEL = 'CRIAR CONTA';
export const BACK_LABEL = 'Voltar';
/** Atalhos do e-mail repetido: Entrar (2.3) e Recuperar senha (2.8). */
export const SIGN_IN_LINK = 'Entrar';
export const RECOVER_LINK = 'Recuperar senha';

export const PRONOUNS_TITLE = 'Nas histórias, como Alex deve se referir a você?';
export const PRONOUNS_CONTINUE = 'CONTINUAR';
export const PRONOUNS_LATER = 'Escolher depois';
/** Os Conjuntos de pronomes, com um exemplo de frase de cada um (o conteúdo do curso é em inglês). */
export const PRONOUN_OPTIONS: readonly { value: PronounSet; label: string; example: string }[] = [
  { value: 'SHE', label: 'she/her', example: 'She is from Brazil.' },
  { value: 'HE', label: 'he/him', example: 'He is from Brazil.' },
  { value: 'THEY', label: 'they/them', example: 'They are from Brazil.' },
];

/** O valor de `?de=` quando o cadastro abre do convite do Visitante (1.20). */
export const FROM_INVITE = 'convite';

/**
 * Cadastro do Aluno adulto (2.1, FR-2): o formulário e, depois do 201, o passo
 * dos pronomes, na mesma rota. Vindo do convite (`?de=convite`), mostra o
 * cartão ouro e já traz o nome do Visitante. Depois dos pronomes, a raiz mostra
 * a tela inicial do Aluno.
 */
export default function SignUp() {
  const { de } = useLocalSearchParams<{ de?: string }>();
  const [step, setStep] = useState<'form' | 'pronouns'>('form');
  return step === 'form' ? (
    <SignUpForm fromInvite={de === FROM_INVITE} onCreated={() => setStep('pronouns')} />
  ) : (
    <PronounStep />
  );
}

function SignUpForm({ fromInvite, onCreated }: { fromInvite: boolean; onCreated: () => void }) {
  const router = useRouter();
  const client = useQueryClient();
  const leave = useLeave();
  const { variables } = useVisitor();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  /** Depois da primeira tentativa de enviar, os campos explicam o que falta enquanto o aluno digita. */
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const nameTouched = useRef(false);
  /** Dois toques no mesmo quadro passariam pelo `sending` (estado): o ref barra o segundo POST. */
  const inFlight = useRef(false);

  // Vindo do convite, o nome do Visitante (UX-DR98), se o aluno ainda não mexeu no campo.
  const visitorName = variables.name;
  useEffect(() => {
    if (fromInvite && visitorName && !nameTouched.current) setName([...visitorName].slice(0, NAME_MAX).join(''));
  }, [fromInvite, visitorName]);

  const values = { name, email, birthDate, password, accepted };
  const problems: SignupProblems = tried ? signupProblems(values) : {};
  const band = ageBand(birthDate);
  // A idade aparece assim que a data está completa, sem esperar o envio.
  const birthError = band === 'below' ? AGE_BELOW_TEXT : problems.birthDate;

  const submit = async () => {
    if (inFlight.current) return;
    setTried(true);
    setFailure(null);
    const found = signupProblems(values);
    if (Object.keys(found).length > 0) return;
    const birth = parseBirthDate(birthDate)!;
    const trimmed = name.trim();
    inFlight.current = true;
    setSending(true);
    try {
      await signUp(client, {
        email: email.trim(),
        password,
        birthDate: isoDate(birth),
        ...(trimmed ? { name: trimmed } : {}),
        acceptedTermsVersion: TERMS_VERSION,
        acceptedPrivacyVersion: PRIVACY_VERSION,
      });
      onCreated();
    } catch (error) {
      setFailure(error instanceof ApiError ? error.code : NETWORK_ERROR);
      setSending(false);
      inFlight.current = false;
    }
  };

  const failureText = failure === 'AGE_BELOW_MINIMUM' ? AGE_BELOW_TEXT : failure ? messageFor(failure) : null;

  return (
    <Frame
      testID="signup-form"
      footer={
        <>
          {failureText ? (
            <View style={styles.failure} testID="signup-failure">
              <Text style={styles.failureText} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {failureText}
              </Text>
              {failure === 'EMAIL_ALREADY_REGISTERED' ? (
                <View style={styles.links}>
                  <TextLink label={SIGN_IN_LINK} onPress={() => router.navigate(SIGN_IN_PATH)} />
                  <TextLink label={RECOVER_LINK} onPress={() => router.navigate(RECOVER_PASSWORD_SCREEN)} />
                </View>
              ) : null}
            </View>
          ) : null}
          <Button
            label={CREATE_LABEL}
            onPress={() => void submit()}
            disabled={!accepted}
            busy={sending}
            fullWidth
            testID="signup-submit"
          />
        </>
      }
    >
      <View style={styles.top}>
        <TextLink label={BACK_LABEL} small onPress={leave} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {SIGNUP_TITLE}
      </Text>
      {fromInvite ? (
        <Card tone="reward" testID="signup-invite">
          <Text style={styles.inviteText}>{INVITE_NOTICE}</Text>
        </Card>
      ) : null}
      <TextField
        label={NAME_FIELD}
        value={name}
        onChangeText={(text) => {
          nameTouched.current = true;
          setName(text);
        }}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="nickname"
        maxLength={NAME_MAX}
        testID="signup-name"
      />
      <TextField
        label={EMAIL_FIELD}
        value={email}
        onChangeText={(text) => {
          // O 409 e os erros da idade falam do campo: mudou, a mensagem sai.
          setFailure(null);
          setEmail(text);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        inputMode="email"
        maxLength={EMAIL_MAX}
        error={problems.email}
        testID="signup-email"
      />
      <TextField
        label={BIRTH_FIELD}
        value={birthDate}
        onChangeText={(text) => {
          setFailure(null);
          setBirthDate(maskBirthDate(text));
        }}
        placeholder={BIRTH_PLACEHOLDER}
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="birthdate-full"
        maxLength={10}
        error={birthError}
        testID="signup-birth"
      />
      <TextField
        label={PASSWORD_FIELD}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        hint={PASSWORD_HINT}
        error={problems.password}
        testID="signup-password"
      />
      <View style={styles.accept}>
        <Checkbox label={ACCEPT_LABEL} checked={accepted} onChange={setAccepted} testID="signup-accept" />
        <View style={styles.links}>
          <TextLink label={TERMS_LINK} small onPress={() => router.navigate(TERMS_PATH)} testID="signup-terms" />
          <TextLink label={PRIVACY_LINK} small onPress={() => router.navigate(PRIVACY_PATH)} testID="signup-privacy" />
        </View>
      </View>
    </Frame>
  );
}

/**
 * Os pronomes, logo depois do cadastro (UX-DR97, FR-5): CONTINUAR grava por
 * `PATCH /students/me`; "Escolher depois" segue sem gravar (vale they/them).
 * Falha: a mensagem e o CONTINUAR de novo.
 */
function PronounStep() {
  const router = useRouter();
  const client = useQueryClient();
  const [choice, setChoice] = useState<PronounSet | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // A pilha volta a ser só a raiz: o voltar do Android não cai na boas-vindas, no convite nem no formulário.
  const home = () => router.dismissTo('/');

  const save = async () => {
    if (!choice || saving) return;
    setSaving(true);
    setFailure(null);
    try {
      await savePronouns(client, choice);
      home();
    } catch (error) {
      setFailure(error instanceof ApiError ? error.code : NETWORK_ERROR);
      setSaving(false);
    }
  };

  return (
    <Frame
      testID="signup-pronouns"
      footer={
        <>
          {failure ? (
            <Text style={styles.failureText} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {messageFor(failure)}
            </Text>
          ) : null}
          <Button
            label={PRONOUNS_CONTINUE}
            onPress={() => void save()}
            disabled={!choice}
            busy={saving}
            fullWidth
            testID="pronouns-continue"
          />
          <TextLink label={PRONOUNS_LATER} onPress={home} disabled={saving} testID="pronouns-later" />
        </>
      }
    >
      <Text style={styles.title} accessibilityRole="header">
        {PRONOUNS_TITLE}
      </Text>
      {PRONOUN_OPTIONS.map((option) => (
        <Card
          key={option.value}
          tone={choice === option.value ? 'selected' : 'neutral'}
          onPress={() => setChoice(option.value)}
          disabled={saving}
          accessibilityLabel={`${option.label}, ${option.example}`}
          accessibilityRole="radio"
          testID={`pronoun-${option.value}`}
        >
          <Text style={styles.optionLabel}>{option.label}</Text>
          <Text style={styles.optionExample} lang="en">
            {option.example}
          </Text>
        </Card>
      ))}
    </Frame>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', marginLeft: -spacing[3] },
  title: { ...typography.h1, color: color.ink },
  inviteText: { ...typography.bodyStrong, color: color.ink },
  accept: { gap: spacing[1] },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  failure: { gap: spacing[1] },
  failureText: { ...typography.bodyStrong, color: color.redDk, textAlign: 'center' },
  optionLabel: { ...typography.item, color: color.ink },
  optionExample: { ...typography.body, color: color.mutedStrong },
});
