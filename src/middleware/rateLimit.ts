import { Context, Next } from 'hono';
import type { Env } from '../types/env';
import { CacheManager } from '../lib/cache';
import { getSystemSetting } from '../lib/config';

export async function rateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  // 优先从数据库读取限流开关
  const dbRateLimitEnabled = await getSystemSetting(c.env.DB, 'rate_limit_enabled');
  const rateLimitEnabled = dbRateLimitEnabled !== null
    ? dbRateLimitEnabled === 'true'
    : true; // 默认启用

  // 如果限流关闭，直接跳过
  if (!rateLimitEnabled) {
    return next();
  }

  // 读取限流数值（每分钟请求数）
  const dbRateLimitRequests = await getSystemSetting(c.env.DB, 'rate_limit_requests');
  const requestsPerMinute = dbRateLimitRequests !== null
    ? parseInt(dbRateLimitRequests)
    : 100; // 默认每分钟100次

  // 计算间隔时间（秒）
  const intervalSeconds = 60 / requestsPerMinute;

  const cache = new CacheManager(c.env.KV);
  const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';

  // IP 限速检查
  const ipKey = `ratelimit:ip:${clientIP}`;
  const ipLastRequest = await cache.getRateLimitTime(ipKey);

  if (ipLastRequest) {
    const elapsed = (Date.now() - ipLastRequest) / 1000;
    if (elapsed < intervalSeconds) {
      return c.json({
        code: 5,
        msg: `速率限制: 每分钟最多 ${requestsPerMinute} 次请求`,
        data: null
      }, 429);
    }
  }

  // 更新时间戳
  const now = Date.now();
  await cache.setRateLimitTime(ipKey, now, 60);

  return next();
}
