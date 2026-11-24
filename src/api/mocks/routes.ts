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
//
// Fim do Estágio (1.20): o Estágio traz a frase `completion` com `{name}`, e a
// rota dos eventos do Visitante responde 202 sem corpo, com as validações da
// API (corpo fechado, `deviceId` UUID, Atividade do Estágio no ACTIVITY_STARTED).
//
// Cadastro (2.1): `POST /auth/signup` responde 201 (`MOCK_CREATED`) com as
// regras da API (corpo fechado, senha, data, 12 e 18 anos, e-mail repetido) e
// abre uma sessão só na memória do mock: some ao recarregar, porque o mock não
// grava cookie. No Android (`X-Fluveny-Client: android`), devolve um
// `sessionToken` falso e confere o Bearer; no web, a sessão vale para qualquer
// requisição. `GET`/`PATCH /students/me` sem sessão dão 401.
//
// Confirmação de e-mail (2.2): o cadastro e o reenvio emitem um token de uso
// único (`mockConfirmationToken()` devolve o último); `POST
// /account/email-confirmation` confirma com ele, com ou sem sessão, e token
// desconhecido ou já usado dá 410. O reenvio (`POST
// /students/me/email-confirmation`) responde 202, ou 409 com o e-mail já
// confirmado; `forceMockResend` força o 409 ou o 429.
//
// Entrar e sair (2.3): o mock guarda a senha de cada conta (só na memória). `POST
// /auth/login` confere e-mail e senha (401 `INVALID_CREDENTIALS` igual para os
// dois), conta desativada (`deactivateMockAccount`) só com a senha certa dá 403,
// e `forceMockLogin('LOGIN_THROTTLED')` força o 429; o sucesso abre a sessão como
// o cadastro. `POST /auth/logout` responde 204 sempre (`MOCK_NO_CONTENT`) e
// encerra a sessão do mock se ela for a da requisição.
//
// Progresso do Aluno (2.4): as rotas `/students/me/attempts`, `attempts/reveal`,
// `completions` e `events` exigem a sessão do mock (401 sem ela), têm corpo
// fechado (o `deviceId` dá 400) e nunca trazem recibo. Como a API, a primeira
// Tentativa ou conclusão de cada conta e Atividade é gravada; o reenvio do mesmo
// `attemptId` devolve o XP gravado, e outro `attemptId`, 0. O reveal sem registro
// é `409 ATTEMPT_REQUIRED`, e a conclusão segue o `COMPLETION_NOT_ALLOWED` do
// Visitante. `GET /students/me/progress` soma o `xpTotal` a cada leitura.
// `resetMockStudentRecords()` esquece o Progresso (testes).
//
// Recuperação de senha (2.8): `POST /auth/password-recovery` responde 202 sempre,
// para e-mail cadastrado ou não; só conta ativa com o e-mail confirmado recebe um
// token de uso único (`mockPasswordResetToken()` devolve o último), e
// `forceMockRecovery('TOO_MANY_REQUESTS')` força o 429. `POST /auth/password-reset`
// responde 204 (`MOCK_NO_CONTENT`): senha fora da regra dá 400 sem gastar o
// token; token desconhecido ou usado, 410. O sucesso troca a senha, apaga os
// tokens da conta e encerra a sessão do mock dessa conta. O perfil traz
// `emailConfirmationOverdue`: `true` só sem confirmar e depois de
// `markMockConfirmationOverdue(email)` (os 7 dias, que o mock não conta).
//
// Painel (2.5): `GET /students/me/dashboard` é calculado, a cada leitura, dos
// registros do Aluno da sessão (401 sem ela): a `unit-1` com o `stage-1`
// (`CURRENT` até todas as Atividades terem registro, depois `COMPLETED`), o
// `next` na primeira Atividade sem registro, a média dos `GRADED` e a `unit-2`
// "em breve", sem Estágios. `forceMockStageLocked(true)` faz a Tentativa, o
// reveal e a conclusão do Aluno responderem `409 STAGE_LOCKED`, sem gravar nada.
import mockCountries from '../../player/countries.json';
import type { components, paths } from '../schema';

export const MOCK_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Method = (typeof MOCK_METHODS)[number];

type Json<R> = R extends { content: { 'application/json': infer B } } ? B : never;

/** Corpo da resposta de sucesso (200 ou 201) da operação; `202` e `204` sem corpo são `undefined`. */
type SuccessBody<O> = O extends { responses: infer R }
  ? R extends { 200: infer S }
    ? Json<S>
    : R extends { 201: infer S }
      ? Json<S>
      : R extends { 202: unknown }
        ? undefined
        : R extends { 204: unknown }
          ? undefined
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
type FirstRecord = { attemptId: string; outcome: string; resultPct: number; receipt: string; xp: number };
const firstRecords = new Map<string, FirstRecord>();
/** Recibos já migrados num cadastro (2.6): não migram de novo. */
const usedReceipts = new Set<string>();
let receiptSeq = 0;

/**
 * Grava, como a rota do Visitante, a primeira resposta de um aparelho numa
 * Atividade com `xp` e devolve o recibo (testes da migração, 2.6).
 */
