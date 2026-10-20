// 解析接口：/{method}/{source}/{songId}/{quality}、/script 音源脚本

import { Hono } from 'hono';
import { parseCacheRow } from '../lib/cache';
import { log } from '../lib/log';
import { errorMessage } from '../lib/utils';
import { buildScript, updateInfo } from '../services/script';
import { recordParse } from '../services/stats';
import { getUserByKey, touchUserStatement, userByNameAndKeyStatement, type User } from '../services/users';
import { dispatch, isSupportedSource, urlCacheKey } from '../sources';
import { baseUrl, type AppContextC, type AppEnv } from './http';

const logger = log('main');

const app = new Hono<AppEnv>();

// 解析接口允许跨域调用(网页版播放器等)，与旧版 Workers 的行为保持一致
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'X-Request-User, X-Request-Key, Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(c: AppContextC, body: unknown, status = 200) {
  return c.json(body, status as any, CORS_HEADERS);
}

async function handle(c: AppContextC) {
  const { method, source, songId } = c.req.param() as Record<string, string>;
  const quality = c.req.param('quality');
  const ctx = c.get('ctx');
  const ip = c.get('ip');

  // 先于其他检查：未知(或已下线)的平台不应该在配置里被当作 module.<名字> 去查找
  if (!isSupportedSource(source)) return json(c, { code: 1, msg: '未知的源或不支持的方法', data: null });

  // 用户校验和播放链接缓存放在一次数据库往返里查询
  const statements: D1PreparedStatement[] = [];
  const keyEnabled = Boolean(ctx.config.get('security.key.enable'));
  if (keyEnabled) {
    const requestUser = c.req.header('X-Request-User');
    const requestKey = c.req.header('X-Request-Key');
    if (!requestUser || !requestKey) return json(c, { code: 6, msg: '缺少用户名或 key', data: null }, 403);
    statements.push(userByNameAndKeyStatement(ctx.db, requestUser, requestKey));
  }
  const cacheKey = method === 'url' && quality ? urlCacheKey(source, songId, quality) : '';
  if (cacheKey) statements.push(ctx.db.prepare('SELECT data, expire_at FROM cache WHERE key = ?').bind(cacheKey));
  const results = statements.length ? await ctx.db.batch(statements) : [];

  let user: User | null = null;
  if (keyEnabled) {
    user = (results[0].results[0] as User | undefined) || null;
    if (!user || !user.enabled) {
      logger.warning(`用户验证失败 - 用户名: ${c.req.header('X-Request-User')} 不存在、已禁用或 key 不匹配`);
      return json(c, { code: 6, msg: 'key验证失败', data: null }, 403);
    }
  }
  const cachedUrl = cacheKey ? parseCacheRow<any>((results[keyEnabled ? 1 : 0].results[0] as any) || null) : undefined;
  const extra = user ? [touchUserStatement(ctx.db, user.id)] : [];

  // 关闭了的平台对所有方法都不再提供服务
  if (!ctx.config.get(`module.${source}.enable`)) {
    recordParse(ctx, user, source, method, songId, quality, false, '此平台已停止服务', ip, extra);
    return json(c, { code: 4, msg: '此平台已停止服务', data: null, 'Your IP': ip }, 404);
  }
  try {
    const result = await dispatch(ctx, method, source, songId, quality, new URL(c.req.url).searchParams, cachedUrl);
    // 平台用 code 表示结果(如获取失败时返回 code 2 和原因)，不能只要没抛异常就记为成功
    const success = result.code === 0;
    recordParse(ctx, user, source, method, songId, quality, success, success ? null : String(result.msg || '解析失败'), ip, extra);
    return json(c, result);
  } catch (e) {
    recordParse(ctx, user, source, method, songId, quality, false, errorMessage(e), ip, extra);
    logger.error(`${method}/${source}/${songId} 出错: ${e instanceof Error && e.stack ? e.stack : e}`);
    return json(c, { code: 4, msg: '内部服务器错误', data: null }, 500);
  }
}

app.options('/:method/:source/:songId/:quality?', (c) => c.body(null, 204, CORS_HEADERS));
app.get('/:method/:source/:songId/:quality', handle);
app.get('/:method/:source/:songId', handle);

app.get('/script', async (c) => {
  const ctx = c.get('ctx');
  if (!ctx.config.get('common.allow_download_script')) {
    return c.json({ code: 6, msg: '未找到您所请求的资源', data: null }, 404);
  }
  const requestKey = c.req.query('key');
  if (!requestKey) return c.json({ code: 6, msg: 'key验证失败', data: null }, 403);
  const user = await getUserByKey(ctx.db, requestKey);
  if (!user) {
    logger.warning('脚本下载验证失败：未找到对应的用户或用户已禁用');
    return c.json({ code: 6, msg: 'key验证失败', data: null }, 403);
  }
  const base = baseUrl(c);
  const { script, md5, filename } = buildScript(ctx, base, user.name, requestKey);
  const checkUpdate = c.req.query('checkUpdate');
  if (ctx.config.get('common.download_config.update') && checkUpdate) {
    return c.json({ code: 0, msg: 'success', data: updateInfo(ctx, base, requestKey, checkUpdate, md5) });
  }
  return c.body(script, 200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
});

export default app;
