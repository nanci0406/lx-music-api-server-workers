// 后台扫码 / 验证码登录的会话(QQ 音乐、网易云共用)。
//
// Python 版把会话放在内存里，由后台任务轮询二维码状态；Workers 没有常驻的后台任务，
// 会话保存在 D1 里，前端每次查询状态时顺带向平台查询一次二维码状态(同一时刻只有一个请求在查)。
// 会话归发起登录的管理员所有；登录得到的凭证在点击“保存”之前不会写入配置，最多保留 RESULT_TTL 秒。

import { LoginError } from '../lib/errors';
import { tokenUrlSafe } from '../lib/crypto';
import { now } from '../lib/utils';

export const QR_TIMEOUT = 180; // 二维码有效时间，超时后会话结束
export const RESULT_TTL = 600; // 登录完成后凭证最多保留多久
export const MAX_ACTIVE_SESSIONS = 5; // 同时进行中的扫码登录上限

export type LoginKind = 'qq' | 'wx' | 'phone' | 'wy';
export type LoginState = 'scan' | 'conf' | 'done' | 'timeout' | 'refuse' | 'error' | 'cancelled' | 'applied';

interface Row {
  id: string;
  owner: string;
  kind: LoginKind;
  state: LoginState;
  message: string;
  data: string | null;
  credential: string | null;
  created_at: number;
  finished_at: number | null;
  checking_until: number;
}

export class LoginSession {
  id: string;
  kind: LoginKind;
  owner: string;
  createdAt: number;
  finishedAt: number | null = null;
  state: LoginState = 'scan';
  message = '';
  /** 轮询需要的数据(二维码标识、设备信息等)，只在服务端使用 */
  data: Record<string, any> = {};
  credential: Record<string, any> | null = null;

  constructor(kind: LoginKind, owner: string, id?: string, createdAt?: number) {
    this.id = id || tokenUrlSafe(16);
    this.kind = kind;
    this.owner = owner;
    this.createdAt = createdAt ?? now();
  }

  static fromRow(row: Row): LoginSession {
    const ls = new LoginSession(row.kind, row.owner, row.id, row.created_at);
    ls.state = row.state;
    ls.message = row.message || '';
    ls.finishedAt = row.finished_at;
    ls.data = row.data ? JSON.parse(row.data) : {};
    ls.credential = row.credential ? JSON.parse(row.credential) : null;
    return ls;
  }

  get platform(): 'tx' | 'wy' {
    return this.kind === 'wy' ? 'wy' : 'tx';
  }

  get finished(): boolean {
    return this.state !== 'scan' && this.state !== 'conf';
  }

  finish(state: LoginState, message = ''): void {
    this.state = state;
    this.message = message;
    this.finishedAt = now();
  }

  /** 给前端看的状态：不包含凭证本身 */
  public(): Record<string, unknown> {
    const info: Record<string, unknown> = {
      id: this.id, kind: this.kind, platform: this.platform, state: this.state, message: this.message,
    };
    if (this.credential) {
      const credential = this.credential;
      let hasRefresh = credential.has_refresh;
      if (hasRefresh === undefined || hasRefresh === null) hasRefresh = Boolean(credential.refresh_key || credential.refresh_token);
      info.account = { uin: credential.uin, nick: credential.nick || '', has_refresh: Boolean(hasRefresh) };
    }
    return info;
  }
}

/** 清理超时的会话：扫码阶段最多 QR_TIMEOUT，完成后凭证最多保留 RESULT_TTL */
export async function purge(db: D1Database, ts = now()): Promise<void> {
  await db
    .prepare('DELETE FROM login_sessions WHERE created_at < ? OR (finished_at IS NOT NULL AND finished_at < ?)')
    .bind(ts - QR_TIMEOUT - RESULT_TTL, ts - RESULT_TTL)
    .run();
}

export async function ensureCapacity(db: D1Database): Promise<void> {
  await purge(db);
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM login_sessions WHERE state IN ('scan', 'conf') AND created_at >= ?")
    .bind(now() - QR_TIMEOUT)
    .first<{ n: number }>();
  if ((row?.n || 0) >= MAX_ACTIVE_SESSIONS) throw new LoginError('同时进行的扫码登录太多，请稍后再试');
}

/**
 * 保存会话。onlyIfActive 为 true 时只在会话仍处于扫码阶段时写入
 * (查询二维码状态期间会话可能已被取消，查询结果不能把“已取消”覆盖掉)
 */
export async function saveSession(db: D1Database, ls: LoginSession, onlyIfActive = false): Promise<boolean> {
  const result = await db
    .prepare(`INSERT INTO login_sessions (id, owner, kind, state, message, data, credential, created_at, finished_at, checking_until)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
              ON CONFLICT(id) DO UPDATE SET state = excluded.state, message = excluded.message, data = excluded.data,
                credential = excluded.credential, finished_at = excluded.finished_at, checking_until = 0
              ${onlyIfActive ? "WHERE login_sessions.state IN ('scan', 'conf')" : ''}`)
    .bind(ls.id, ls.owner, ls.kind, ls.state, ls.message, JSON.stringify(ls.data),
      ls.credential ? JSON.stringify(ls.credential) : null, ls.createdAt, ls.finishedAt)
    .run();
  return result.meta.changes > 0;
}

export async function getSession(db: D1Database, id: string, owner: string): Promise<LoginSession | null> {
  await purge(db);
  const row = await db.prepare('SELECT * FROM login_sessions WHERE id = ?').bind(id).first<Row>();
  if (!row || row.owner !== owner) return null;
  return LoginSession.fromRow(row);
}

/** 抢占“正在查询二维码状态”的标记；别的请求正在查询时返回 false */
export async function claimCheck(db: D1Database, ls: LoginSession, seconds: number): Promise<boolean> {
  const ts = now();
  const result = await db
    .prepare("UPDATE login_sessions SET checking_until = ? WHERE id = ? AND checking_until <= ? AND state IN ('scan', 'conf')")
    .bind(ts + seconds, ls.id, ts)
    .run();
  return result.meta.changes === 1;
}

export async function cancelSession(db: D1Database, id: string, owner: string): Promise<boolean> {
  const ls = await getSession(db, id, owner);
  if (!ls) return false;
  if (!ls.finished) {
    ls.finish('cancelled', '已取消');
    await saveSession(db, ls, true);
  }
  return true;
}