export function seedMockVisitorRecord(deviceId: string, activityKey: string, xp: number, resultPct = 100): string {
  return receiptFor(deviceId, activityKey, `seed-${activityKey}`, 'GRADED', resultPct, xp)!;
}

/** Esquece as Tentativas e conclusões gravadas (testes). */
export function resetMockVisitorRecords() {
  firstRecords.clear();
  usedReceipts.clear();
}

/**
 * A primeira Tentativa ou conclusão do Aluno numa Atividade, como a
 * `activity_results` da API (2.4): o XP dela, o Resultado (só no `GRADED`) e o
 * tempo de estudo. Chave: e-mail e `activityKey`, na ordem de gravação.
 */
type StudentRecord = {
  activityKey: string;
  attemptId: string;
  outcome: 'GRADED' | 'VIEWED' | 'SKIPPED';
  resultPct?: number;
  xpAwarded: number;
  studyTimeMs: number;
};
const studentRecords = new Map<string, StudentRecord>();

/** Com `true`, as gravações do Aluno (Tentativa, reveal e conclusão) respondem `409 STAGE_LOCKED` (2.5). */
let forcedStageLocked = false;

/** Esquece o Progresso gravado dos Alunos do mock (testes). */
export function resetMockStudentRecords() {
  studentRecords.clear();
  forcedStageLocked = false;
}

export function forceMockStageLocked(on: boolean) {
  forcedStageLocked = on;
}

/** O teto do `studyTimeMs` da API (24 h). */
const MAX_STUDY_TIME_MS = 86_400_000;

/**
 * Quem responde: o Visitante, pelo `deviceId` (recibo, 1.12), ou o Aluno da
 * sessão do mock, pelo e-mail (Progresso no servidor, 2.4).
 */
type Respondent =
  { kind: 'visitor'; deviceId: string | undefined } | { kind: 'student'; email: string; studyTimeMs: number };

/** Quem responde já tem a primeira Tentativa ou conclusão na Atividade (com `graded`, só uma Tentativa corrigida). */
function hasRecord(who: Respondent, activityKey: string, graded = false): boolean {
  const saved =
    who.kind === 'visitor'
      ? who.deviceId
        ? firstRecords.get(`${who.deviceId}|${activityKey}`)
        : undefined
      : studentRecords.get(`${who.email}|${activityKey}`);
  return saved !== undefined && (!graded || saved.outcome === 'GRADED');
}

/**
 * Grava a primeira resposta, como a API. O Visitante ganha o recibo (o XP é o
 * da correção, sempre). O Aluno ganha o XP só na primeira: o reenvio do mesmo
 * `attemptId` com o mesmo Resultado devolve o XP gravado; outra resposta, 0.
 */
function settle(
  who: Respondent,
  activityKey: string,
  attemptId: unknown,
  outcome: StudentRecord['outcome'],
  resultPct: number | undefined,
  xp: number,
): { receipt?: string; xpAwarded: number } {
  if (who.kind === 'visitor') {
    const receipt = receiptFor(who.deviceId, activityKey, attemptId, outcome, resultPct ?? 0, xp);
    return { ...(receipt ? { receipt } : {}), xpAwarded: xp };
  }
  const key = `${who.email}|${activityKey}`;
  const saved = studentRecords.get(key);
  if (!saved) {
    studentRecords.set(key, {
      activityKey,
      attemptId: attemptId as string,
      outcome,
      ...(resultPct === undefined ? {} : { resultPct }),
      xpAwarded: xp,
      studyTimeMs: who.studyTimeMs,
    });
    return { xpAwarded: xp };
  }
  const same = saved.attemptId === attemptId && saved.outcome === outcome && saved.resultPct === resultPct;
  return { xpAwarded: same ? saved.xpAwarded : 0 };
}

/**
 * O Aluno das rotas `/students/me/*` do mock: sessão (senão 401), corpo fechado
 * (campo fora de `fields`, como o `deviceId`, é 400) e `studyTimeMs` inteiro de
 * 0 a 24 h.
 */
function studentRespondent(request: Request, body: Record<string, unknown> | null, fields: ReadonlySet<string>) {
  const student = mockStudentOf(request);
  if (!body || typeof body !== 'object' || Object.keys(body).some((key) => !fields.has(key))) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  // A sequência (2.5): o Estágio travado é recusado antes de corrigir, sem gravar nada.
  if (forcedStageLocked) throw new MockProblem(409, 'STAGE_LOCKED');
  const ms = body.studyTimeMs;
  if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < 0 || ms > MAX_STUDY_TIME_MS) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  if (typeof body.attemptId !== 'string' || !UUID.test(body.attemptId)) throw new MockProblem(400, 'VALIDATION_FAILED');
  return { kind: 'student', email: student.email, studyTimeMs: ms } as const;
}

