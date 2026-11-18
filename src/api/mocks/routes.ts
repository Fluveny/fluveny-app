// Respostas mockadas da API (EXPO_PUBLIC_API_MOCK=1), tipadas pelo contrato
// (schema.d.ts). O tipo exige uma resposta para cada rota e método do contrato:
// rota nova no `api:sync` sem mock aqui falha o tsc, e o routes.test.ts confere
// o mesmo contra o openapi.json.
//
// Só a visão do aluno: Atividade mockada usa os tipos `*StudentView`, nunca a
// Atividade com resposta e justificativa (campos `x-fluveny-secret` da API). O
// teste falha se algum mock trouxer um campo que só existe fora da StudentView.
// A exceção é a da API: o Resultado da Tentativa traz `expected` e o
// `justification` do `ItemResult` (no Acerto e no reveal). O gabarito fica só
// aqui, no corretor do mock; o App nunca corrige.
//
// Recibos (1.12): como a API, a primeira Tentativa ou conclusão de cada
// `(deviceId, activityKey)` volta com um `receipt` falso e opaco; o reenvio do
// mesmo `attemptId` com o mesmo Resultado devolve o mesmo recibo; o reveal sem
// Tentativa do aparelho é `409 ATTEMPT_REQUIRED`.
//
// Diálogo (1.13): o Estágio abre com um Diálogo que pergunta o nome e o país
// (UX-DR122). Como a API, cada Tipo aceita a sua conclusão: o `dialogue`, só
// `VIEWED`; o resto é `409 COMPLETION_NOT_ALLOWED`.
//
// Expressões Úteis (1.14): depois do Diálogo vêm os Cartões de expressões e a
// Expressão Útil destacada, que também aceitam `VIEWED`. A Unidade traz as
// Expressões Úteis que eles e a última Escolha usam (`[[rótulo|chave]]`).
//
// Associar (1.16): antes da Fala, um `match` de três pares com um distrator e
// `{name}` numa resposta; o corretor segue o `Grader.match` da API. Sem
// conclusão: o Associar só termina corrigido.
//
// Lacunas (1.17): antes da Fala, um `gaps` do banco (com um distrator) e um
// digitado (com `{name}` numa resposta aceita); o corretor segue o
// `Grader.gaps` da API. Sem conclusão, como o Associar.
//
// Resposta Livre (1.18): depois das Lacunas, um `free` com `{name}` na
// resposta-modelo. A conclusão `VIEWED` devolve a `modelAnswer` (também na
// repetição, sem recibo); a Tentativa é o Extra Help, corrigido pelas lacunas
// do banco, com `extraHelp: true`. O gabarito (resposta-modelo e respostas
// aceitas) fica só aqui.
//
// Grammar Time (1.19): antes da Fala, um `grammar` com `{name}` e uma frase
// com variantes de pronome em `used`. Aceita `VIEWED`, como os expositivos.
import type { components, paths } from '../schema';

export const MOCK_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Method = (typeof MOCK_METHODS)[number];

type Json<R> = R extends { content: { 'application/json': infer B } } ? B : never;

/** Corpo da resposta de sucesso (200 ou 201) da operação. */
type SuccessBody<O> = O extends { responses: infer R }
  ? R extends { 200: infer S }
    ? Json<S>
    : R extends { 201: infer S }
      ? Json<S>
      : never
  : never;

/**
 * O `GET` responde na hora; os outros métodos podem ler o corpo da requisição
 * (assíncrono). Um erro da API é um `MockProblem` lançado pelo mock.
 */
export type MockRoutes = {
  [P in keyof paths]: {
    [M in Method as paths[P][M] extends { responses: unknown } ? M : never]: M extends 'get'
      ? (request: Request) => SuccessBody<paths[P][M]>
      : (request: Request) => SuccessBody<paths[P][M]> | Promise<SuccessBody<paths[P][M]>>;
  };
};

/** Erro da API no mock: os handlers o devolvem como problem+json com o `code`. */
export class MockProblem extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`mock ${status} ${code}`);
    this.name = 'MockProblem';
    this.status = status;
    this.code = code;
  }
}

/** O corpo problem+json de um `MockProblem`, como a API manda. */
export function problemBody(problem: MockProblem) {
  return {
    type: `urn:fluveny:problem:${problem.code}`,
    title: problem.code,
    status: problem.status,
    code: problem.code,
  };
}

const VERSION_ID = 'sha256:0000000000000000000000000000000000000000000000000000000000000001';

// Uma Unidade com um Estágio de um Diálogo, os Cartões, a Expressão Útil, três
// Escolhas, o Associar, as duas Lacunas, a Resposta Livre, o Grammar Time e a
// Fala (o player percorre 1 de 12 a 12 de 12), e a Unit 2 "em breve" (sem
// Estágios). A primeira Escolha tem 3 itens (Resultado "n de 3 itens"); as
// outras, um só.
const unit1 = { unitKey: 'unit-1', order: 1, title: 'Unit 1', comingSoon: false, versionId: VERSION_ID };
const unit2 = {
  unitKey: 'unit-2',
  order: 2,
  title: 'Unit 2',
  comingSoon: true,
  versionId: 'sha256:0000000000000000000000000000000000000000000000000000000000000002',
};

