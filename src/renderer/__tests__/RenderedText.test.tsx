import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import * as sentry from '../../observability/sentry';
import { color, fontFamily, typography } from '../../ui/tokens';
import { ExpressionsProvider } from '../ExpressionsProvider';
import { RenderedText } from '../RenderedText';
import type { ContentText } from '../render';

jest.mock('../../observability/sentry', () => {
  const actual = jest.requireActual('../../observability/sentry');
  return { ...actual, captureError: jest.fn() };
});

const styleOf = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) ?? {};

describe('RenderedText', () => {
  it('variável preenchida: "Ana" em Text aninhado, fundo goldLt, cor goldText e sublinhado gold', async () => {
    await render(<RenderedText testID="t" text="Hi, {name}!" vars={{ name: 'Ana' }} style={typography.body} />);
    expect(screen.getByText('Hi, Ana!')).toBeTruthy();
    const variable = screen.getByTestId('student-var');
    expect(variable.props.children).toBe('Ana');
    expect(styleOf(variable)).toEqual({
      backgroundColor: color.goldLt,
      color: color.goldText,
      textDecorationLine: 'underline',
      textDecorationColor: color.gold,
    });
    expect(styleOf(variable)).not.toHaveProperty('borderBottomWidth');
    expect(styleOf(screen.getByTestId('t'))).toEqual(typography.body);
  });

  it('variável vazia: {country} literal, sem ouro', async () => {
    await render(<RenderedText text="From {country}." vars={{}} />);
    expect(screen.getByText('From {country}.')).toBeTruthy();
    expect(screen.queryByTestId('student-var')).toBeNull();
  });

  it('valor com markup: "**x**" literal e em ouro, sem negrito', async () => {
    await render(<RenderedText text="I am {name}." vars={{ name: '**x**' }} />);
    const variable = screen.getByTestId('student-var');
    expect(variable.props.children).toBe('**x**');
    expect(styleOf(variable).fontFamily).toBeUndefined();
  });

  it('var em negrito: "Ana" em Montserrat 800 e em ouro; sem ** visível', async () => {
    await render(<RenderedText text="I am **{name}**." vars={{ name: 'Ana' }} />);
    expect(screen.getByText('I am Ana.')).toBeTruthy();
    const variable = screen.getByTestId('student-var');
    expect(styleOf(variable).fontFamily).toBe(fontFamily[800]);
    expect(styleOf(variable).backgroundColor).toBe(color.goldLt);
  });

  it('negrito do conteúdo: Montserrat 800', async () => {
    await render(<RenderedText text="**She** is here." />);
    expect(screen.getByText('She is here.')).toBeTruthy();
    expect(styleOf(screen.getByText('She')).fontFamily).toBe(fontFamily[800]);
    expect(styleOf(screen.getByText('She is here.')).fontFamily).toBeUndefined();
  });

  it('strongStyle: soma ao negrito (peso 800 + sublinhado em ink), sem tocar no texto comum nem na variável', async () => {
    const strong = { textDecorationLine: 'underline', textDecorationColor: color.ink } as const;
    await render(<RenderedText text="My name **is** {name}." vars={{ name: 'Ana' }} strongStyle={strong} />);
    expect(screen.getByText('My name is Ana.')).toBeTruthy();
    expect(styleOf(screen.getByText('is'))).toEqual({
      fontFamily: fontFamily[800],
      fontWeight: '800',
      ...strong,
    });
    expect(styleOf(screen.getByTestId('student-var')).textDecorationColor).toBe(color.gold);
    expect(styleOf(screen.getByTestId('student-var')).fontFamily).toBeUndefined();
  });

  it('strongStyle não vale na Expressão Útil nem na Variável do Aluno: ficam o azul pontilhado e o ouro', async () => {
    const strong = { textDecorationLine: 'underline', textDecorationColor: color.ink } as const;
    const expressions = [{ expressionKey: 'k', term: 'is', meaning: 'é', examples: [] }];
    await render(
      <ExpressionsProvider expressions={expressions}>
        <RenderedText
          text="A [[**is**|k]] B **[[from|k]]** C **{name}**."
          vars={{ name: 'Ana' }}
          strongStyle={strong}
        />
      </ExpressionsProvider>,
    );
    for (const label of ['is', 'from']) {
      const run = screen.getByText(label, { exact: true });
      expect(styleOf(run).fontFamily).toBe(fontFamily[800]);
      expect(styleOf(run).textDecorationColor).toBeUndefined();
    }
    for (const chunk of screen.getAllByTestId('expression-k')) {
      expect(styleOf(chunk)).toMatchObject({ color: color.blue, textDecorationStyle: 'dotted' });
    }
    const variable = screen.getByTestId('student-var');
    expect(styleOf(variable)).toMatchObject({
      fontFamily: fontFamily[800],
      color: color.goldText,
      textDecorationColor: color.gold,
    });
  });

  it('expressão: só o rótulo, com {name} resolvido, sem ação', async () => {
    await render(<RenderedText text="[[Nice to meet you, {name}|nice-to-meet-you]]" vars={{ name: 'Ana' }} />);
    expect(screen.getByText('Nice to meet you, Ana')).toBeTruthy();
    expect(screen.queryByText(/nice-to-meet-you|\[\[|\|/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('pronome sem valor salvo: variante they', async () => {
    await render(<RenderedText text={{ he: 'He is {name}.', she: 'She is {name}.', they: 'They are {name}.' }} />);
    expect(screen.getByText('They are {name}.')).toBeTruthy();
  });

  it('variante ausente: não desenha e vai ao Sentry', async () => {
    const text = { he: 'He', she: 'She' } as unknown as ContentText;
    await render(<RenderedText testID="t" text={text} />);
    expect(screen.getByTestId('t').props.children).toEqual([]);
    expect(sentry.captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('they') }),
    );
  });
});
