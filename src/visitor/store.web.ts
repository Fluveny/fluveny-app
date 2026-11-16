// Loja do Visitante no web: a mesma API do store.ts, sobre o `localStorage`
// (o expo-sqlite no web pede WebAssembly e cabeçalhos COOP/COEP). Se o
// `localStorage` não existir ou lançar (modo privado, bloqueado), a loja segue
// em memória até a página fechar.
import { randomUUID } from 'expo-crypto';

import {
  createEmitter,
  isOutcome,
  safeXp,
  type ProgressEntry,
  type ReceiptEntry,
  type VariableKey,
  type VisitorStore,
} from './types';

export type { Outcome, ProgressEntry, Pronoun, ReceiptEntry, VariableKey, VisitorStore } from './types';

/** Prefixo das chaves no `localStorage`. */
export const VISITOR_PREFIX = 'fluveny:visitor:';
const DEVICE = `${VISITOR_PREFIX}device`;
const VARIABLES = `${VISITOR_PREFIX}variables`;
const PROGRESS = `${VISITOR_PREFIX}progress`;
/** Os recibos da API (1.12): `[{activityKey, receipt, createdAt}]`. */
export const RECEIPTS = `${VISITOR_PREFIX}receipts`;

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): KeyValue | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function readJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function asVariables(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (pair): pair is [string, string] => typeof pair[1] === 'string',
    ),
  );
}

function asProgress(value: unknown): ProgressEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ProgressEntry[] => {
    if (!item || typeof item !== 'object') return [];
    const { activityKey, outcome, xp } = item as Record<string, unknown>;
    if (typeof activityKey !== 'string' || !isOutcome(outcome) || typeof xp !== 'number') return [];
    return [{ activityKey, outcome, xp: safeXp(xp) }];
  });
}

type StoredReceipt = ReceiptEntry & { createdAt: number };

function asReceipts(value: unknown): StoredReceipt[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): StoredReceipt[] => {
    if (!item || typeof item !== 'object') return [];
    const { activityKey, receipt, createdAt } = item as Record<string, unknown>;
    if (typeof activityKey !== 'string' || typeof receipt !== 'string') return [];
    return [{ activityKey, receipt, createdAt: typeof createdAt === 'number' ? createdAt : 0 }];
  });
}

export function createVisitorStore(storage: KeyValue | undefined = defaultStorage()): VisitorStore {
  const emitter = createEmitter();
  const memory = new Map<string, string>();

  const read = (key: string): string | null => {
    try {
      // setItem pode lançar com o getItem funcionando: o que só foi para a memória vale.
      if (storage) return storage.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      // Cai na memória.
    }
    return memory.get(key) ?? null;
  };
  const write = (key: string, value: string) => {
    memory.set(key, value);
    try {
      storage?.setItem(key, value);
    } catch {
      // Fica só na memória.
    }
  };

  return {
    async deviceId() {
      const saved = read(DEVICE);
      if (saved) return saved;
      const id = randomUUID();
      write(DEVICE, id);
      return id;
    },
    async getVariable(key: VariableKey) {
      return asVariables(readJson(read(VARIABLES)))[key] ?? null;
    },
    async setVariable(key: VariableKey, value: string) {
      const variables = asVariables(readJson(read(VARIABLES)));
      write(VARIABLES, JSON.stringify({ ...variables, [key]: value }));
      emitter.emit();
    },
    async variables() {
      return asVariables(readJson(read(VARIABLES)));
    },
    async progress() {
      return asProgress(readJson(read(PROGRESS)));
    },
    async recordProgress(entry: ProgressEntry) {
      const progress = asProgress(readJson(read(PROGRESS)));
      if (progress.some((saved) => saved.activityKey === entry.activityKey)) return;
      write(PROGRESS, JSON.stringify([...progress, { ...entry, xp: safeXp(entry.xp) }]));
      emitter.emit();
    },
    async recordReceipt(activityKey: string, receipt: string) {
      const receipts = asReceipts(readJson(read(RECEIPTS)));
      if (receipts.some((saved) => saved.activityKey === activityKey)) return;
      write(RECEIPTS, JSON.stringify([...receipts, { activityKey, receipt, createdAt: Date.now() }]));
    },
    async receipts() {
      return asReceipts(readJson(read(RECEIPTS))).map(({ activityKey, receipt }) => ({ activityKey, receipt }));
    },
    subscribe: emitter.subscribe,
  };
}

/** A loja do App. */
export const visitorStore: VisitorStore = createVisitorStore();