const STUDENT_ATTEMPT_FIELDS = new Set(['attemptId', 'versionId', 'activityKey', 'type', 'answer', 'studyTimeMs']);
const STUDENT_COMPLETION_FIELDS = new Set(['attemptId', 'versionId', 'activityKey', 'outcome', 'studyTimeMs']);

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
  xp: number,
): string | undefined {
  if (!deviceId || typeof attemptId !== 'string') return undefined;
  const key = `${deviceId}|${activityKey}`;
  const saved = firstRecords.get(key);
  if (!saved) {
    receiptSeq += 1;
    // Falso e opaco: o App não decodifica, só guarda.
    const receipt = `v1.mock-${receiptSeq.toString(36)}-${Date.now().toString(36)}.unsigned`;
    firstRecords.set(key, { attemptId, outcome, resultPct, receipt, xp });
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
async function gradeAttempt(
  request: Request,
  reveal: boolean,
  as: 'visitor' | 'student' = 'visitor',
): Promise<{ data: AttemptResult }> {
  const body = (await request.json().catch(() => null)) as {
    attemptId?: unknown;
    deviceId?: unknown;
    activityKey?: unknown;
    type?: unknown;
    answer?: { type?: unknown; items?: unknown; transcript?: unknown };
  } | null;
  const who: Respondent =
    as === 'student'
      ? studentRespondent(request, body as Record<string, unknown> | null, STUDENT_ATTEMPT_FIELDS)
      : { kind: 'visitor', deviceId: undefined };
  const key = typeof body?.activityKey === 'string' ? answerKey.get(body.activityKey) : undefined;
  if (!body || typeof body.activityKey !== 'string') throw new MockProblem(400, 'VALIDATION_FAILED');
  if (who.kind === 'visitor') who.deviceId = deviceIdOf(body.deviceId);
  const spoken = speechKey.get(body.activityKey);
  if (spoken) return gradeSpeech(body, who, spoken, reveal);
  const blanks = gapsKey.get(body.activityKey);
  if (blanks) return gradeGaps(body, who, blanks, reveal);
  const helped = freeKey.get(body.activityKey);
  if (helped) return gradeGaps(body, who, helped, reveal, 'free');
  const pairs = matchKey.get(body.activityKey);
  if (pairs) return gradeMatch(body, who, pairs, reveal);
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
  return gradedResult(body, who, reveal, key.xp, items, expected);
}

/** O Resultado de uma correção por itens (Escolha, Associar e Lacunas), com as regras de recibo e reveal da API. */
function gradedResult(
  body: { attemptId?: unknown; activityKey?: unknown },
  who: Respondent,
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
  // O reveal exige uma Tentativa de quem responde na Atividade e não gera recibo nem XP.
  if (reveal && !hasRecord(who, activityKey)) throw new MockProblem(409, 'ATTEMPT_REQUIRED');
  const { receipt, xpAwarded } = reveal
    ? { receipt: undefined, xpAwarded: 0 }
    : settle(who, activityKey, body.attemptId, 'GRADED', resultPct, Math.round((xp * resultPct) / 100));
  return {
    data: {
      ...(receipt ? { receipt } : {}),
      outcome: 'GRADED',
      resultPct,
      xpAwarded,
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
  who: Respondent,
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
  return gradedResult(body, who, reveal, key.xp, items, expected);
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
  who: Respondent,
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
  if (reveal && type === 'free' && !hasRecord(who, body.activityKey as string, true)) {
    throw new MockProblem(409, 'ATTEMPT_REQUIRED');
  }
  const values = key.items.map(({ itemKey, accepted }) => ({ itemKey, value: accepted[0]! }));
  const expected =
    type === 'free' ? { type: 'free' as const, items: values } : { type: 'gaps' as const, items: values };
  const graded = gradedResult(body, who, reveal, key.xp, items, expected);
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
  who: Respondent,
  key: { xp: number; target: string; forms: string[] },
  reveal: boolean,
): { data: AttemptResult } {
  const activityKey = body.activityKey as string;
  const transcript = body.answer?.transcript;
  if (body.type !== 'speech' || body.answer?.type !== 'speech' || typeof transcript !== 'string') {
    throw new MockProblem(400, 'INVALID_ANSWER');
  }
  if (!transcript.trim() || [...transcript].length > 500) throw new MockProblem(400, 'INVALID_ANSWER');
  if (reveal && !hasRecord(who, activityKey)) throw new MockProblem(409, 'ATTEMPT_REQUIRED');
  const right = speechMatches(transcript, key.forms);
  const resultPct = right ? 100 : 0;
  const { receipt, xpAwarded } = reveal
    ? { receipt: undefined, xpAwarded: 0 }
    : settle(who, activityKey, body.attemptId, 'GRADED', resultPct, right ? key.xp : 0);
  return {
    data: {
      ...(receipt ? { receipt } : {}),
      outcome: 'GRADED',
      resultPct,
      xpAwarded,
      items: [{ itemKey: activityKey, correct: right }],
      expected: { type: 'speech', transcript: key.target },
    },
  };
}

/**
 * Conclusão sem correção (VIEWED ou SKIPPED), sem XP; o `deviceId` é obrigatório.
 * O Tipo decide a conclusão aceita; fora dela, `409 COMPLETION_NOT_ALLOWED`.
 */
async function complete(request: Request, as: 'visitor' | 'student' = 'visitor'): Promise<{ data: CompletionResult }> {
  const body = (await request.json().catch(() => null)) as {
    attemptId?: unknown;
    deviceId?: unknown;
    activityKey?: unknown;
    outcome?: unknown;
  } | null;
  const who: Respondent =
    as === 'student'
      ? studentRespondent(request, body as Record<string, unknown> | null, STUDENT_COMPLETION_FIELDS)
      : { kind: 'visitor', deviceId: undefined };
  if (!body || typeof body.activityKey !== 'string' || typeof body.attemptId !== 'string') {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  if (who.kind === 'visitor') {
    who.deviceId = deviceIdOf(body.deviceId);
    if (!who.deviceId) throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  if (body.outcome !== 'VIEWED' && body.outcome !== 'SKIPPED') throw new MockProblem(400, 'VALIDATION_FAILED');
  const activityKey = body.activityKey;
  const activity = stage1Activities.find((entry) => entry.activityKey === activityKey);
  if (!activity) throw new MockProblem(404, 'NOT_FOUND');
  if (ALLOWED_COMPLETION[activity.type] !== body.outcome) throw new MockProblem(409, 'COMPLETION_NOT_ALLOWED');
  const { receipt } = settle(who, activityKey, body.attemptId, body.outcome, undefined, 0);
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

/** A frase do resumo do Estágio 1 (1.20), com o nome do Visitante [ASSUMPTION: texto do mock, não do conteúdo]. */
const STAGE_COMPLETION = 'Now you can say hello and tell people where you are from, {name}.';

const EVENT_FIELDS = new Set(['type', 'deviceId', 'versionId', 'activityKey']);

/**
 * Evento do Visitante (1.20), como a rota da API: corpo fechado (campo
 * desconhecido é `400`), `deviceId` UUID obrigatório e, no `ACTIVITY_STARTED`,
 * `versionId` e `activityKey` de uma Atividade do Estágio (senão, `404`).
 * Responde 202 sem corpo.
 */
async function recordEvent(request: Request): Promise<undefined> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Object.keys(body).some((key) => !EVENT_FIELDS.has(key))) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  if (!deviceIdOf(body.deviceId)) throw new MockProblem(400, 'VALIDATION_FAILED');
  if (body.type === 'VISITOR_SESSION_STARTED') {
    if (body.versionId !== undefined || body.activityKey !== undefined) throw new MockProblem(400, 'VALIDATION_FAILED');
    return undefined;
  }
  if (body.type !== 'ACTIVITY_STARTED') throw new MockProblem(400, 'VALIDATION_FAILED');
  if (typeof body.versionId !== 'string' || typeof body.activityKey !== 'string') {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  const known = stage1Activities.some((activity) => activity.activityKey === body.activityKey);
  if (body.versionId !== VERSION_ID || !known) throw new MockProblem(404, 'NOT_FOUND');
  return undefined;
}

const STUDENT_EVENT_FIELDS = new Set(['type', 'versionId', 'activityKey']);

/**
 * Evento do Aluno (2.4), como a rota da API: sessão (senão 401), corpo fechado
 * (o `deviceId` é campo desconhecido, 400), só `ACTIVITY_STARTED`, de uma
 * Atividade do Estágio (senão 404). Responde 202 sem corpo.
 */
async function recordStudentEvent(request: Request): Promise<undefined> {
  mockStudentOf(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Object.keys(body).some((key) => !STUDENT_EVENT_FIELDS.has(key))) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  if (body.type !== 'ACTIVITY_STARTED' || typeof body.versionId !== 'string' || typeof body.activityKey !== 'string') {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  const known = stage1Activities.some((activity) => activity.activityKey === body.activityKey);
  if (body.versionId !== VERSION_ID || !known) throw new MockProblem(404, 'NOT_FOUND');
  return undefined;
}

/** O Progresso do Aluno da sessão do mock: o XP somado a cada leitura e a primeira conclusão de cada Atividade. */
function studentProgress(request: Request) {
  const { email } = mockStudentOf(request);
  const results = [...studentRecords.entries()]
    .filter(([key]) => key.startsWith(`${email}|`))
    .map(([, record]) => ({
      unitKey: unit1.unitKey,
      activityKey: record.activityKey,
      outcome: record.outcome,
      ...(record.resultPct === undefined ? {} : { resultPct: record.resultPct }),
      xpAwarded: record.xpAwarded,
      studyTimeMs: record.studyTimeMs,
    }));
  return { data: { xpTotal: results.reduce((sum, result) => sum + result.xpAwarded, 0), results } };
}

/** O título do Estágio 1 do mock, o mesmo da Unidade e do Estágio. */
const STAGE_1_TITLE = 'Meet & Greet';

/**
 * O painel do Aluno da sessão do mock (2.5), calculado dos registros a cada
 * leitura, como a API: o Estágio 1 conclui com todas as Atividades
 * registradas (puladas contam), o `next` é a primeira sem registro e a média
 * é só dos `GRADED`. A Unit 2 é "em breve", sem Estágios.
 */
function studentDashboard(request: Request) {
  const student = mockStudentOf(request);
  const records = [...studentRecords.entries()]
    .filter(([key]) => key.startsWith(`${student.email}|`))
    .map(([, record]) => record);
  const done = new Set(records.map((record) => record.activityKey));
  const pending = stage1Activities.findIndex((activity) => !done.has(activity.activityKey));
  const stageDone = pending === -1;
  const graded = records.flatMap((record) =>
    record.outcome === 'GRADED' && record.resultPct !== undefined ? [record.resultPct] : [],
  );
  const average = graded.length ? Math.round(graded.reduce((sum, pct) => sum + pct, 0) / graded.length) : undefined;
  return {
    data: {
      ...(student.name ? { name: student.name } : {}),
      xpTotal: records.reduce((sum, record) => sum + record.xpAwarded, 0),
      badgeCount: 0,
      units: [
        {
          unitKey: unit1.unitKey,
          order: unit1.order,
          title: unit1.title,
          comingSoon: false,
          versionId: VERSION_ID,
          started: records.some((record) => stage1Activities.some((a) => a.activityKey === record.activityKey)),
          stagesCompleted: stageDone ? 1 : 0,
          stagesTotal: 1,
          ...(average === undefined ? {} : { averageResultPct: average }),
          stages: [{ stageKey: 'stage-1', title: STAGE_1_TITLE, state: stageDone ? 'COMPLETED' : 'CURRENT' } as const],
          ...(stageDone
            ? {}
            : {
                next: {
                  stageKey: 'stage-1',
                  activityKey: stage1Activities[pending]!.activityKey,
                  position: pending + 1,
                  total: stage1Activities.length,
                },
              }),
        },
        {
          unitKey: unit2.unitKey,
          order: unit2.order,
          title: unit2.title,
          comingSoon: true,
          versionId: unit2.versionId,
          started: false,
          stagesCompleted: 0,
          stagesTotal: 0,
          stages: [],
        },
      ],
    },
  };
}

/** As rotas que só respondem `201 Created` no contrato (sem 200), por `MÉTODO caminho`. */
export const MOCK_CREATED: ReadonlySet<string> = new Set(['POST /api/v1/auth/signup']);

/** As rotas que respondem `204 No Content` no contrato (as outras sem corpo dão 202), por `MÉTODO caminho`. */
export const MOCK_NO_CONTENT: ReadonlySet<string> = new Set([
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/password-reset',
]);

type MockStudent = components['schemas']['StudentProfile'];

/** Uma conta do mock: a senha (só na memória do mock), o perfil e se está desativada. */
type MockAccount = { password: string; student: MockStudent; deactivated: boolean };
/** As contas do mock, por e-mail em minúsculas. */
const mockAccounts = new Map<string, MockAccount>();
/** A sessão do mock: o Aluno e, no Android, o token esperado no Bearer. */
let mockSession: { student: MockStudent; token: string | null } | null = null;
/** Os e-mails confirmados no mock. */
const confirmedEmails = new Set<string>();
/** Os tokens de confirmação válidos, com o e-mail de cada um (um por conta: o reenvio troca). */
const confirmationTokens = new Map<string, string>();
let lastConfirmationToken: string | null = null;
let confirmationSeq = 0;
/** Resposta forçada do reenvio (testes e mock manual): `409` ou `429`. */
let forcedResend: 'EMAIL_ALREADY_CONFIRMED' | 'TOO_MANY_REQUESTS' | null = null;
/** Resposta forçada do login (testes e mock manual): `429`. */
let forcedLogin: 'LOGIN_THROTTLED' | null = null;
/** Os e-mails cujo prazo de 7 dias para confirmar já passou (o mock não conta o tempo). */
const overdueEmails = new Set<string>();
/** Os tokens de redefinição válidos, com o e-mail de cada um (vários por conta: um pedido novo não invalida os outros). */
const passwordResetTokens = new Map<string, string>();
let lastPasswordResetToken: string | null = null;
let passwordResetSeq = 0;
/** Resposta forçada do pedido de recuperação (testes e mock manual): `429`. */
let forcedRecovery: 'TOO_MANY_REQUESTS' | null = null;

/** Esquece as contas, a sessão e as confirmações do mock (testes). */
export function resetMockStudents() {
  mockAccounts.clear();
  mockSession = null;
  confirmedEmails.clear();
  confirmationTokens.clear();
  lastConfirmationToken = null;
  forcedResend = null;
  forcedLogin = null;
  overdueEmails.clear();
  passwordResetTokens.clear();
  lastPasswordResetToken = null;
  forcedRecovery = null;
  forcedStageLocked = false;
}

/** Marca que o prazo de 7 dias para confirmar o e-mail da conta já passou. */
export function markMockConfirmationOverdue(email: string) {
  overdueEmails.add(email.toLowerCase());
}

/** O token do último link de redefinição de senha emitido pelo mock. */
export function mockPasswordResetToken(): string | null {
  return lastPasswordResetToken;
}

/** Força a resposta do pedido de recuperação: `429 TOO_MANY_REQUESTS` ou nada. */
export function forceMockRecovery(code: 'TOO_MANY_REQUESTS' | null) {
  forcedRecovery = code;
}

/** O perfil como a API o devolve agora: a confirmação e o prazo dela. */
function currentProfile(student: MockStudent): MockStudent {
  const emailConfirmed = confirmedEmails.has(student.email);
  return { ...student, emailConfirmed, emailConfirmationOverdue: !emailConfirmed && overdueEmails.has(student.email) };
}

/** Força a resposta do login: `429 LOGIN_THROTTLED` ou nada. */
export function forceMockLogin(code: 'LOGIN_THROTTLED' | null) {
  forcedLogin = code;
}

/** Desativa a conta do mock (o login com a senha certa passa a dar 403). */
export function deactivateMockAccount(email: string) {
  const account = mockAccounts.get(email.toLowerCase());
  if (account) account.deactivated = true;
}

/** Encerra a sessão do mock por fora do App (a sessão que venceu no servidor). */
export function expireMockSession() {
  mockSession = null;
}

/** Um `sessionToken` falso para o Android: 43 caracteres base64url, o formato do token da API. */
let tokenSeq = 0;
function mockSessionToken(): string {
  tokenSeq += 1;
  return `mock${Date.now().toString(36)}${tokenSeq}`.padEnd(43, '0').slice(0, 43);
}

/** Abre a sessão do mock para o Aluno e monta a resposta do cadastro e do login. */
function openMockSession(student: MockStudent, client: 'web' | 'android') {
  const token = client === 'android' ? mockSessionToken() : null;
  mockSession = { student, token };
  const current = currentProfile(student);
  return { data: token ? { student: current, sessionToken: token } : { student: current } };
}

/** O token do último link de confirmação emitido pelo mock (cadastro ou reenvio). */
export function mockConfirmationToken(): string | null {
  return lastConfirmationToken;
}

/** Força a resposta do reenvio da confirmação: `409 EMAIL_ALREADY_CONFIRMED`, `429 TOO_MANY_REQUESTS` ou nada. */
export function forceMockResend(code: 'EMAIL_ALREADY_CONFIRMED' | 'TOO_MANY_REQUESTS' | null) {
  forcedResend = code;
}

/** Emite um token novo para o e-mail; o anterior deixa de valer, como na API. */
function issueConfirmationToken(email: string): string {
  for (const [token, owner] of confirmationTokens) if (owner === email) confirmationTokens.delete(token);
  confirmationSeq += 1;
  const token = `mock-confirmacao-${confirmationSeq}`;
  confirmationTokens.set(token, email);
  lastConfirmationToken = token;
  return token;
}

const SIGNUP_FIELDS = new Set([
  'email',
  'password',
  'birthDate',
  'name',
  'acceptedTermsVersion',
  'acceptedPrivacyVersion',
  'country',
  'visitor',
]);
const MOCK_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A regra de senha da API (`PasswordPolicy`): 8 a 64, letra e número, até 72 bytes. */
function mockPasswordOk(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const length = [...value].length;
  return (
    length >= 8 &&
    length <= 64 &&
    /\p{L}/u.test(value) &&
    /\p{Nd}/u.test(value) &&
    new TextEncoder().encode(value).length <= 72
  );
}

/** A idade em anos completos hoje, de `yyyy-MM-dd`; `null` se a data não existe, é futura ou antes de 1900. */
function mockAge(value: unknown, today = new Date()): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const [ty, tm, td] = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  if (year < 1900 || year > ty || (year === ty && (month > tm || (month === tm && day > td)))) return null;
  return ty - year - (tm < month || (tm === month && td < day) ? 1 : 0);
}

const MOCK_COUNTRIES: ReadonlySet<string> = new Set(mockCountries.map((country: { name: string }) => country.name));

/** O `visitor` do cadastro (2.6): `deviceId` UUID e até 200 recibos de até 1024 caracteres; fora disso, 400. */
function mockVisitorOf(value: unknown): { deviceId: string; receipts: string[] } | undefined {
  if (value === undefined) return undefined;
  const visitor = value as { deviceId?: unknown; receipts?: unknown } | null;
  if (
    !visitor ||
    typeof visitor !== 'object' ||
    typeof visitor.deviceId !== 'string' ||
    !UUID.test(visitor.deviceId) ||
    !Array.isArray(visitor.receipts) ||
    visitor.receipts.length > 200 ||
    visitor.receipts.some((receipt) => typeof receipt !== 'string' || receipt.length > 1024)
  ) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  return { deviceId: visitor.deviceId, receipts: visitor.receipts as string[] };
}

/**
 * Migra os recibos do Visitante para o Progresso da conta, como a API (2.6):
 * só os emitidos para esse `deviceId`, uma vez cada; o resto é descartado sem erro.
 */
function migrateMockReceipts(email: string, { deviceId, receipts }: { deviceId: string; receipts: string[] }) {
  const wanted = new Set(receipts);
  for (const [key, record] of firstRecords) {
    if (!wanted.has(record.receipt) || usedReceipts.has(record.receipt) || !key.startsWith(`${deviceId}|`)) continue;
    const activityKey = key.slice(deviceId.length + 1);
    const outcome = record.outcome === 'VIEWED' || record.outcome === 'SKIPPED' ? record.outcome : 'GRADED';
    if (!studentRecords.has(`${email}|${activityKey}`)) {
      studentRecords.set(`${email}|${activityKey}`, {
        activityKey,
        attemptId: record.attemptId,
        outcome,
        ...(outcome === 'GRADED' ? { resultPct: record.resultPct } : {}),
        xpAwarded: record.xp,
        studyTimeMs: 0,
      });
    }
    // Recibo usado não migra de novo.
    usedReceipts.add(record.receipt);
  }
}

/** Cadastro do Aluno adulto, como o `SignupController` e o `RegisterStudent` da API. */
async function mockSignup(request: Request) {
  const client = request.headers.get('X-Fluveny-Client');
  if (client !== 'web' && client !== 'android') throw new MockProblem(400, 'CLIENT_HEADER_REQUIRED');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Object.keys(body).some((key) => !SIGNUP_FIELDS.has(key))) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : undefined;
  const versions = [body.acceptedTermsVersion, body.acceptedPrivacyVersion];
  if (
    !MOCK_EMAIL.test(email) ||
    email.length > 254 ||
    (name !== undefined && name.length > 60) ||
    versions.some((version) => typeof version !== 'string' || !version.trim() || version.length > 16) ||
    !mockPasswordOk(body.password)
  ) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  const age = mockAge(body.birthDate);
  if (age === null) throw new MockProblem(400, 'VALIDATION_FAILED');
  if (age < 12) throw new MockProblem(422, 'AGE_BELOW_MINIMUM');
  if (age < 18) throw new MockProblem(422, 'GUARDIAN_CONSENT_REQUIRED');
  const key = email.toLowerCase();
  if (mockAccounts.has(key)) throw new MockProblem(409, 'EMAIL_ALREADY_REGISTERED');
  const student: MockStudent = {
    email: key,
    name: name || null,
    pronounSet: null,
    emailConfirmed: false,
    emailConfirmationOverdue: false,
  };
  const visitor = mockVisitorOf(body.visitor);
  if (body.country !== undefined && (typeof body.country !== 'string' || !MOCK_COUNTRIES.has(body.country))) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  mockAccounts.set(key, { password: body.password as string, student, deactivated: false });
  if (visitor) migrateMockReceipts(key, visitor);
  issueConfirmationToken(key);
  return openMockSession(student, client);
}

/** Entrar, como o `LoginController` da API: e-mail desconhecido e senha errada dão o mesmo 401. */
async function mockLogin(request: Request) {
  const client = request.headers.get('X-Fluveny-Client');
  if (client !== 'web' && client !== 'android') throw new MockProblem(400, 'CLIENT_HEADER_REQUIRED');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body !== 'object' ||
    Object.keys(body).some((key) => key !== 'email' && key !== 'password') ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string' ||
    !body.email.trim() ||
    !body.password ||
    body.email.length > 254 ||
    body.password.length > 256
  ) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  if (forcedLogin) throw new MockProblem(429, forcedLogin);
  const account = mockAccounts.get(body.email.trim().toLowerCase());
  if (!account || account.password !== body.password) throw new MockProblem(401, 'INVALID_CREDENTIALS');
  if (account.deactivated) throw new MockProblem(403, 'ACCOUNT_DEACTIVATED');
  return openMockSession(account.student, client);
}

/** Sair: sempre 204; encerra a sessão do mock se ela for a da requisição. */
function mockLogout(request: Request): undefined {
  const client = request.headers.get('X-Fluveny-Client');
  if (client !== 'web' && client !== 'android') throw new MockProblem(400, 'CLIENT_HEADER_REQUIRED');
  const bearer = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (mockSession && (mockSession.token === null || bearer === mockSession.token)) mockSession = null;
  return undefined;
}

/** O Aluno da sessão do mock; sem sessão (ou com outro Bearer), `401`. */
function mockStudentOf(request: Request): MockStudent {
  const bearer = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!mockSession || (mockSession.token !== null && bearer !== mockSession.token)) {
    throw new MockProblem(401, 'UNAUTHENTICATED');
  }
  return currentProfile(mockSession.student);
}

/** `POST /auth/password-recovery`: 202 sempre; só conta ativa e confirmada recebe o token. */
async function mockRequestPasswordRecovery(request: Request): Promise<undefined> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body !== 'object' ||
    Object.keys(body).some((key) => key !== 'email') ||
    typeof body.email !== 'string' ||
    !MOCK_EMAIL.test(body.email.trim()) ||
    body.email.length > 254
  ) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  if (forcedRecovery) throw new MockProblem(429, forcedRecovery);
  const email = body.email.trim().toLowerCase();
  const account = mockAccounts.get(email);
  if (account && !account.deactivated && confirmedEmails.has(email)) {
    passwordResetSeq += 1;
    const token = `mock-redefinicao-${passwordResetSeq}`;
    passwordResetTokens.set(token, email);
    lastPasswordResetToken = token;
  }
  return undefined;
}

/** `POST /auth/password-reset`: 204; senha fora da regra, 400 sem gastar o token; token desconhecido ou usado, 410. */
async function mockResetPassword(request: Request): Promise<undefined> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body !== 'object' ||
    Object.keys(body).some((key) => key !== 'token' && key !== 'password') ||
    typeof body.token !== 'string' ||
    !body.token.trim() ||
    body.token.length > 128 ||
    !mockPasswordOk(body.password)
  ) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  const email = passwordResetTokens.get(body.token);
  const account = email ? mockAccounts.get(email) : undefined;
  if (!email || !account) throw new MockProblem(410, 'PASSWORD_RESET_LINK_INVALID');
  account.password = body.password as string;
  for (const [token, owner] of passwordResetTokens) if (owner === email) passwordResetTokens.delete(token);
  if (mockSession?.student.email === email) mockSession = null;
  return undefined;
}

