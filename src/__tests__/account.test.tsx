// Matriz da 2.9 (Conta no App): uma linha por teste.
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, Platform } from 'react-native';

import { messageFor, NETWORK_ERROR } from '../api/errors';
import { forceMockAccount, resetMockStudents, seedMockAccount } from '../api/mocks/routes';
import {
  CHANGE_EMAIL_LABEL,
  CURRENT_PASSWORD_FIELD,
  DATA_SAVED,
  emailRequested,
  NAME_FIELD,
  NAME_PROBLEM,
  NEW_EMAIL_FIELD,
  NEW_PASSWORD_FIELD,
  PASSWORD_CHANGED,
  pendingEmailText,
  RESEND_EMAIL_LABEL,
  RESEND_NEEDS_PASSWORD,
  SAVE_LABEL,
  SAME_EMAIL,
  SAME_PASSWORD,
  SAVE_PASSWORD_LABEL,
} from '../auth/AccountScreen';
import { forgetCachedSession } from '../auth/session';
import { EMAIL_PROBLEM } from '../auth/signupForm';
import { STUDENT_QUERY_KEY, type StudentProfile } from '../auth/student';
import { SIGN_OUT_BODY, SIGN_OUT_LABEL } from '../auth/StudentHome';
import { ACCOUNT_LABEL } from '../dashboard/StudentDashboard';
import { captureError } from '../observability/sentry';
import { withStudent } from '../renderer/useRenderVars';
import { renderPlain } from '../renderer';
import { ADULT, apiResponds, bodyOf, harness, json, mockAccount, ofRoute, openApp } from '../testing/accountHarness';
import { visitorStore } from '../visitor/store';
import { clearVisitorCache } from '../visitor/useVisitor';

