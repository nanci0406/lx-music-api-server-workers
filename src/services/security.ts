// IP 封禁与限速

import type { AppContext } from '../lib/context';
import { log } from '../lib/log';
import { now } from '../lib/utils';

const logger = log('security');

export function banStatement(db: D1Database, ip: string): D1PreparedStatement {
  return db.prepare('SELECT expire_time FROM banned_ips WHERE ip = ?').bind(ip);
}

/** 根据 banned_ips 里的记录判断是否仍在封禁中(expire_time 为 NULL 表示永久) */
export function isBannedRow(row: { expire_time: number | null } | undefined | null): boolean {
  if (!row) return false;
  return row.expire_time === null || row.expire_time === undefined || row.expire_time > now();
}

/**
 * 封禁 IP
 * @param banTime 封禁时长(秒)，-1 表示使用配置里的 security.banlist.expire.length；
 *                时长 <= 0 或关闭了 security.banlist.expire.enable 时为永久封禁
 */
export async function banIp(ctx: AppContext, ip: string, banTime = -1, reason = ''): Promise<void> {
  if (!ctx.config.get('security.banlist.enable')) {
    logger.warning('黑名单功能已被关闭，建议开启这个功能以防止恶意请求');
    return;
  }
  const length = Math.floor(Number(banTime === -1 ? ctx.config.get('security.banlist.expire.length') : banTime) || 0);
  const expire = Boolean(ctx.config.get('security.banlist.expire.enable')) && length > 0;
  await ctx.db.prepare(`INSERT INTO banned_ips (ip, expire_time, reason, created_at) VALUES (?, ?, ?, ?)
                        ON CONFLICT(ip) DO UPDATE SET expire_time = excluded.expire_time, reason = excluded.reason,
                          created_at = excluded.created_at`)
    .bind(ip, expire ? now() + length : null, reason || null, now()).run();
}

/** 删除已到期的封禁记录 */
export async function cleanupBans(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM banned_ips WHERE expire_time IS NOT NULL AND expire_time <= ?').bind(now()).run();
}

/**
 * 解析接口限速：全局 / 单个 IP 两次请求之间的最小间隔(秒)。
 * 用一条“只有超过间隔才更新”的语句同时完成检查和记录，并发请求也不会一起通过。
 * @returns 被限速时返回提示，否则返回 null
 */
export async function checkRateLimit(ctx: AppContext, ip: string): Promise<string | null> {
  const limits: [string, number, string][] = [
    ['global', Number(ctx.config.get('security.rate_limit.global')) || 0, '全局限速'],
    [`ip:${ip}`, Number(ctx.config.get('security.rate_limit.ip')) || 0, 'IP限速'],
  ];
  for (const [key, interval, message] of limits) {
    if (interval <= 0) continue;
    const ts = Date.now() / 1000;
    const result = await ctx.db.prepare(`INSERT INTO request_times (key, ts) VALUES (?1, ?2)
                                         ON CONFLICT(key) DO UPDATE SET ts = excluded.ts WHERE request_times.ts <= ?3`)
      .bind(key, ts, ts - interval).run();
    if (!result.meta.changes) return message;
  }
  return null;
}