/** `POST /account/email-confirmation`: pública; token de uso único, desconhecido ou usado dá 410. */
async function mockConfirmEmail(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body !== 'object' ||
    Object.keys(body).some((key) => key !== 'token') ||
    typeof body.token !== 'string' ||
    !body.token.trim() ||
    body.token.length > 128
  ) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  const email = confirmationTokens.get(body.token);
  if (!email) throw new MockProblem(410, 'CONFIRMATION_LINK_INVALID');
  confirmationTokens.delete(body.token);
  confirmedEmails.add(email);
  return { data: null, message: 'E-mail confirmado.' };
}

/** `POST /students/me/email-confirmation`: 202; já confirmado, 409; `forceMockResend` força 409 ou 429. */
function mockResendConfirmation(request: Request): undefined {
  const client = request.headers.get('X-Fluveny-Client');
  if (client !== 'web' && client !== 'android') throw new MockProblem(403, 'CLIENT_HEADER_REQUIRED');
  const student = mockStudentOf(request);
  if (forcedResend === 'TOO_MANY_REQUESTS') throw new MockProblem(429, 'TOO_MANY_REQUESTS');
  if (forcedResend === 'EMAIL_ALREADY_CONFIRMED' || student.emailConfirmed) {
    throw new MockProblem(409, 'EMAIL_ALREADY_CONFIRMED');
  }
  issueConfirmationToken(student.email);
  return undefined;
}