jest.mock('../observability/sentry', () => {
  const actual = jest.requireActual('../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const ME = '/api/v1/students/me';
const PASSWORD = '/api/v1/students/me/password';
const EMAIL = '/api/v1/students/me/email';
const NEW_PASSWORD = 'novasenha42';

const button = (name: string) => screen.getByRole('button', { name });
const field = (label: string) => screen.getByLabelText(label);
const fields = (label: string) => screen.getAllByLabelText(label);

async function openAccount(): Promise<StudentProfile> {
  const student = await mockAccount();
  await openApp('/conta', student);
  await screen.findByTestId('account-screen');
  return student;
}

const os = Platform.OS;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.exemplo.test';
  Platform.OS = 'android';
  global.__resetSqlite();
  global.__resetSecureStore();
  global.__resetNetwork();
  forgetCachedSession();
  clearVisitorCache();
  resetMockStudents();
  harness.override = {};
  harness.sent.length = 0;
  apiResponds();
  (captureError as jest.Mock).mockClear();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  Platform.OS = os;
  jest.restoreAllMocks();
});

describe('Conta (2.9)', () => {
  it('abrir: o ícone de perfil do painel (rótulo "Account") abre /conta com nome, país, pronomes e e-mail; sem Sair no painel', async () => {
    const student = await mockAccount();
    await openApp('/', student);
    await screen.findByTestId('student-dashboard');
    expect(screen.queryByRole('button', { name: SIGN_OUT_LABEL })).toBeNull();
    await fireEvent.press(button(ACCOUNT_LABEL));
    expect(await screen.findByTestId('account-screen')).toBeTruthy();
    expect(screen).toHavePathname('/conta');
    expect(field(NAME_FIELD).props.value).toBe('Ana');
    expect(screen.getByText(`Your email: ${ADULT.email}`)).toBeTruthy();
    expect(screen.getByTestId('account-pronoun-THEY').props.accessibilityState).not.toMatchObject({ selected: true });
    expect(button(SAVE_LABEL)).toBeDisabled();
  });

  it('sem sessão: /conta volta para /', async () => {
    await openApp('/conta');
    await waitFor(() => expect(screen).toHavePathname('/'));
  });

  it('salvar dados: 1 PATCH só com o que mudou; cache novo; anuncia "Details saved."; a Fala usa o nome', async () => {
    await openAccount();
    await fireEvent.changeText(field(NAME_FIELD), 'Bia');
    await fireEvent.press(screen.getByTestId('account-country-BR'));
    await fireEvent.press(button(SAVE_LABEL));
    expect(await screen.findByText(DATA_SAVED)).toBeTruthy();
    expect(ofRoute('PATCH', ME).map(bodyOf)).toEqual([{ name: 'Bia', country: 'Brazil' }]);
    const cached = harness.client!.getQueryData<StudentProfile>(STUDENT_QUERY_KEY)!;
    expect(cached).toEqual(expect.objectContaining({ name: 'Bia', country: 'Brazil' }));
    const context = withStudent({ vars: {}, pronoun: 'they' }, cached);
    expect(renderPlain('Hi, {name} from {country}!', context.vars, context.pronoun)).toBe('Hi, Bia from Brazil!');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(DATA_SAVED);
    await waitFor(() => expect(button(SAVE_LABEL)).toBeDisabled());
  });

  it('só o país mudou: o PATCH leva só o país', async () => {
    await openAccount();
    await fireEvent.press(screen.getByTestId('account-country-BR'));
    await fireEvent.press(button(SAVE_LABEL));
    await screen.findByText(DATA_SAVED);
    expect(ofRoute('PATCH', ME).map(bodyOf)).toEqual([{ country: 'Brazil' }]);
  });

  it('nome vazio limpa (null)', async () => {
    await openAccount();
    await fireEvent.changeText(field(NAME_FIELD), '');
    await fireEvent.press(button(SAVE_LABEL));
    await screen.findByText(DATA_SAVED);
    expect(ofRoute('PATCH', ME).map(bodyOf)).toEqual([{ name: null }]);
  });

  it('nome só com espaços limpa, como o vazio (null)', async () => {
    await openAccount();
    await fireEvent.changeText(field(NAME_FIELD), '   ');
    expect(screen.queryByText(NAME_PROBLEM)).toBeNull();
    await fireEvent.press(button(SAVE_LABEL));
    await screen.findByText(DATA_SAVED);
    expect(ofRoute('PATCH', ME).map(bodyOf)).toEqual([{ name: null }]);
  });

  it('nome longo: não envia; o campo explica', async () => {
    await openAccount();
    await fireEvent.changeText(field(NAME_FIELD), 'x'.repeat(61));
    expect(screen.getByText(NAME_PROBLEM)).toBeTruthy();
    expect(button(SAVE_LABEL)).toBeDisabled();
    await fireEvent.press(button(SAVE_LABEL));
    expect(ofRoute('PATCH', ME)).toHaveLength(0);
  });

  it('pronomes: tocar she/her faz o PATCH {pronounSet} e marca; a Fala usa a variante she', async () => {
    await openAccount();
    await fireEvent.press(screen.getByTestId('account-pronoun-SHE'));
    await waitFor(() => expect(ofRoute('PATCH', ME).map(bodyOf)).toEqual([{ pronounSet: 'SHE' }]));
    await waitFor(() =>
      expect(screen.getByTestId('account-pronoun-SHE').props.accessibilityState).toMatchObject({ selected: true }),
    );
    expect(screen.getByTestId('account-pronoun-SHE').props.accessibilityRole).toBe('radio');
    const context = withStudent({ vars: {}, pronoun: 'they' }, harness.client!.getQueryData(STUDENT_QUERY_KEY));
    expect(renderPlain({ he: 'He is', she: 'She is', they: 'They are' }, context.vars, context.pronoun)).toBe('She is');
  });

  it('perfil mudou por fora (Diálogo, releitura) sem edição: os campos seguem; SALVAR não reverte', async () => {
    const student = await openAccount();
    await act(async () => {
      harness.client!.setQueryData(STUDENT_QUERY_KEY, { ...student, name: 'Carla', country: 'Brazil' });
    });
    await waitFor(() => expect(field(NAME_FIELD).props.value).toBe('Carla'));
    expect(screen.getByTestId('account-country-BR').props.accessibilityState).toMatchObject({ selected: true });
    expect(button(SAVE_LABEL)).toBeDisabled();
  });

  it('erro ao ler o perfil: a mensagem, TENTAR DE NOVO (relê) e Voltar', async () => {
    const student = await mockAccount();
    harness.override[`GET ${ME}`] = () => json({ code: 'INTERNAL_ERROR' }, 500);
    await openApp('/conta');
    expect(await screen.findByText(messageFor('INTERNAL_ERROR'))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    delete harness.override[`GET ${ME}`];
    await fireEvent.press(button('TRY AGAIN'));
    expect(await screen.findByTestId('account-screen')).toBeTruthy();
    expect(field(NAME_FIELD).props.value).toBe(student.name);
  });

  it('pronomes: falha volta a seleção anterior e anuncia a mensagem', async () => {
    await openAccount();
    await fireEvent.press(screen.getByTestId('account-pronoun-SHE'));
    await waitFor(() =>
      expect(screen.getByTestId('account-pronoun-SHE').props.accessibilityState).toMatchObject({ selected: true }),
    );
    harness.override[`PATCH ${ME}`] = () => json({ code: 'TOO_MANY_REQUESTS' }, 429);
    await fireEvent.press(screen.getByTestId('account-pronoun-HE'));
    expect(await screen.findByText(messageFor('TOO_MANY_REQUESTS'))).toBeTruthy();
    expect(screen.getByTestId('account-pronoun-SHE').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('account-pronoun-HE').props.accessibilityState).not.toMatchObject({ selected: true });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(messageFor('TOO_MANY_REQUESTS'));
  });

  it('pronomes: falha de rede volta a seleção anterior com messageFor', async () => {
    await openAccount();
    harness.override[`PATCH ${ME}`] = () => Promise.reject(new TypeError('Network request failed'));
    await fireEvent.press(screen.getByTestId('account-pronoun-HE'));
    expect(await screen.findByText(messageFor(NETWORK_ERROR))).toBeTruthy();
    expect(screen.getByTestId('account-pronoun-HE').props.accessibilityState).not.toMatchObject({ selected: true });
  });

  it('senha: atual certa e nova válida → 204; campos limpos; continua logado', async () => {
    await openAccount();
    await fireEvent.changeText(fields(CURRENT_PASSWORD_FIELD)[1]!, ADULT.password);
    await fireEvent.changeText(field(NEW_PASSWORD_FIELD), NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(PASSWORD_CHANGED)).toBeTruthy();
    expect(ofRoute('POST', PASSWORD).map(bodyOf)).toEqual([
      { currentPassword: ADULT.password, newPassword: NEW_PASSWORD },
    ]);
    expect(fields(CURRENT_PASSWORD_FIELD)[1]!.props.value).toBe('');
    expect(field(NEW_PASSWORD_FIELD).props.value).toBe('');
    expect(screen).toHavePathname('/conta');
    expect(global.__secureStore.size).toBe(1);
    expect(harness.client!.getQueryData(STUDENT_QUERY_KEY)).toBeTruthy();
  });

  it('senha atual errada (400): mensagem no campo; continua logado, nunca tratado como 401', async () => {
    await openAccount();
    await fireEvent.changeText(fields(CURRENT_PASSWORD_FIELD)[1]!, 'errada123');
    await fireEvent.changeText(field(NEW_PASSWORD_FIELD), NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(messageFor('CURRENT_PASSWORD_INVALID'))).toBeTruthy();
    expect(messageFor('CURRENT_PASSWORD_INVALID')).toBe("Your current password isn't right.");
    expect(screen).toHavePathname('/conta');
    expect(field(NEW_PASSWORD_FIELD).props.value).toBe(NEW_PASSWORD);
  });

  it('muitas tentativas (429): messageFor; campos mantidos', async () => {
    await openAccount();
    forceMockAccount('TOO_MANY_REQUESTS');
    await fireEvent.changeText(fields(CURRENT_PASSWORD_FIELD)[1]!, ADULT.password);
    await fireEvent.changeText(field(NEW_PASSWORD_FIELD), NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(messageFor('TOO_MANY_REQUESTS'))).toBeTruthy();
    expect(fields(CURRENT_PASSWORD_FIELD)[1]!.props.value).toBe(ADULT.password);
  });

  it('trocar e-mail: 202; a faixa do pendente com o e-mail atual; senha limpa', async () => {
    await openAccount();
    await fireEvent.changeText(field(NEW_EMAIL_FIELD), 'bia@exemplo.test');
    await fireEvent.changeText(fields(CURRENT_PASSWORD_FIELD)[0]!, ADULT.password);
    await fireEvent.press(button(CHANGE_EMAIL_LABEL));
    expect(await screen.findByText(pendingEmailText('bia@exemplo.test', ADULT.email))).toBeTruthy();
    expect(screen.getByText(emailRequested('bia@exemplo.test'))).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(emailRequested('bia@exemplo.test'));
    expect(ofRoute('POST', EMAIL).map(bodyOf)).toEqual([
      { newEmail: 'bia@exemplo.test', currentPassword: ADULT.password },
    ]);
    expect(fields(CURRENT_PASSWORD_FIELD)[0]!.props.value).toBe('');
    // "Send again" pede a senha de novo.
    await fireEvent.press(button(RESEND_EMAIL_LABEL));
    expect(await screen.findByText(RESEND_NEEDS_PASSWORD)).toBeTruthy();
    expect(screen.queryByText(EMAIL_PROBLEM)).toBeNull();
    expect(ofRoute('POST', EMAIL)).toHaveLength(1);
    await fireEvent.changeText(fields(CURRENT_PASSWORD_FIELD)[0]!, ADULT.password);
    await fireEvent.press(button(RESEND_EMAIL_LABEL));
    await waitFor(() => expect(ofRoute('POST', EMAIL)).toHaveLength(2));
    expect(bodyOf(ofRoute('POST', EMAIL)[1]!)).toEqual({
      newEmail: 'bia@exemplo.test',
      currentPassword: ADULT.password,
    });
  });

  it('202 com a releitura do perfil falhando: o aviso de envio aparece mesmo assim', async () => {
    await openAccount();
    harness.override[`GET ${ME}`] = () => json({ code: 'INTERNAL_ERROR' }, 500);
    await fireEvent.changeText(field(NEW_EMAIL_FIELD), 'bia@exemplo.test');
    await fireEvent.changeText(fields(CURRENT_PASSWORD_FIELD)[0]!, ADULT.password);
    await fireEvent.press(button(CHANGE_EMAIL_LABEL));
    expect(await screen.findByText(emailRequested('bia@exemplo.test'))).toBeTruthy();
  });

  it('novo e-mail igual ao atual: não envia; o campo explica', async () => {
    await openAccount();
    await fireEvent.changeText(field(NEW_EMAIL_FIELD), ADULT.email.toUpperCase());
    await fireEvent.changeText(fields(CURRENT_PASSWORD_FIELD)[0]!, ADULT.password);
    await fireEvent.press(button(CHANGE_EMAIL_LABEL));
    expect(await screen.findByText(SAME_EMAIL)).toBeTruthy();
    expect(ofRoute('POST', EMAIL)).toHaveLength(0);
  });

  it('nova senha igual à atual: não envia; o erro é anunciado', async () => {
    await openAccount();
    await fireEvent.changeText(fields(CURRENT_PASSWORD_FIELD)[1]!, ADULT.password);
    await fireEvent.changeText(field(NEW_PASSWORD_FIELD), ADULT.password);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    expect(await screen.findByText(SAME_PASSWORD)).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(SAME_PASSWORD);
    expect(ofRoute('POST', PASSWORD)).toHaveLength(0);
  });

  it('e-mail de outra conta (409): no rodapé da seção, campos mantidos', async () => {
    seedMockAccount('outra@exemplo.test', 'outra1234');
    await openAccount();
    await fireEvent.changeText(field(NEW_EMAIL_FIELD), 'outra@exemplo.test');
    await fireEvent.changeText(fields(CURRENT_PASSWORD_FIELD)[0]!, ADULT.password);
    await fireEvent.press(button(CHANGE_EMAIL_LABEL));
    expect(await screen.findByText(messageFor('EMAIL_ALREADY_REGISTERED'))).toBeTruthy();
    expect(field(NEW_EMAIL_FIELD).props.value).toBe('outra@exemplo.test');
    expect(fields(CURRENT_PASSWORD_FIELD)[0]!.props.value).toBe(ADULT.password);
  });

  it('toque duplo: 1 requisição', async () => {
    await openAccount();
    let answer!: (response: Response) => void;
    harness.override[`POST ${PASSWORD}`] = () => new Promise<Response>((resolve) => (answer = resolve));
    await fireEvent.changeText(fields(CURRENT_PASSWORD_FIELD)[1]!, ADULT.password);
    await fireEvent.changeText(field(NEW_PASSWORD_FIELD), NEW_PASSWORD);
    const save = button(SAVE_PASSWORD_LABEL);
    await act(async () => {
      fireEvent.press(save);
      fireEvent.press(save);
    });
    expect(ofRoute('POST', PASSWORD)).toHaveLength(1);
    await act(async () => answer(new Response(null, { status: 204 })));
    expect(await screen.findByText(PASSWORD_CHANGED)).toBeTruthy();
  });

  it('Sair na Conta: a folha da 2.3 e o mesmo destino', async () => {
    await openAccount();
    await fireEvent.press(button(SIGN_OUT_LABEL));
    expect(await screen.findByText(SIGN_OUT_BODY, { exact: false })).toBeTruthy();
    await fireEvent.press(await screen.findByTestId('sign-out-sheet-confirm'));
    await waitFor(() => expect(screen).toHavePathname('/'));
    expect(global.__secureStore.size).toBe(0);
  });

  it('privacidade: senha e e-mail digitados nunca vão à URL, a localStorage, a log ou ao Sentry', async () => {
    const log = jest.spyOn(console, 'log');
    const warn = jest.spyOn(console, 'warn');
    await openAccount();
    await fireEvent.changeText(field(NEW_EMAIL_FIELD), 'bia@exemplo.test');
    await fireEvent.changeText(fields(CURRENT_PASSWORD_FIELD)[0]!, ADULT.password);
    await fireEvent.press(button(CHANGE_EMAIL_LABEL));
    await screen.findByText(pendingEmailText('bia@exemplo.test', ADULT.email));
    await fireEvent.changeText(fields(CURRENT_PASSWORD_FIELD)[1]!, ADULT.password);
    await fireEvent.changeText(field(NEW_PASSWORD_FIELD), NEW_PASSWORD);
    await fireEvent.press(button(SAVE_PASSWORD_LABEL));
    await screen.findByText(PASSWORD_CHANGED);
    const secrets = [ADULT.password, NEW_PASSWORD, 'bia@exemplo.test'];
    const outside = JSON.stringify([
      harness.sent.map((request) => request.url),
      log.mock.calls,
      warn.mock.calls,
      (captureError as jest.Mock).mock.calls,
      [...global.__secureStore.entries()],
      await visitorStore.variables(),
    ]);
    for (const secret of secrets) expect(outside).not.toContain(secret);
  });
});
