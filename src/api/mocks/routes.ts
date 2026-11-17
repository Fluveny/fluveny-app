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
// Escolhas e a Fala (o player percorre 1 de 7 a 7 de 7), e a Unit 2 "em breve" (sem Estágios). A primeira Escolha
// tem 3 itens (Resultado "n de 3 itens"); as outras, um só.
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
type ActivityView = ChoiceView | DialogueView | CardsView | ExpressionView | SpeechView;
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

/** A Fala (1.15) que fecha o Estágio, com o alvo da API (`s1-your-turn`). */
const yourTurn = speech('your-turn-speech', "It's your turn", 'Se apresente para o Alex.', "Hi Alex, I'm {name}.", [
  'Hello Alex, my name is {name}.',
]);

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

  const total = key.items.size;
  const items = [...key.items].map(([itemKey, { correct }]) => ({ itemKey, correct: chosen.get(itemKey) === correct }));
  const right = items.filter((item) => item.correct).length;
  const resultPct = right === total ? 100 : Math.min(99, Math.round((100 * right) / total));
  const open = reveal || resultPct === 100;
  // O reveal exige uma Tentativa do aparelho na Atividade e não gera recibo.
  if (reveal && (!deviceId || !firstRecords.has(`${deviceId}|${body.activityKey}`))) {
    throw new MockProblem(409, 'ATTEMPT_REQUIRED');
  }
  const receipt = reveal ? undefined : receiptFor(deviceId, body.activityKey, body.attemptId, 'GRADED', resultPct);
  return {
    data: {
      ...(receipt ? { receipt } : {}),
      outcome: 'GRADED',
      resultPct,
      xpAwarded: reveal ? 0 : Math.round((key.xp * resultPct) / 100),
      items: items.map((item) =>
        open ? { ...item, justification: key.items.get(item.itemKey)!.justification } : item,
      ),
      ...(open
        ? {
            expected: {
              type: 'choice' as const,
              items: [...key.items].map(([itemKey, { correct }]) => ({ itemKey, optionKey: correct })),
            },
          }
        : {}),
    },
  };
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
  return { data: { outcome: body.outcome, xpAwarded: 0, ...(receipt ? { receipt } : {}) } };
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
