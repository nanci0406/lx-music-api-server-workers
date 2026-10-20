// D1：自动建表 / 升级，以及几个常用的查询辅助函数

import schemaSql from '../db/schema.sql';
import { log } from './log';
import { now } from './utils';

const logger = log('db');

// 表结构有变化时加一，Worker 会在下一次请求时重新执行 schema.sql(语句都是幂等的)
export const SCHEMA_VERSION = 2;

let ready: Promise<void> | null = null;

/** 把 schema.sql 拆成单条语句 */
export function schemaStatements(sql: string = schemaSql): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function migrate(db: D1Database): Promise<void> {
  let version = 0;
  try {
    const row = await db.prepare("SELECT value FROM kv WHERE key = 'schema_version'").first<{ value: string }>();
    version = Number(row?.value || 0);
  } catch {
    version = 0; // kv 表还不存在
  }
  if (version >= SCHEMA_VERSION) return;
  await db.batch(schemaStatements().map((statement) => db.prepare(statement)));
  // 旧版创建的 module_health 没有 admin_detail 列
  const columns = await db.prepare('PRAGMA table_info(module_health)').all<{ name: string }>();
  if (!columns.results.some((column) => column.name === 'admin_detail')) {
    await db.prepare('ALTER TABLE module_health ADD COLUMN admin_detail TEXT').run();
  }
  // 已下线的平台(酷我、咪咕)留下的状态记录
  await db.prepare("DELETE FROM module_health WHERE source NOT IN ('tx', 'kg', 'wy')").run();
  await db
    .prepare("INSERT INTO kv (key, value, version, updated_at) VALUES ('schema_version', ?, 0, ?) " +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(String(SCHEMA_VERSION), now())
    .run();
  logger.info(`数据库表结构已更新到版本 ${SCHEMA_VERSION}`);
}

/** 确保表结构已创建(每个 Worker 实例只检查一次) */
export function ensureSchema(db: D1Database): Promise<void> {
  if (!ready) {
    ready = migrate(db).catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

/** 测试用：让下一次请求重新检查表结构 */
export function resetSchemaState(): void {
  ready = null;
}

// ---------------------------------------------------------------------------
// kv 表：保存小块的 JSON 数据(QQ 音乐设备信息等)
// ---------------------------------------------------------------------------

export async function kvGet<T>(db: D1Database, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT value FROM kv WHERE key = ?').bind(key).first<{ value: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function kvSet(db: D1Database, key: string, value: unknown): Promise<void> {
  await db
    .prepare('INSERT INTO kv (key, value, version, updated_at) VALUES (?, ?, 0, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .bind(key, JSON.stringify(value), now())
    .run();
}
