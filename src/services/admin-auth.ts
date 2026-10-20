// 管理员登录：密码校验、会话、登录失败限制

import type { Env } from '../env';
import { hashPassword, sha256Hex, tokenUrlSafe, verifyPassword } from '../lib/crypto';
import { log } from '../lib/log';
import { now } from '../lib/utils';

const logger = log('admin_auth');

export const COOKIE_NAME = 'lx_admin_session';

// 会话有效期：连续 SESSION_IDLE_SECONDS 无操作，或登录满 SESSION_MAX_SECONDS 后需要重新登录
export const SESSION_IDLE_SECONDS = 4 * 3600;
export const SESSION_MAX_SECONDS = 24 * 3600;
// 会话的最近活动时间最多每隔这么久写一次数据库
const TOUCH_INTERVAL = 60;

// 登录失败限制：同一 IP 在 LOGIN_WINDOW_SECONDS 内失败 LOGIN_MAX_FAILURES 次后暂时拒绝登录
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_SECONDS = 15 * 60;

export const MIN_PASSWORD_LENGTH = 8;

export interface AdminSession {
  token: string;
  username: string;
  created_at: number;
  last_seen: number;
}

function tokenHash(token: string): string {
  return sha256Hex(token);
}

export async function createSession(db: D1Database, username: string): Promise<string> {
  const ts = now();
  const token = tokenUrlSafe(32);
  await db.batch([
    db.prepare('DELETE FROM admin_sessions WHERE created_at < ? OR last_seen < ?')
      .bind(ts - SESSION_MAX_SECONDS, ts - SESSION_IDLE_SECONDS),
    db.prepare('INSERT INTO admin_sessions (token_hash, username, created_at, last_seen) VALUES (?, ?, ?, ?)')
      .bind(tokenHash(token), username, ts, ts),
  ]);
  return token;
}

export async function getSession(db: D1Database, token: string | undefined | null): Promise<AdminSession | null> {
  if (!token) return null;
  const hash = tokenHash(token);
  const row = await db.prepare('SELECT username, created_at, last_seen FROM admin_sessions WHERE token_hash = ?')
    .bind(hash).first<{ username: string; created_at: number; last_seen: number }>();
  if (!row) return null;
  const ts = now();
  if (ts - row.created_at > SESSION_MAX_SECONDS || ts - row.last_seen > SESSION_IDLE_SECONDS) {
    await db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(hash).run();
    return null;
  }
  if (ts - row.last_seen >= TOUCH_INTERVAL) {
    await db.prepare('UPDATE admin_sessions SET last_seen = ? WHERE token_hash = ?').bind(ts, hash).run();
    row.last_seen = ts;
  }
  return { token, ...row };
}

export async function destroySession(db: D1Database, token: string | undefined | null): Promise<void> {
  if (token) await db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(tokenHash(token)).run();
}

/** 让某个管理员除 keepToken 之外的所有会话失效(例如改密码之后)，返回失效的个数 */
export async function destroyOtherSessions(db: D1Database, username: string, keepToken: string | null): Promise<number> {
  const result = await db.prepare('DELETE FROM admin_sessions WHERE username = ? AND token_hash != ?')
    .bind(username, keepToken ? tokenHash(keepToken) : '').run();
  return result.meta.changes;
}

export async function countOtherSessions(db: D1Database, username: string, keepToken: string): Promise<number> {
  const ts = now();
  const row = await db.prepare(
    'SELECT COUNT(*) AS n FROM admin_sessions WHERE username = ? AND token_hash != ? AND created_at >= ? AND last_seen >= ?')
    .bind(username, tokenHash(keepToken), ts - SESSION_MAX_SECONDS, ts - SESSION_IDLE_SECONDS).first<{ n: number }>();
  return row?.n || 0;
}

// ---------------------------------------------------------------------------
// 登录失败限制(key 为 IP，或带前缀的 IP，如 password:1.2.3.4)
// ---------------------------------------------------------------------------

export async function loginBlocked(db: D1Database, key: string): Promise<boolean> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE key = ? AND ts > ?')
    .bind(key, now() - LOGIN_WINDOW_SECONDS).first<{ n: number }>();
  return (row?.n || 0) >= LOGIN_MAX_FAILURES;
}