type ContentText = components['schemas']['ContentText'];
type ChoiceView = components['schemas']['ChoiceActivityStudentView'];
type DialogueView = components['schemas']['DialogueActivityStudentView'];
type CardsView = components['schemas']['CardsActivityStudentView'];
type ExpressionView = components['schemas']['ExpressionActivityStudentView'];
type SpeechView = components['schemas']['SpeechActivityStudentView'];
type MatchView = components['schemas']['MatchActivityStudentView'];
type GapsView = components['schemas']['GapsActivityStudentView'];
type FreeView = components['schemas']['FreeActivityStudentView'];
type GrammarView = components['schemas']['GrammarActivityStudentView'];
type ActivityView =
  ChoiceView | DialogueView | CardsView | ExpressionView | SpeechView | MatchView | GapsView | FreeView | GrammarView;
type UsefulExpression = components['schemas']['UsefulExpressionStudentView'];
type AttemptResult = components['schemas']['AttemptResult'];
type CompletionResult = components['schemas']['CompletionResult'];

/** Um item do mock: as alternativas, a certa (a primeira com ✓) e a justificativa. */
type MockItem = {
  question: ContentText;
  /** `[optionKey, texto]`; a certa é `correct`. */
  options: [string, string][];
  correct: string;
  justification: ContentText;
};

/** Gabarito do mock, privado a este módulo: só o corretor do mock o lê. */
const answerKey = new Map<
  string,
  { xp: number; items: Map<string, { correct: string; justification: ContentText }> }
>();

function choice(activityKey: string, title: string, items: MockItem[], prompt?: string): ChoiceView {
  const xp = 10;
  answerKey.set(activityKey, {
    xp,
    items: new Map(
      items.map((item, i) => [`${activityKey}-${i + 1}`, { correct: item.correct, justification: item.justification }]),
    ),
  });
  return {
    activityKey,
    type: 'choice',
    title,
    ...(prompt === undefined ? {} : { prompt }),
    xp,
    items: items.map((item, i) => ({
      itemKey: `${activityKey}-${i + 1}`,
      question: item.question,
      options: item.options.map(([optionKey, text]) => ({ optionKey, text })),
    })),
  };
}

/** O Diálogo que abre o Estágio: Alex se apresenta e pergunta o nome e o país. */
const meetAlex: DialogueView = {
  activityKey: 'meet-alex-dialogue',
  type: 'dialogue',
  title: 'Meet Alex',
  lines: [
    { lineKey: 'hi', speaker: 'Alex', text: "Hi! I'm Alex. Welcome to my room!" },
    { lineKey: 'ask-name', speaker: 'Alex', text: "What's your name?", ask: 'name' },
    { lineKey: 'nice', speaker: 'Alex', text: 'Nice to meet you, {name}!' },
    { lineKey: 'ask-country', speaker: 'Alex', text: 'Where are you from?', ask: 'country' },
    { lineKey: 'cool', speaker: 'Alex', text: "{country}? Cool! Let's start." },
  ],
};

/** Os Cartões de expressões (1.14): três blocos de cumprimentos, com os textos do protótipo (`s1-cards`). */
const greetingCards: CardsView = {
  activityKey: 'greetings-cards',
  type: 'cards',
  title: 'Greetings & Introductions',
  blocks: [
    {
      blockKey: 'saying-hello',
      emoji: '👋',
      title: 'Saying hello',
      items: [
        { itemKey: 'hi', text: 'Hi! / Hello!' },
        { itemKey: 'hey-there', text: 'Hey there!' },
        { itemKey: 'good-morning', text: 'Good morning! / Morning!' },
        { itemKey: 'good-evening', text: 'Good evening!' },
      ],
    },
    {
      blockKey: 'introducing-yourself',
      emoji: '🙋',
      title: 'Introducing yourself',
      items: [
        { itemKey: 'im-name', text: "Hi, I'm {name}." },
        { itemKey: 'my-names', text: "Hey, my name's {name}." },
      ],
    },
    {
      blockKey: 'being-polite',
      emoji: '🤝',
      title: 'Being polite',
      items: [
        { itemKey: 'nice-to-meet-you', text: 'Nice to meet you.' },
        { itemKey: 'pleasure', text: "It's a pleasure to meet you." },
        { itemKey: 'how-are-you-doing', text: 'How are you doing?' },
        { itemKey: 'hows-it-going', text: "How's it going?" },
      ],
    },
  ],
};

/** A Expressão Útil destacada (1.14), com a frase do protótipo (`s1-new`). */
const newHere: ExpressionView = {
  activityKey: 'new-here-expression',
  type: 'expression',
  title: 'Alex is new here',
  speaker: 'Alex',
  sentence: "Hi, I'm Alex. [[I'm new here|im-new-here]]!",
};

