// Regra local: cor só sai de src/ui/tokens (DESIGN.md é a fonte).
// - Em qualquer string: hex com letra (#fff, #1a2b3c) e rgb()/rgba()/hsl()/hsla().
// - Só em propriedade de cor (chave ou atributo com color, fill, stroke ou tint):
//   hex só de dígitos (#000, #333333) e nomes de cor CSS ('white', 'transparent').
//   Fora disso, "#100" ou "Unidade #2024" é número, não cor.
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])/gi;
const FUNCTION = /\b(?:rgba?|hsla?)\s*\(/i;
const HAS_LETTER = /[a-f]/i;
const COLOR_KEY = /color|fill|stroke|tint/i;

// Nomes de cor CSS mais comuns; o `currentColor` é permitido (herda a cor do token).
const CSS_NAMES = new Set([
  'aqua',
  'black',
  'blue',
  'brown',
  'cyan',
  'fuchsia',
  'gold',
  'gray',
  'green',
  'grey',
  'indigo',
  'lime',
  'magenta',
  'maroon',
  'navy',
  'olive',
  'orange',
  'pink',
  'purple',
  'red',
  'silver',
  'teal',
  'transparent',
  'violet',
  'white',
  'yellow',
]);

/** A cor proibida em `text`; `inColorProp` liga as regras de hex só de dígitos e de nomes. */
function findColor(text, inColorProp = false) {
  const fn = text.match(FUNCTION);
  if (fn) return fn[0];
  for (const [hex] of text.matchAll(HEX)) {
    if (HAS_LETTER.test(hex.slice(1)) || inColorProp) return hex;
  }
  if (inColorProp && CSS_NAMES.has(text.trim().toLowerCase())) return text.trim();
  return null;
}

function keyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

/** Se o valor está numa propriedade de estilo de cor (`{ color: ... }`, `fill="..."`). */
function inColorProperty(node) {
  let current = node.parent;
  // Template, expressão condicional e container JSX ficam entre o valor e a chave.
  while (
    current &&
    ['TemplateLiteral', 'ConditionalExpression', 'LogicalExpression', 'JSXExpressionContainer'].includes(current.type)
  ) {
    current = current.parent;
  }
  if (!current) return false;
  const name =
    current.type === 'Property' ? keyName(current.key) : current.type === 'JSXAttribute' ? keyName(current.name) : null;
  return typeof name === 'string' && COLOR_KEY.test(name);
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Proíbe cor literal fora de src/ui/tokens' },
    messages: {
      literal: 'Cor literal "{{value}}" fora de src/ui/tokens. Use um token de `color` (src/ui/tokens).',
    },
    schema: [],
  },
  create(context) {
    function check(node, text, colorProp) {
      const value = typeof text === 'string' ? findColor(text, colorProp) : null;
      if (value) context.report({ node, messageId: 'literal', data: { value } });
    }
    return {
      Literal(node) {
        check(node, node.value, inColorProperty(node));
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw, inColorProperty(node.parent));
      },
      JSXText(node) {
        check(node, node.value, false);
      },
    };
  },
  findColor,
};
