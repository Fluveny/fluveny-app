import { ageBand, ageOn, isoDate, maskBirthDate, parseBirthDate, passwordOk, signupProblems } from '../signupForm';

describe('regras do cadastro no App (as mesmas da API)', () => {
  it('senha: 8 a 64 caracteres, letra e número, até 72 bytes em UTF-8', () => {
    expect(passwordOk('segredo1')).toBe(true);
    expect(passwordOk('segred1')).toBe(false);
    expect(passwordOk('somenteletras')).toBe(false);
    expect(passwordOk('12345678')).toBe(false);
    expect(passwordOk(`a1${'b'.repeat(62)}`)).toBe(true);
    expect(passwordOk(`a1${'b'.repeat(63)}`)).toBe(false);
    // 24 letras de 3 bytes e um número: 25 caracteres, 73 bytes.
    expect(passwordOk(`${'€'.repeat(24)}1`)).toBe(false);
    expect(passwordOk('ação1234')).toBe(true);
  });

  it('data: máscara DD/MM/AAAA, data que existe e yyyy-MM-dd', () => {
    expect(maskBirthDate('2005199099')).toBe('20/05/1990');
    expect(maskBirthDate('20/0')).toBe('20/0');
    expect(parseBirthDate('29/02/2001')).toBeNull();
    expect(parseBirthDate('29/02/2000')).toEqual({ year: 2000, month: 2, day: 29 });
    expect(isoDate({ year: 1990, month: 5, day: 3 })).toBe('1990-05-03');
  });

  it('idade em anos completos; futura ou antes de 1900 é nula', () => {
    const today = new Date(2026, 10, 19);
    expect(ageOn({ year: 2014, month: 11, day: 19 }, today)).toBe(12);
    expect(ageOn({ year: 2014, month: 11, day: 20 }, today)).toBe(11);
    expect(ageOn({ year: 2026, month: 11, day: 20 }, today)).toBeNull();
    expect(ageOn({ year: 1899, month: 12, day: 31 }, today)).toBeNull();
    expect(ageBand('20/11/2014', today)).toBe('below');
    expect(ageBand('19/11/2014', today)).toBe('below');
    expect(ageBand('20/11/2008', today)).toBe('below');
    expect(ageBand('19/11/2008', today)).toBe('adult');
  });

  it('o que falta: e-mail, data, senha e aceite', () => {
    const today = new Date(2026, 10, 19);
    const ok = { name: '', email: 'a@b.co', birthDate: '19/11/2008', password: 'segredo1', accepted: true };
    expect(signupProblems(ok, today)).toEqual({});
    expect(
      Object.keys(
        signupProblems({ ...ok, email: 'a@b', birthDate: '1/1', password: 'x', accepted: false }, today),
      ).sort(),
    ).toEqual(['accepted', 'birthDate', 'email', 'password']);
  });
});