/** As Expressões Úteis da Unidade que o Estágio usa. */
const usefulExpressions: UsefulExpression[] = [
  {
    expressionKey: 'im-new-here',
    term: "I'm new here",
    meaning:
      'Usado para dizer que você chegou há pouco a um lugar, grupo ou situação e ainda não conhece bem as pessoas.',
    examples: ["Sorry, I'm new here.", "I'm new here, so I don't know anyone yet."],
  },
  {
    expressionKey: 'nice-to-meet-you',
    term: 'Nice to meet you',
    meaning: 'Usado quando você conhece alguém pela primeira vez: "prazer em conhecer você".',
    examples: ['Hi, {name}! Nice to meet you.', 'Nice to meet you too!'],
  },
];

/** A conclusão que cada Tipo aceita, como o `LearningActivityTypes.allowsCompletion` da API. */
const ALLOWED_COMPLETION: Partial<Record<ActivityView['type'], string>> = {
  dialogue: 'VIEWED',
  cards: 'VIEWED',
  expression: 'VIEWED',
  speech: 'SKIPPED',
  free: 'VIEWED',
  grammar: 'VIEWED',
};

/** Gabarito da Fala no mock: as formas aceitas (alvo e alternativas) e o XP. */
const speechKey = new Map<string, { xp: number; target: string; forms: string[] }>();

function speech(
  activityKey: string,
  title: string,
  prompt: string,
  target: string,
  alternatives: string[],
): SpeechView {
  const xp = 10;
  speechKey.set(activityKey, { xp, target, forms: [target, ...alternatives] });
  return { activityKey, type: 'speech', title, prompt, target, xp };
}

/** As contrações mais comuns, expandidas dos dois lados (a lista da API é maior). */
const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am',
  "you're": 'you are',
  "it's": 'it is',
  "name's": 'name is',
  "what's": 'what is',
  "that's": 'that is',
};

