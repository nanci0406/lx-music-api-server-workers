// API 用户

import { now } from '../lib/utils';

export interface User {
  id: number;
  name: string;
  api_key: string;
  enabled: number;
  created_at: number;
  last_used_at: number | null;
}

export function userByNameAndKeyStatement(db: D1Database, name: string, apiKey: string): D1PreparedStatement {
  return db.prepare('SELECT id, name, api_key, enabled FROM users WHERE name = ? AND api_key = ?').bind(name, apiKey);
}

/** 更新最近使用时间；一分钟内已经更新过就不再写(D1 按写入的行数计费) */
export function touchUserStatement(db: D1Database, userId: number): D1PreparedStatement {
  const ts = now();
  return db.prepare('UPDATE users SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)')
    .bind(ts, userId, ts - 60);
}

/** 用户名和 Key 都匹配、且未停用的用户；同时更新最近使用时间 */
export async function getUserByNameAndKey(db: D1Database, name: string, apiKey: string): Promise<User | null> {
  const user = await userByNameAndKeyStatement(db, name, apiKey).first<User>();
  if (!user || !user.enabled) return null;
  await touchUserStatement(db, user.id).run();
  return user;
}

export async function getUserByKey(db: D1Database, apiKey: string): Promise<User | null> {
  const user = await db.prepare('SELECT id, name, api_key, enabled FROM users WHERE api_key = ?').bind(apiKey).first<User>();
  if (!user || !user.enabled) return null;
  await touchUserStatement(db, user.id).run();
  return user;
}

export async function listUsers(db: D1Database): Promise<User[]> {
  const rows = await db.prepare('SELECT id, name, api_key, enabled, created_at, last_used_at FROM users ORDER BY id ASC').all<User>();
  return rows.results;
}

/** 用户列表，附带累计解析次数与成功次数 */
export async function listUsersWithUsage(db: D1Database) {
  const rows = await db.prepare(
    `SELECT u.id, u.name, u.api_key, u.enabled, u.created_at, u.last_used_at,
            COUNT(p.id) AS total,
            COALESCE(SUM(CASE WHEN p.success = 1 THEN 1 ELSE 0 END), 0) AS success_count
     FROM users u LEFT JOIN parse_logs p ON p.user_id = u.id
     GROUP BY u.id
     ORDER BY u.id ASC`).all();
  return rows.results;
}

export async function getUser(db: D1Database, userId: number): Promise<User | null> {
  return db.prepare('SELECT id, name, api_key, enabled, created_at, last_used_at FROM users WHERE id = ?').bind(userId).first<User>();
}

export async function createUser(db: D1Database, name: string, apiKey: string): Promise<void> {
  await db.prepare('INSERT INTO users (name, api_key, enabled, created_at) VALUES (?, ?, 1, ?)').bind(name, apiKey, now()).run();
}

export async function deleteUser(db: D1Database, userId: number): Promise<void> {
  // 历史解析记录保留(只断开与用户的关联)
  await db.batch([
    db.prepare('UPDATE parse_logs SET user_id = NULL WHERE user_id = ?').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);
}

export async function setEnabled(db: D1Database, userId: number, enabled: boolean): Promise<boolean> {
  const result = await db.prepare('UPDATE users SET enabled = ? WHERE id = ?').bind(enabled ? 1 : 0, userId).run();
  return result.meta.changes > 0;
}

export async function setApiKey(db: D1Database, userId: number, apiKey: string): Promise<boolean> {
  const result = await db.prepare('UPDATE users SET api_key = ? WHERE id = ?').bind(apiKey, userId).run();
  return result.meta.changes > 0;
}

/** 返回 'name' / 'api_key' 表示已被其他用户占用，否则返回 null */
export async function nameOrKeyTaken(db: D1Database, name: string | null, apiKey: string | null, excludeId?: number): Promise<'name' | 'api_key' | null> {
  for (const [column, value] of [['name', name], ['api_key', apiKey]] as const) {
    if (value === null) continue;
    const row = await db.prepare(`SELECT id FROM users WHERE ${column} = ?`).bind(value).first<{ id: number }>();
    if (row && row.id !== excludeId) return column;
  }
  return null;
}
