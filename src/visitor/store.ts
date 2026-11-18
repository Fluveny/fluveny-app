// Loja do Visitante no aparelho (Android), sobre o expo-sqlite. No web, o Metro
// usa o store.web.ts (localStorage), com a mesma API. As tabelas:
// - `device`: uma linha só, com o `deviceId` (UUID v4 do expo-crypto);
// - `variables`: chave/valor das Variáveis do Aluno (nome, país, pronome…);
// - `progress`: a primeira conclusão de cada Atividade (`activityKey`, `outcome`, `xp` e,
//   desde a 1.20, `result_pct` e `study_time_ms`, nulos nas linhas antigas);
// - `receipts`: o primeiro recibo opaco da API por Atividade (1.12);
// - `seen`: os avisos já vistos no aparelho (o de privacidade do microfone, 1.15).
// Tabela nova entra com `IF NOT EXISTS`: um banco antigo a ganha na abertura.
// Coluna nova entra em `COLUMNS`: a abertura a acrescenta com `ALTER TABLE` se faltar.
import { randomUUID } from 'expo-crypto';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import {
  createEmitter,
  isOutcome,
  progressEntry,
  safeMs,
  safePct,
  safeXp,
  type ProgressEntry,
  type ReceiptEntry,
  type SeenKey,
  type VariableKey,
  type VisitorStore,
} from './types';

export type { Outcome, ProgressEntry, Pronoun, ReceiptEntry, SeenKey, VariableKey, VisitorStore } from './types';

/** Arquivo do banco no aparelho. */
export const VISITOR_DB = 'visitor.db';

/** Só o que a loja usa do `SQLiteDatabase`: facilita trocar o banco nos testes. */
export type VisitorDatabase = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS device (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  device_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS variables (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS progress (
  activity_key TEXT PRIMARY KEY NOT NULL,
  outcome TEXT NOT NULL,
  xp INTEGER NOT NULL,
  result_pct INTEGER,
  study_time_ms INTEGER
);
CREATE TABLE IF NOT EXISTS receipts (
  activity_key TEXT PRIMARY KEY NOT NULL,
  receipt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS seen (
  key TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL
);
`;

/** Colunas acrescentadas depois da criação da tabela (o banco antigo as ganha na abertura). */
const COLUMNS: { table: string; column: string; type: string }[] = [
  { table: 'progress', column: 'result_pct', type: 'INTEGER' },
  { table: 'progress', column: 'study_time_ms', type: 'INTEGER' },
];

async function addMissingColumns(database: VisitorDatabase) {
  for (const { table, column, type } of COLUMNS) {
    const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    if (columns.some((info) => info.name === column)) continue;
    try {
      await database.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (error) {
      // Outra abertura do mesmo banco acrescentou a coluna entre a leitura e o ALTER.
      if (!/duplicate column name/i.test(String((error as Error | undefined)?.message ?? error))) throw error;
    }
  }
}

type ProgressRow = {
  activity_key: string;
  outcome: string;
  xp: number;
  result_pct: number | null;
  study_time_ms: number | null;
};

export function createVisitorStore(
  open: () => Promise<VisitorDatabase> = () => openDatabaseAsync(VISITOR_DB),
): VisitorStore {
  const emitter = createEmitter();
  let ready: Promise<VisitorDatabase> | null = null;

  // Abre e cria as tabelas uma vez. Se falhar, a próxima chamada tenta de novo.
  const db = (): Promise<VisitorDatabase> => {
    if (!ready) {
      ready = open().then(async (database) => {
        await database.execAsync(SCHEMA);
        await addMissingColumns(database);
        return database;
      });
      ready.catch(() => {
        ready = null;
      });
    }
    return ready;
  };

  return {
    async deviceId() {
      const database = await db();
      // INSERT OR IGNORE: duas chamadas ao mesmo tempo ficam com o mesmo id.
      await database.runAsync('INSERT OR IGNORE INTO device (id, device_id) VALUES (1, ?)', randomUUID());
      const row = await database.getFirstAsync<{ device_id: string }>('SELECT device_id FROM device WHERE id = 1');
      if (!row) throw new Error('deviceId não gravado');
      return row.device_id;
    },
    async getVariable(key: VariableKey) {
      const database = await db();
      const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM variables WHERE key = ?', key);
      return row?.value ?? null;
    },
    async setVariable(key: VariableKey, value: string) {
      const database = await db();
      await database.runAsync(
        'INSERT INTO variables (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        value,
      );
      emitter.emit();
    },
    async variables() {
      const database = await db();
      const rows = await database.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM variables');
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    },
    async progress() {
      const database = await db();
      const rows = await database.getAllAsync<ProgressRow>(
        'SELECT activity_key, outcome, xp, result_pct, study_time_ms FROM progress ORDER BY rowid',
      );
      return rows.flatMap((row): ProgressEntry[] =>
        isOutcome(row.outcome)
          ? [progressEntry(row.activity_key, row.outcome, row.xp, row.result_pct, row.study_time_ms)]
          : [],
      );
    },
    async recordProgress(entry: ProgressEntry) {
      const database = await db();
      const result = await database.runAsync(
        'INSERT OR IGNORE INTO progress (activity_key, outcome, xp, result_pct, study_time_ms) VALUES (?, ?, ?, ?, ?)',
        entry.activityKey,
        entry.outcome,
        safeXp(entry.xp),
        safePct(entry.resultPct) ?? null,
        safeMs(entry.studyTimeMs) ?? null,
      );
      if (result.changes > 0) emitter.emit();
    },
    async recordReceipt(activityKey: string, receipt: string) {
      const database = await db();
      await database.runAsync(
        'INSERT OR IGNORE INTO receipts (activity_key, receipt, created_at) VALUES (?, ?, ?)',
        activityKey,
        receipt,
        Date.now(),
      );
    },
    async receipts() {
      const database = await db();
      const rows = await database.getAllAsync<{ activity_key: string; receipt: string }>(
        'SELECT activity_key, receipt FROM receipts ORDER BY rowid',
      );
      return rows.map((row): ReceiptEntry => ({ activityKey: row.activity_key, receipt: row.receipt }));
    },
    async seen(key: SeenKey) {
      const database = await db();
      const row = await database.getFirstAsync<{ key: string }>('SELECT key FROM seen WHERE key = ?', key);
      return row !== null && row !== undefined;
    },
    async markSeen(key: SeenKey) {
      const database = await db();
      await database.runAsync('INSERT OR IGNORE INTO seen (key, created_at) VALUES (?, ?)', key, Date.now());
    },
    subscribe: emitter.subscribe,
  };
}

/** A loja do App. */
export const visitorStore: VisitorStore = createVisitorStore();