/** As palavras que contam: sem placeholder, minúsculas, sem pontuação, contrações expandidas. */
function speechWords(text: string): string[] {
  return text
    .replace(/\{[^{}\s]+\}/g, ' ')
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()
    .split(/ +/)
    .flatMap((word) => (CONTRACTIONS[word] ?? word).split(' '))
    .map((word) => word.replace(/'/g, ''))
    .filter(Boolean);
}

/** Acerto com ao menos 80% das palavras de alguma forma, em qualquer ordem (multiconjunto). */
function speechMatches(transcript: string, forms: string[]): boolean {
  const said = new Map<string, number>();
  for (const word of speechWords(transcript)) said.set(word, (said.get(word) ?? 0) + 1);
  return forms.some((form) => {
    const expected = speechWords(form);
    if (expected.length === 0) return false;
    const counts = new Map<string, number>();
    for (const word of expected) counts.set(word, (counts.get(word) ?? 0) + 1);
    let found = 0;
    for (const [word, count] of counts) found += Math.min(count, said.get(word) ?? 0);
    return found * 5 >= expected.length * 4;
  });
}

/** Um par do Associar no mock: a fala, a resposta certa e a justificativa (que pode faltar). */
type MockPair = { itemKey: string; line: ContentText; correct: string; justification?: ContentText };

/** Gabarito do Associar no mock, privado a este módulo: as respostas conhecidas e o par certo de cada fala. */
const matchKey = new Map<
  string,
  { xp: number; responses: Set<string>; items: Map<string, { correct: string; justification?: ContentText }> }
>();

function match(
  activityKey: string,
  title: string,
  prompt: string,
  pairs: MockPair[],
  responses: [string, ContentText][],
): MatchView {
  const xp = 9;
  matchKey.set(activityKey, {
    xp,
    responses: new Set(responses.map(([responseKey]) => responseKey)),
    items: new Map(
      pairs.map((pair) => [
        pair.itemKey,
        {
          correct: pair.correct,
          ...(pair.justification === undefined ? {} : { justification: pair.justification }),
        },
      ]),
    ),
  });
  return {
    activityKey,
    type: 'match',
    title,
    prompt,
    xp,
    items: pairs.map((pair) => ({ itemKey: pair.itemKey, line: pair.line })),
    responses: responses.map(([responseKey, text]) => ({ responseKey, text })),
  };
}

/** O Associar (1.16), com as falas do `s1-speech-bubbles` da API: três pares e um distrator. */
const speechBubbles = match(
  'speech-bubbles-match',
  'Match the Speech Bubbles',
  'Ligue cada fala do Alex à sua resposta.',
  [
    {
      itemKey: 'speech-bubbles-hi',
      line: "Hi! I'm Alex. What's your name?",
      correct: 'hi-alex',
      justification: 'Respondemos ao **Hi** com o nosso nome.',
    },
    { itemKey: 'speech-bubbles-nice', line: '[[Nice to meet you|nice-to-meet-you]]!', correct: 'nice-too' },
    {
      itemKey: 'speech-bubbles-from',
      line: 'Where are you from?',
      correct: 'from-country',
      justification: 'Para dizer de onde você é, use **I am from**.',
    },
  ],
  [
    ['hi-alex', "Hi Alex! I'm {name}."],
    ['nice-too', '**Nice to meet you** too!'],
    ['from-country', 'I am from {country}.'],
    ['goodbye', 'Goodbye!'],
  ],
);

/** Uma lacuna no mock: as respostas aceitas (a primeira vai no `expected`) e a justificativa. */
type MockGap = { itemKey: string; accepted: string[]; justification?: ContentText };

/** Gabarito das Lacunas no mock, privado a este módulo: as lacunas, na ordem. */
const gapsKey = new Map<string, { xp: number; items: MockGap[] }>();

function gaps(
  activityKey: string,
  title: string,
  prompt: string,
  lines: ContentText[],
  items: MockGap[],
  bank?: [string, ContentText][],
): GapsView {
  const xp = 6;
  gapsKey.set(activityKey, { xp, items });
  return {
    activityKey,
    type: 'gaps',
    title,
    prompt,
    mode: bank ? 'bank' : 'typed',
    lines,
    items: items.map((item) => ({ itemKey: item.itemKey })),
    ...(bank ? { bank: bank.map(([wordKey, text]) => ({ wordKey, text })) } : {}),
    xp,
  };
}

/** As Lacunas do banco (1.17): duas lacunas e um distrator ("is"). */
const gapsBank = gaps(
  'gaps-bank',
  'Complete the Gaps',
  'Toque nas palavras para completar.',
  ['Hi! I ___ Alex.', 'Nice to ___ you!'],
  [
    { itemKey: 'gaps-bank-am', accepted: ['am'], justification: 'Com **I**, usamos **am**.' },
    { itemKey: 'gaps-bank-meet', accepted: ['meet'] },
  ],
  [
    ['am', 'am'],
    ['meet', 'meet'],
    ['is', 'is'],
  ],
);

/** As Lacunas digitadas (1.17), com o nome do aluno numa resposta aceita. */
const gapsTyped = gaps(
  'gaps-typed',
  'Complete the Gaps',
  'Digite as palavras que faltam.',
  ['Hi Alex! ___ {name}.', 'My name is ___.'],
  [
    { itemKey: 'gaps-typed-im', accepted: ["I'm", 'I am'], justification: "Para dizer o nome, use **I'm**." },
    { itemKey: 'gaps-typed-name', accepted: ['{name}'], justification: 'Aqui vai o seu nome.' },
  ],
);

/** Gabarito da Resposta Livre no mock, privado a este módulo: a resposta-modelo e o Extra Help. */
const freeKey = new Map<string, { modelAnswer: ContentText; xp: number; items: MockGap[] }>();

function free(
  activityKey: string,
  title: string,
  prompt: string,
  modelAnswer: ContentText,
  extraHelp: { prompt?: string; lines: ContentText[]; items: MockGap[]; bank: [string, ContentText][] },
): FreeView {
  const xp = 6;
  freeKey.set(activityKey, { modelAnswer, xp, items: extraHelp.items });
  return {
    activityKey,
    type: 'free',
    title,
    prompt,
    extraHelp: {
      ...(extraHelp.prompt ? { prompt: extraHelp.prompt } : {}),
      lines: extraHelp.lines,
      items: extraHelp.items.map((item) => ({ itemKey: item.itemKey })),
      bank: extraHelp.bank.map(([wordKey, text]) => ({ wordKey, text })),
    },
    xp,
  };
}

/** A Resposta Livre (1.18), com o nome do aluno na resposta-modelo e o Extra Help de duas lacunas. */
const aboutYou = free(
  'about-you-free',
  'Your answer',
  "Hi! I'm Alex. What's your name, and where are you from?",
  "Hi Alex! I'm {name}. I'm from {country}.",
  {
    prompt: 'Toque nas palavras para completar.',
    lines: ['Hi Alex! ___ {name}.', "I'm ___ {country}."],
    items: [
      { itemKey: 'about-you-im', accepted: ["I'm", 'I am'], justification: "Para dizer o nome, use **I'm**." },
      { itemKey: 'about-you-from', accepted: ['from'], justification: 'Para dizer o país, use **from**.' },
    ],
    bank: [
      ['im', "I'm"],
      ['from', 'from'],
      ['is', 'is'],
    ],
  },
);

/** As palavras de uma lacuna: a normalização da Fala, mas os tokens (`{name}`) ficam como palavras. */
function gapWords(text: string): string[] {
  return text
    .split(/(\{[^{}\s]+\})/)
    .flatMap((piece) => (/^\{[^{}\s]+\}$/.test(piece) ? [piece.toLowerCase()] : speechWords(piece)));
}

/** A Fala (1.15) que fecha o Estágio, com o alvo da API (`s1-your-turn`). */
const yourTurn = speech('your-turn-speech', "It's your turn", 'Se apresente para o Alex.', "Hi Alex, I'm {name}.", [
  'Hello Alex, my name is {name}.',
]);

/**
 * O Grammar Time (1.19), no molde do fixture da API
 * (`grammar-student-view-full.json`), sem o `[[…|chave]]` da regra.
 */
const verbToBe: GrammarView = {
  activityKey: 'verb-to-be-grammar',
  type: 'grammar',
  title: 'Verb to be',
  used: [
    { sentenceKey: 'my-name', form: 'is', sentence: 'My name **is** {name}.' },
    {
      sentenceKey: 'from-canada',
      form: { he: 'is', she: 'is', they: 'are' },
      sentence: {
        he: 'He **is** from Canada.',
        she: 'She **is** from Canada.',
        they: 'They **are** from Canada.',
      },
    },
  ],
  rules: [
    { ruleKey: 'am', form: 'am', use: 'only with I', example: 'I **am** a student.' },
    { ruleKey: 'is', form: 'is', use: 'with he, she and it', example: '{name} **is** from {country}.' },
    { ruleKey: 'are', form: 'are', use: 'with you, we and they', example: 'You **are** from Canada.' },
  ],
  examples: [
    { exampleKey: 'alex', text: "I'm Alex. My name **is** Alex." },
    {
      exampleKey: 'pronoun',
      text: { he: 'He **is** my friend.', she: 'She **is** my friend.', they: 'They **are** my friends.' },
    },
  ],
};

const stage1Activities: ActivityView[] = [
  meetAlex,
  greetingCards,
  newHere,
  choice(
    'greeting-choice',
    'Choose the greeting',
    [
      {
        question: 'How do you greet someone in the morning?',
        options: [
          ['good-morning', 'Good morning'],
          ['good-night', 'Good night'],
        ],
        correct: 'good-morning',
        justification: '**Good morning** is the greeting until noon.',
      },
      {
        question: "It's late and you're going to bed. What do you say?",
        options: [
          ['good-morning', 'Good morning!'],
          ['good-night', 'Good night!'],
        ],
        correct: 'good-night',
        justification: '**Good night** is for saying goodbye at night.',
      },
      {
        question: 'Alex asks "How are you?". What do you answer?',
        options: [
          ['im-from-brazil', "I'm from Brazil."],
          ['im-fine', "I'm fine, thanks!"],
          ['nice-to-meet-you', 'Nice to meet you!'],
        ],
        correct: 'im-fine',
        justification: '"How are you?" asks how you feel: **I\'m fine, thanks!**',
      },
    ],
    'Pick the best answer for each one, {name}.',
  ),
  choice('name-choice', 'Say your name, {name}', [
    {
      question: 'How do you tell someone your name?',
      options: [
        ['im-julia', "I'm Júlia."],
        ['im-from-brazil', "I'm from Brazil."],
      ],
      correct: 'im-julia',
      justification: "Use **I'm** + your name, {name}.",
    },
  ]),
  choice('nice-to-meet-you-choice', 'Nice to meet you', [
    {
      question: 'Alex says "[[Nice to meet you|nice-to-meet-you]]!". What do you answer?',
      options: [
        ['nice-to-meet-you-too', 'Nice to meet you too!'],
        ['good-night', 'Good night!'],
      ],
      correct: 'nice-to-meet-you-too',
      justification: 'Answer with **Nice to meet you too!**',
    },
  ]),
  speechBubbles,
  gapsBank,
  gapsTyped,
  aboutYou,
  verbToBe,
  yourTurn,
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A primeira Tentativa ou conclusão de um aparelho numa Atividade, como a `visitor_attempts` da API. */
type FirstRecord = { attemptId: string; outcome: string; resultPct: number; receipt: string };
const firstRecords = new Map<string, FirstRecord>();
let receiptSeq = 0;

/** Esquece as Tentativas e conclusões gravadas (testes). */
export function resetMockVisitorRecords() {
  firstRecords.clear();
}

/** `deviceId` do corpo: ausente vira `undefined`; fora do formato UUID, `400 VALIDATION_FAILED`. */
function deviceIdOf(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !UUID.test(value)) throw new MockProblem(400, 'VALIDATION_FAILED');
  return value;
}

/**
 * O recibo da regra da API: só a primeira por `(deviceId, activityKey)` gera um,
 * e o reenvio do mesmo `attemptId` com o mesmo Resultado o devolve de novo.
 */
function receiptFor(
  deviceId: string | undefined,
  activityKey: string,
  attemptId: unknown,
  outcome: string,
  resultPct: number,
): string | undefined {
  if (!deviceId || typeof attemptId !== 'string') return undefined;
  const key = `${deviceId}|${activityKey}`;
  const saved = firstRecords.get(key);
  if (!saved) {
    receiptSeq += 1;
    // Falso e opaco: o App não decodifica, só guarda.
    const receipt = `v1.mock-${receiptSeq.toString(36)}-${Date.now().toString(36)}.unsigned`;
    firstRecords.set(key, { attemptId, outcome, resultPct, receipt });
    return receipt;
  }
  return saved.attemptId === attemptId && saved.outcome === outcome && saved.resultPct === resultPct
    ? saved.receipt
    : undefined;
}

/**
 * Corretor do mock, com as regras do `grade()` da API: resposta que não cobre
 * todos os itens uma vez, com chaves conhecidas e o mesmo `type`, é `400
 * INVALID_ANSWER`; Atividade desconhecida, `404`. `expected` e as justificativas
 * só no Acerto ou no reveal; o reveal não dá XP.
 */
async function gradeAttempt(request: Request, reveal: boolean): Promise<{ data: AttemptResult }> {
  const body = (await request.json().catch(() => null)) as {
    attemptId?: unknown;
    deviceId?: unknown;
    activityKey?: unknown;
    type?: unknown;
    answer?: { type?: unknown; items?: unknown; transcript?: unknown };
  } | null;
  const key = typeof body?.activityKey === 'string' ? answerKey.get(body.activityKey) : undefined;
  if (!body || typeof body.activityKey !== 'string') throw new MockProblem(400, 'VALIDATION_FAILED');
  const deviceId = deviceIdOf(body.deviceId);
  const spoken = speechKey.get(body.activityKey);
  if (spoken) return gradeSpeech(body, deviceId, spoken, reveal);
  const blanks = gapsKey.get(body.activityKey);
  if (blanks) return gradeGaps(body, deviceId, blanks, reveal);
  const helped = freeKey.get(body.activityKey);
  if (helped) return gradeGaps(body, deviceId, helped, reveal, 'free');
  const pairs = matchKey.get(body.activityKey);
  if (pairs) return gradeMatch(body, deviceId, pairs, reveal);
  if (!key) throw new MockProblem(404, 'NOT_FOUND');
  const answers = body.answer?.items;
  if (body.type !== 'choice' || body.answer?.type !== 'choice' || !Array.isArray(answers)) {
    throw new MockProblem(400, 'INVALID_ANSWER');
  }
  const chosen = new Map<string, string>();
  for (const item of answers as { itemKey?: unknown; optionKey?: unknown }[]) {
    if (typeof item?.itemKey !== 'string' || typeof item.optionKey !== 'string') {
      throw new MockProblem(400, 'INVALID_ANSWER');
    }
    if (!key.items.has(item.itemKey) || chosen.has(item.itemKey)) throw new MockProblem(400, 'INVALID_ANSWER');
    chosen.set(item.itemKey, item.optionKey);
  }
  if (chosen.size !== key.items.size) throw new MockProblem(400, 'INVALID_ANSWER');

  const items = [...key.items].map(([itemKey, { correct, justification }]) => ({
    itemKey,
    correct: chosen.get(itemKey) === correct,
    justification,
  }));
  const expected = {
    type: 'choice' as const,
    items: [...key.items].map(([itemKey, { correct }]) => ({ itemKey, optionKey: correct })),
  };
  return gradedResult(body, deviceId, reveal, key.xp, items, expected);
}

/** O Resultado de uma correção por itens (Escolha, Associar e Lacunas), com as regras de recibo e reveal da API. */
function gradedResult(
  body: { attemptId?: unknown; activityKey?: unknown },
  deviceId: string | undefined,
  reveal: boolean,
  xp: number,
  items: { itemKey: string; correct: boolean; justification?: ContentText }[],
  expected: AttemptResult['expected'],
): { data: AttemptResult } {
  const activityKey = body.activityKey as string;
  const total = items.length;
  const right = items.filter((item) => item.correct).length;
  const resultPct = right === total ? 100 : Math.min(99, Math.round((100 * right) / total));
  const open = reveal || resultPct === 100;
  // O reveal exige uma Tentativa do aparelho na Atividade e não gera recibo.
  if (reveal && (!deviceId || !firstRecords.has(`${deviceId}|${activityKey}`))) {
    throw new MockProblem(409, 'ATTEMPT_REQUIRED');
  }
  const receipt = reveal ? undefined : receiptFor(deviceId, activityKey, body.attemptId, 'GRADED', resultPct);
  return {
    data: {
      ...(receipt ? { receipt } : {}),
      outcome: 'GRADED',
      resultPct,
      xpAwarded: reveal ? 0 : Math.round((xp * resultPct) / 100),
      items: items.map(({ justification, ...item }) =>
        open && justification !== undefined ? { ...item, justification } : item,
      ),
      ...(open ? { expected } : {}),
    },
  };
}

/**
 * O Associar no corretor do mock, como o `Grader.match` da API: cada fala ligada
 * a uma resposta da Atividade, sem repetir fala nem resposta, e todas as falas
 * cobertas; fora disso, `400 INVALID_ANSWER`. O `expected` são os pares certos,
 * na ordem das falas.
 */
function gradeMatch(
  body: { attemptId?: unknown; activityKey?: unknown; type?: unknown; answer?: { type?: unknown; items?: unknown } },
  deviceId: string | undefined,
  key: { xp: number; responses: Set<string>; items: Map<string, { correct: string; justification?: ContentText }> },
  reveal: boolean,
): { data: AttemptResult } {
  const answers = body.answer?.items;
  if (body.type !== 'match' || body.answer?.type !== 'match' || !Array.isArray(answers)) {
    throw new MockProblem(400, 'INVALID_ANSWER');
  }
  const chosen = new Map<string, string>();
  const used = new Set<string>();
  for (const item of answers as { itemKey?: unknown; responseKey?: unknown }[]) {
    if (typeof item?.itemKey !== 'string' || typeof item.responseKey !== 'string') {
      throw new MockProblem(400, 'INVALID_ANSWER');
    }
    if (!key.items.has(item.itemKey) || chosen.has(item.itemKey)) throw new MockProblem(400, 'INVALID_ANSWER');
    if (!key.responses.has(item.responseKey) || used.has(item.responseKey)) {
      throw new MockProblem(400, 'INVALID_ANSWER');
    }
    chosen.set(item.itemKey, item.responseKey);
    used.add(item.responseKey);
  }
  if (chosen.size !== key.items.size) throw new MockProblem(400, 'INVALID_ANSWER');
  const items = [...key.items].map(([itemKey, { correct, justification }]) => ({
    itemKey,
    correct: chosen.get(itemKey) === correct,
    ...(justification === undefined ? {} : { justification }),
  }));
  const expected = {
    type: 'match' as const,
    items: [...key.items].map(([itemKey, { correct }]) => ({ itemKey, responseKey: correct })),
  };
  return gradedResult(body, deviceId, reveal, key.xp, items, expected);
}

/**
 * As Lacunas (e o Extra Help da Resposta Livre, `type` `free`) no corretor do
 * mock, como o `Grader.gaps` da API: um valor por
 * lacuna, sem repetir nem faltar, de 1 a 100 caracteres e não em branco; fora
 * disso, `400 INVALID_ANSWER`. Certo quando o valor tem as mesmas palavras de
 * uma resposta aceita. O `expected` é a primeira resposta aceita de cada item.
 */
function gradeGaps(
  body: { attemptId?: unknown; activityKey?: unknown; type?: unknown; answer?: { type?: unknown; items?: unknown } },
  deviceId: string | undefined,
  key: { xp: number; items: MockGap[] },
  reveal: boolean,
  type: 'gaps' | 'free' = 'gaps',
): { data: AttemptResult } {
  const answers = body.answer?.items;
  if (body.type !== type || body.answer?.type !== type || !Array.isArray(answers)) {
    throw new MockProblem(400, 'INVALID_ANSWER');
  }
  const known = new Set(key.items.map((item) => item.itemKey));
  const given = new Map<string, string>();
  for (const item of answers as { itemKey?: unknown; value?: unknown }[]) {
    if (typeof item?.itemKey !== 'string' || typeof item.value !== 'string')
      throw new MockProblem(400, 'INVALID_ANSWER');
    if (!known.has(item.itemKey) || given.has(item.itemKey)) throw new MockProblem(400, 'INVALID_ANSWER');
    if (!item.value.trim() || [...item.value].length > 100) throw new MockProblem(400, 'INVALID_ANSWER');
    given.set(item.itemKey, item.value);
  }
  if (given.size !== key.items.length) throw new MockProblem(400, 'INVALID_ANSWER');
  const items = key.items.map(({ itemKey, accepted, justification }) => {
    const value = gapWords(given.get(itemKey)!).join(' ');
    return {
      itemKey,
      correct: value !== '' && accepted.some((form) => gapWords(form).join(' ') === value),
      ...(justification === undefined ? {} : { justification }),
    };
  });
  // No Extra Help, o reveal exige uma Tentativa corrigida: a conclusão `VIEWED` não basta (como na API).
  if (reveal && type === 'free' && firstRecords.get(`${deviceId}|${body.activityKey}`)?.outcome !== 'GRADED') {
    throw new MockProblem(409, 'ATTEMPT_REQUIRED');
  }
  const values = key.items.map(({ itemKey, accepted }) => ({ itemKey, value: accepted[0]! }));
  const expected =
    type === 'free' ? { type: 'free' as const, items: values } : { type: 'gaps' as const, items: values };
  const graded = gradedResult(body, deviceId, reveal, key.xp, items, expected);
  // O Extra Help da Resposta Livre leva a marca no Resultado, como na API.
  return type === 'free' ? { data: { ...graded.data, extraHelp: true } } : graded;
}

/**
 * A Fala no corretor do mock, como o `Grader.speech` da API: tudo ou nada, um
 * item (a `activityKey`), transcrição em branco ou acima de 500 caracteres é
 * `400 INVALID_ANSWER`. O `expected` é o alvo cru, e vem sempre (o da API também).
 */
function gradeSpeech(
  body: {
    attemptId?: unknown;
    activityKey?: unknown;
    type?: unknown;
    answer?: { type?: unknown; transcript?: unknown };
  },
  deviceId: string | undefined,
  key: { xp: number; target: string; forms: string[] },
  reveal: boolean,
): { data: AttemptResult } {
  const activityKey = body.activityKey as string;
  const transcript = body.answer?.transcript;
  if (body.type !== 'speech' || body.answer?.type !== 'speech' || typeof transcript !== 'string') {
    throw new MockProblem(400, 'INVALID_ANSWER');
  }
  if (!transcript.trim() || [...transcript].length > 500) throw new MockProblem(400, 'INVALID_ANSWER');
  if (reveal && (!deviceId || !firstRecords.has(`${deviceId}|${activityKey}`))) {
    throw new MockProblem(409, 'ATTEMPT_REQUIRED');
  }
  const right = speechMatches(transcript, key.forms);
  const resultPct = right ? 100 : 0;
  const receipt = reveal ? undefined : receiptFor(deviceId, activityKey, body.attemptId, 'GRADED', resultPct);
  return {
    data: {
      ...(receipt ? { receipt } : {}),
      outcome: 'GRADED',
      resultPct,
      xpAwarded: reveal || !right ? 0 : key.xp,
      items: [{ itemKey: activityKey, correct: right }],
      expected: { type: 'speech', transcript: key.target },
    },
  };
}

/**
 * Conclusão sem correção (VIEWED ou SKIPPED), sem XP; o `deviceId` é obrigatório.
 * O Tipo decide a conclusão aceita; fora dela, `409 COMPLETION_NOT_ALLOWED`.
 */
async function complete(request: Request): Promise<{ data: CompletionResult }> {
  const body = (await request.json().catch(() => null)) as {
    attemptId?: unknown;
    deviceId?: unknown;
    activityKey?: unknown;
    outcome?: unknown;
  } | null;
  if (!body || typeof body.activityKey !== 'string' || typeof body.attemptId !== 'string') {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  const deviceId = deviceIdOf(body.deviceId);
  if (!deviceId || (body.outcome !== 'VIEWED' && body.outcome !== 'SKIPPED')) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  const activityKey = body.activityKey;
  const activity = stage1Activities.find((entry) => entry.activityKey === activityKey);
  if (!activity) throw new MockProblem(404, 'NOT_FOUND');
  if (ALLOWED_COMPLETION[activity.type] !== body.outcome) throw new MockProblem(409, 'COMPLETION_NOT_ALLOWED');
  const receipt = receiptFor(deviceId, activityKey, body.attemptId, body.outcome, 0);
  // A Resposta Livre: a resposta-modelo vem na conclusão, também na repetição.
  const model = freeKey.get(activityKey)?.modelAnswer;
  return {
    data: {
      outcome: body.outcome,
      xpAwarded: 0,
      ...(receipt ? { receipt } : {}),
      ...(model === undefined ? {} : { modelAnswer: model }),
    },
  };
}

export const mockRoutes: MockRoutes = {
  '/api/v1/meta': {
    get: () => ({ data: { minAppVersion: '0.0.0', activityTypes: [] } }),
  },
  '/api/v1/units': {
    get: () => ({ data: [unit1, unit2] }),
  },
  '/api/v1/units/{unitKey}': {
    get: () => ({
      data: {
        ...unit1,
        stages: [{ stageKey: 'stage-1', title: 'Meet & Greet', activityCount: stage1Activities.length }],
        usefulExpressions,
      },
    }),
  },
  '/api/v1/units/{unitKey}/stages/{stageKey}': {
    get: () => ({
      data: {
        versionId: VERSION_ID,
        stageKey: 'stage-1',
        title: 'Meet & Greet',
        activities: stage1Activities,
      },
    }),
  },
  '/api/v1/visitor/attempts': {
    post: (request) => gradeAttempt(request, false),
  },
  '/api/v1/visitor/attempts/reveal': {
    post: (request) => gradeAttempt(request, true),
  },
  '/api/v1/visitor/completions': {
    post: (request) => complete(request),
  },
  // Rotas do job de publicação: o App não as chama, mas o tipo exige um mock por rota.
  '/api/v1/admin/content/units/{unitKey}/versions': {
    post: () => ({ data: { versionId: VERSION_ID, created: false, published: true } }),
  },
  '/api/v1/admin/content/units/{unitKey}/versions/{versionId}': {
    get: () => ({
      data: {
        versionId: VERSION_ID,
        unitKey: 'unit-1',
        schemaVersion: 1,
        order: 1,
        createdAt: '2026-11-14T00:00:00Z',
        published: true,
      },
    }),
  },
};
