// 缓存(D1 的 cache 表)：解析得到的播放链接、歌词、平台接口的响应。
// 过期的记录读取时视为不存在，每小时由定时任务清理一次。

import { now } from './utils';
import { log } from './log';

const logger = log('cache');

export async function getCache<T>(db: D1Database, key: string): Promise<T | null> {
  try {
    const row = await db
      .prepare('SELECT data, expire_at FROM cache WHERE key = ?')
      .bind(key)
      .first<{ data: string; expire_at: number | null }>();
    return parseCacheRow<T>(row);
  } catch (e) {
    logger.warning(`读取缓存失败: ${e}`);
    return null;
  }
}

export function parseCacheRow<T>(row: { data: string; expire_at: number | null } | null): T | null {
  if (!row) return null;
  if (row.expire_at !== null && row.expire_at !== undefined && row.expire_at <= now()) return null;
  try {
    return JSON.parse(row.data) as T;
  } catch {
    return null;
  }
}

export function cacheStatement(db: D1Database, key: string, data: unknown, ttl: number | null): D1PreparedStatement {
  return db
    .prepare('INSERT INTO cache (key, data, expire_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET data = excluded.data, expire_at = excluded.expire_at')
    .bind(key, JSON.stringify(data), ttl === null ? null : now() + Math.max(1, Math.floor(ttl)));
}

/** 写入缓存；ttl 为秒，null 表示不过期 */
export async function setCache(db: D1Database, key: string, data: unknown, ttl: number | null): Promise<void> {
  try {
    await cacheStatement(db, key, data, ttl).run();
  } catch (e) {
    logger.warning(`写入缓存失败: ${e}`);
  }
}

export async function cleanupExpiredCache(db: D1Database): Promise<number> {
  const result = await db.prepare('DELETE FROM cache WHERE expire_at IS NOT NULL AND expire_at <= ?').bind(now()).run();
  return result.meta.changes;
}