export async function recordLoginFailure(db: D1Database, key: string): Promise<void> {
  const ts = now();
  await db.batch([
    db.prepare('DELETE FROM login_failures WHERE ts <= ?').bind(ts - LOGIN_WINDOW_SECONDS),
    db.prepare('INSERT INTO login_failures (key, ts) VALUES (?, ?)').bind(key, ts),
  ]);
}

export async function clearLoginFailures(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM login_failures WHERE key = ?').bind(key).run();
}

// ---------------------------------------------------------------------------
// 管理员账号
// ---------------------------------------------------------------------------

// 用户不存在时也做一次哈希校验，避免通过响应时间判断用户名是否存在。
// 预先算好(随机密码，没有人知道)，免得第一次还要多算一次哈希，超出免费版的 CPU 时间
const DUMMY_HASH = 'pbkdf2$50000$6h1jxrB8BPhIwmddWoNpsQ==$uJBNAUkRm646mgu32Y0hMhATssVWoVla+KxfDzaKWzo=';

export async function authenticateAdmin(db: D1Database, username: string, password: string): Promise<boolean> {
  const row = await db.prepare('SELECT id, password_hash FROM admins WHERE username = ?')
    .bind(username).first<{ id: number; password_hash: string }>();
  if (!row) {
    await verifyPassword(password, DUMMY_HASH);
    return false;
  }
  const [matched, needsUpgrade] = await verifyPassword(password, row.password_hash);
  if (!matched) return false;
  const statements = [db.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?').bind(now(), row.id)];
  if (needsUpgrade) {
    statements.push(db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').bind(await hashPassword(password), row.id));
  }
  await db.batch(statements);
  return true;
}

export async function getAdmin(db: D1Database, username: string) {
  return db.prepare('SELECT id, username, created_at, last_login_at FROM admins WHERE username = ?')
    .bind(username).first<{ id: number; username: string; created_at: number; last_login_at: number | null }>();
}

/** 只校验密码，不更新登录时间(用于修改密码前确认身份) */
export async function checkPassword(db: D1Database, username: string, password: string): Promise<boolean> {
  const row = await db.prepare('SELECT password_hash FROM admins WHERE username = ?').bind(username).first<{ password_hash: string }>();
  if (!row) return false;
  return (await verifyPassword(password, row.password_hash))[0];
}

export function validateNewPassword(password: string): string {
  const value = password.trim();
  if (!value) throw new Error('新密码不能为空');
  if (value.length < MIN_PASSWORD_LENGTH) throw new Error(`新密码至少需要 ${MIN_PASSWORD_LENGTH} 位`);
  return value;
}

export async function updateAdminPassword(db: D1Database, adminId: number, newPassword: string): Promise<void> {
  const password = validateNewPassword(newPassword);
  const result = await db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').bind(await hashPassword(password), adminId).run();
  if (!result.meta.changes) throw new Error('管理员不存在');
}

export async function adminCount(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM admins').first<{ n: number }>();
  return row?.n || 0;
}

/**
 * 创建第一个管理员(只在还没有管理员时成功)；返回是否创建。
 * validate 为 false 时不检查密码长度(ADMIN_PASSWORD 是部署者自己设置的，照原样使用，与 Python 版一致)
 */
export async function createFirstAdmin(db: D1Database, username: string, password: string, validate = true): Promise<boolean> {
  const value = validate ? validateNewPassword(password) : password;
  const result = await db.prepare(
    'INSERT INTO admins (username, password_hash, created_at) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM admins)')
    .bind(username, await hashPassword(value), now()).run();
  return result.meta.changes === 1;
}

/**
 * 还没有管理员、且配置了 ADMIN_PASSWORD 时，用它创建管理员
 * @returns 是否已经检查完毕(出错时返回 false，下次再试)
 */
export async function ensureAdminFromEnv(db: D1Database, env: Env): Promise<boolean> {
  if (!env.ADMIN_PASSWORD || (await adminCount(db)) > 0) return true;
  const username = (env.ADMIN_USERNAME || 'admin').trim() || 'admin';
  try {
    if (await createFirstAdmin(db, username, env.ADMIN_PASSWORD, false)) {
      logger.warning(`已创建管理员账号 ${username}，密码取自环境变量 ADMIN_PASSWORD`);
    }
    return true;
  } catch (e) {
    logger.error(`用 ADMIN_PASSWORD 创建管理员失败: ${e}`);
    return false;
  }
}