/** `PATCH /students/me`: só `pronounSet`, um dos três ou nulo. */
async function mockUpdatePronouns(request: Request) {
  const student = mockStudentOf(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body !== 'object' ||
    Object.keys(body).some((key) => key !== 'pronounSet') ||
    !(body.pronounSet === null || ['HE', 'SHE', 'THEY'].includes(body.pronounSet as string))
  ) {
    throw new MockProblem(400, 'VALIDATION_FAILED');
  }
  const updated: MockStudent = { ...student, pronounSet: body.pronounSet as MockStudent['pronounSet'] };
  mockSession = { ...mockSession!, student: updated };
  const account = mockAccounts.get(updated.email);
  if (account) account.student = updated;
  return { data: updated };
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
        stages: [{ stageKey: 'stage-1', title: STAGE_1_TITLE, activityCount: stage1Activities.length }],
        usefulExpressions,
      },
    }),
  },
  '/api/v1/units/{unitKey}/stages/{stageKey}': {
    get: () => ({
      data: {
        versionId: VERSION_ID,
        stageKey: 'stage-1',
        title: STAGE_1_TITLE,
        completion: STAGE_COMPLETION,
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
  '/api/v1/visitor/events': {
    post: (request) => recordEvent(request),
  },
  '/api/v1/auth/signup': {
    post: (request) => mockSignup(request),
  },
  '/api/v1/students/me': {
    get: (request) => ({ data: mockStudentOf(request) }),
    patch: (request) => mockUpdatePronouns(request),
  },
  '/api/v1/students/me/attempts': {
    post: (request) => gradeAttempt(request, false, 'student'),
  },
  '/api/v1/students/me/attempts/reveal': {
    post: (request) => gradeAttempt(request, true, 'student'),
  },
  '/api/v1/students/me/completions': {
    post: (request) => complete(request, 'student'),
  },
  '/api/v1/students/me/events': {
    post: (request) => recordStudentEvent(request),
  },
  '/api/v1/students/me/progress': {
    get: (request) => studentProgress(request),
  },
  '/api/v1/students/me/dashboard': {
    get: (request) => studentDashboard(request),
  },
  '/api/v1/students/me/email-confirmation': {
    post: (request) => mockResendConfirmation(request),
  },
  '/api/v1/account/email-confirmation': {
    post: (request) => mockConfirmEmail(request),
  },
  '/api/v1/auth/login': {
    post: (request) => mockLogin(request),
  },
  '/api/v1/auth/logout': {
    post: (request) => mockLogout(request),
  },
  '/api/v1/auth/password-recovery': {
    post: (request) => mockRequestPasswordRecovery(request),
  },
  '/api/v1/auth/password-reset': {
    post: (request) => mockResetPassword(request),
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
