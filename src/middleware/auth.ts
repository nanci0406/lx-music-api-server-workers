import { Context, Next } from 'hono';
import type { Env } from '../types/env';
import { DatabaseQueries } from '../db/queries';
import { getSystemSetting } from '../lib/config';

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: any }>, next: Next) {
  // 优先从数据库读取认证开关，环境变量作为备用
  const dbAuthEnabled = await getSystemSetting(c.env.DB, 'auth_enabled');
  const authEnabled = dbAuthEnabled !== null
    ? dbAuthEnabled === 'true'
    : c.env.AUTH_ENABLED === 'true';

  if (!authEnabled) {
    return next();
  }

  // 获取请求头
  const username = c.req.header('X-Request-User');
  const apiKey = c.req.header('X-Request-Key');

  if (!username || !apiKey) {
    return c.json({
      code: 6,
      msg: '缺少用户名或 key',
      data: null
    }, 403);
  }

  // 查询数据库
  const db = new DatabaseQueries(c.env.DB);
  const user = await db.getUserByCredentials(username, apiKey);

  if (!user) {
    return c.json({
      code: 6,
      msg: 'key验证失败',
      data: null
    }, 403);
  }

  // 更新最后使用时间
  await db.updateUserLastUsed(user.id);

  // 存储用户信息到上下文
  c.set('user', user);

  return next();
}
