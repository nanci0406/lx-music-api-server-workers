// 解析统计

import type { AppContext } from '../lib/context';
import { tzOffset } from '../lib/context';
import { log } from '../lib/log';
import { now } from '../lib/utils';

const logger = log('stats_service');

export interface ParseUser {
  id: number;
  name: string;
}

export function recordParseStatement(
  db: D1Database, user: ParseUser | null, source: string, method: string, songId: string | null,
  quality: string | null, success: boolean, error: string | null, clientIp: string,
): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO parse_logs (user_id, username, source, method, song_id, quality, success, error_message, client_ip, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(user ? user.id : null, user ? user.name : null, source, method, songId, quality ?? null,
      success ? 1 : 0, error ? error.slice(0, 500) : null, clientIp, now());
}

/** 记录一次解析(在响应返回后写入)；统计写失败不能影响接口本身的返回 */
export function recordParse(
  ctx: AppContext, user: ParseUser | null, source: string, method: string, songId: string | null,
  quality: string | null | undefined, success: boolean, error: string | null, clientIp: string,
  extra: D1PreparedStatement[] = [],
): void {
  const statements = [recordParseStatement(ctx.db, user, source, method, songId, quality ?? null, success, error, clientIp), ...extra];
  ctx.waitUntil(ctx.db.batch(statements).catch((e) => logger.warning(`写入解析统计失败: ${e}`)));
}

/** 删除 retentionDays 天之前的解析记录，返回删除条数 */
export async function cleanupOldLogs(db: D1Database, retentionDays: number): Promise<number> {
  const cutoff = now() - Math.floor(retentionDays) * 86400;
  const result = await db.prepare('DELETE FROM parse_logs WHERE created_at < ?').bind(cutoff).run();
  return result.meta.changes;
}

export async function cleanupTask(ctx: AppContext): Promise<void> {
  const days = Number(ctx.config.get('common.parse_log_retention_days'));
  if (!days || days <= 0) return;
  const deleted = await cleanupOldLogs(ctx.db, days);
  if (deleted) logger.info(`已清理 ${deleted} 条超过 ${days} 天的解析记录`);
}

function filters(since?: number | null, username?: string | null, source?: string | null, success?: boolean | null): [string, unknown[]] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (since !== undefined && since !== null) {
    clauses.push('created_at >= ?');
    params.push(Math.floor(since));
  }
  if (username) {
    clauses.push('username = ?');
    params.push(username);
  }
  if (source) {
    clauses.push('source = ?');
    params.push(source);
  }
  if (success !== undefined && success !== null) {
    clauses.push('success = ?');
    params.push(success ? 1 : 0);
  }
  return [clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params];
}

/** since 时间戳之后的统计：总数 / 成功 / 失败 / 活跃用户、按天、按平台、按用户 */
export async function getOverview(ctx: AppContext, since: number) {
  const [where, params] = filters(since);
  const offset = Math.round(tzOffset(ctx) * 3600);
  const db = ctx.db;
  const [totalsRes, dailyRes, sourceRes, userRes] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS success,
                       COUNT(DISTINCT username) AS users
                FROM parse_logs${where}`).bind(...params),
    db.prepare(`SELECT strftime('%Y-%m-%d', created_at + ?, 'unixepoch') AS day,
                       COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS success
                FROM parse_logs${where} GROUP BY day ORDER BY day ASC`).bind(offset, ...params),
    db.prepare(`SELECT source, COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS success
                FROM parse_logs${where} GROUP BY source ORDER BY total DESC`).bind(...params),
    db.prepare(`SELECT COALESCE(username, '') AS username, COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) AS success,
                       MAX(created_at) AS last_at
                FROM parse_logs${where} GROUP BY username ORDER BY total DESC LIMIT 50`).bind(...params),
  ]);
  const totals = (totalsRes.results[0] || { total: 0, success: 0, users: 0 }) as Record<string, number>;
  return {
    totals: { ...totals, failure: totals.total - totals.success },
    daily: dailyRes.results as { day: string; total: number; success: number }[],
    by_source: sourceRes.results as Record<string, any>[],
    by_user: userRes.results as Record<string, any>[],
  };
}

/** 分页查询解析记录，返回 [记录, 总数] */
export async function queryLogs(
  db: D1Database, limit = 50, offset = 0, username?: string | null, source?: string | null, success?: boolean | null,
): Promise<[Record<string, unknown>[], number]> {
  const [where, params] = filters(null, username, source, success);
  const [countRes, rowsRes] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM parse_logs${where}`).bind(...params),
    db.prepare(`SELECT id, username, source, method, song_id, quality, success, error_message, client_ip, created_at
                FROM parse_logs${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .bind(...params, Math.floor(limit), Math.floor(offset)),
  ]);
  return [rowsRes.results as Record<string, unknown>[], Number((countRes.results[0] as any)?.n || 0)];
}

/** 本地时间(按配置的时区)daysAgo 天前的 0 点 */
export function dayStart(ctx: AppContext, daysAgo = 0): number {
  const offset = Math.round(tzOffset(ctx) * 3600);
  const local = now() + offset;
  return local - (local % 86400) - daysAgo * 86400 - offset;
}

/** 把按天统计补全成连续的 days 天(没有记录的日子记为 0)，方便画图 */
export function fillDays(ctx: AppContext, daily: { day: string; total: number; success: number }[], days: number) {
  const byDay = new Map(daily.map((row) => [row.day, row]));
  const offset = Math.round(tzOffset(ctx) * 3600);
  const result: { day: string; total: number; success: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date((dayStart(ctx, i) + offset) * 1000).toISOString().slice(0, 10);
    const row = byDay.get(day);
    result.push({ day, total: row ? Number(row.total) : 0, success: row ? Number(row.success) : 0 });
  }
  return result;
}
