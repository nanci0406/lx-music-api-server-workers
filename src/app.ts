// HTTP 入口：全局中间件(封禁、限速、Host 白名单)、各组路由、错误处理

import { Hono } from 'hono';
import { Config, type ConfigRow } from './config/config';
import { createContext } from './lib/context';
import { ensureSchema } from './lib/db';
import { HttpError } from './lib/errors';
import { log } from './lib/log';
import adminApi from './routes/admin-api';
import api from './routes/api';
import { handleGcsp } from './routes/gcsp';
import { addSecurityHeaders, clientIp, requestHost, type AppEnv } from './routes/http';
import publicApi from './routes/public-api';
import webui from './routes/webui';
import { banIp, banStatement, checkRateLimit, isBannedRow } from './services/security';

const logger = log('main');

/** Web 界面的页面、静态文件和后台接口(首页的在线解析仍然算作解析请求，照常限速) */
export function isWebuiRequest(path: string): boolean {
  return path === '/' || ['/static/', '/admin', '/api/admin/', '/api/public/status'].some((prefix) => path.startsWith(prefix));
}

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const db = c.env.DB;
  await ensureSchema(db);
  const ip = clientIp(c);
  // 配置和 IP 封禁记录一次查出来
  const [configRes, banRes] = await db.batch([
    db.prepare("SELECT value, version FROM kv WHERE key = 'config'"),
    banStatement(db, ip),
  ]);
  const row = (configRes.results[0] as ConfigRow | undefined) || null;
  const config = row ? Config.fromRow(db, row) : await Config.load(db);
  const ctx = createContext(c.env, config, (promise) => c.executionCtx.waitUntil(promise));
  c.set('ctx', ctx);
  c.set('ip', ip);

  if (config.get('security.banlist.enable') && isBannedRow(banRes.results[0] as any)) {
    return c.json({ code: 1, msg: '您的IP已被封禁', data: null }, 403);
  }
  // 限速只针对解析接口：Web 界面打开一次页面就要加载多个文件、调用多个接口
  if (!isWebuiRequest(c.req.path)) {
    const limited = await checkRateLimit(ctx, ip);
    if (limited) return c.json({ code: 5, msg: limited, data: null }, 429);
  }
  if (config.get('security.allowed_host.enable')) {
    const host = requestHost(c).split(':')[0];
    if (!(config.get('security.allowed_host.list') || []).includes(host)) {
      if (config.get('security.allowed_host.blacklist.enable')) {
        await banIp(ctx, ip, Number(config.get('security.allowed_host.blacklist.length')) || 0, `访问了不允许的 Host: ${host}`);
      }
      return c.json({ code: 6, msg: '未找到您所请求的资源', data: null }, 404);
    }
  }
  if (config.get('module.gcsp.enable') && c.req.path === config.get('module.gcsp.path')) {
    return handleGcsp(ctx, c.req.raw);
  }
  await next();
  addSecurityHeaders(c);
});

// 后台和首页接口先注册，避免被 /{method}/{source}/{songId} 这样的解析路由匹配到
app.route('/', adminApi);
app.route('/', publicApi);
app.route('/', webui);
app.route('/', api);

app.notFound((c) => c.json({ code: 6, msg: '未找到您所请求的资源', data: null }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    const res = c.json({ code: err.status, msg: err.message, data: err.data ?? null }, err.status as any);
    addSecurityHeaders(c);
    return res;
  }
  logger.error(`${c.req.method} ${c.req.path} 出错: ${err instanceof Error && err.stack ? err.stack : err}`);
  return c.json({ code: 4, msg: '内部服务器错误', data: null }, 500);
});

export default app;
