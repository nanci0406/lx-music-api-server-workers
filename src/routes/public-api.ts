// 公开首页使用的接口(/api/public/...)：服务状态、在线解析下载链接

import { Hono } from 'hono';
import * as adminAuth from '../services/admin-auth';
import { getCachedModuleHealth, refreshIfStale } from '../services/module-health';
import * as stats from '../services/stats';
import * as users from '../services/users';
import { isSupportedSource, QUALITY_OPTIONS, SOURCE_NAMES, SUPPORTED_SOURCES, url as resolveUrl } from '../sources';
import { fail, ok, readJson, type AppEnv } from './http';

const SONG_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const SOURCE_ORDER = ['tx', 'kg', 'wy'];

const app = new Hono<AppEnv>();

app.get('/api/public/status', async (c) => {
  const ctx = c.get('ctx');
  const rows = await getCachedModuleHealth(ctx.db);
  refreshIfStale(ctx, rows);
  const modules = rows
    .filter((row) => row.status !== 'disabled')
    .map((row) => ({
      source: row.source,
      name: SOURCE_NAMES[row.source] || row.source,
      status: row.status,
      detail: row.detail, // 只是笼统描述，具体账号信息在 admin_detail 里，不对外
      checked_at: row.checked_at,
    }))
    .sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source));
  const sources = SUPPORTED_SOURCES
    .filter((source) => ctx.config.get(`module.${source}.enable`))
    .sort((a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b))
    .map((source) => ({ id: source, name: SOURCE_NAMES[source], qualities: QUALITY_OPTIONS[source] }));
  return ok(c, {
    modules,
    sources,
    key_required: Boolean(ctx.config.get('security.key.enable')),
    script_enabled: Boolean(ctx.config.get('common.allow_download_script')),
  });
});

/** 首页的在线解析：用用户名和 Key 换取一首歌的下载链接 */
app.post('/api/public/resolve', async (c) => {
  const ctx = c.get('ctx');
  const data = await readJson(c);
  const ip = c.get('ip');
  const limitKey = 'resolve:' + ip;
  if (await adminAuth.loginBlocked(ctx.db, limitKey)) fail(429, '验证失败次数过多，请 15 分钟后再试');

  const source = String(data.source ?? '');
  const songId = String(data.song_id ?? '').trim();
  const quality = String(data.quality ?? '');
  if (!isSupportedSource(source) || !ctx.config.get(`module.${source}.enable`)) fail(400, '不支持的平台');
  if (!QUALITY_OPTIONS[source].includes(quality)) fail(400, '不支持的音质');
  if (!SONG_ID_RE.test(songId)) fail(400, '歌曲 ID 格式不正确');

  let user: users.User | null = null;
  if (ctx.config.get('security.key.enable')) {
    const username = String(data.username ?? '').trim();
    const apiKey = String(data.key ?? '').trim();
    if (!username || !apiKey) fail(400, '请输入用户名和 Key');
    user = await users.getUserByNameAndKey(ctx.db, username, apiKey);
    if (!user) {
      await adminAuth.recordLoginFailure(ctx.db, limitKey);
      fail(403, '用户名或 Key 不正确，或用户已被停用');
    }
  }

  let result;
  try {
    result = await resolveUrl(ctx, source, songId, quality);
  } catch {
    stats.recordParse(ctx, user, source, 'url', songId, quality, false, '内部错误', ip);
    fail(400, '解析失败，请稍后再试');
  }
  if (result.code !== 0 || !result.data) {
    const message = result.msg || '解析失败';
    stats.recordParse(ctx, user, source, 'url', songId, quality, false, message, ip);
    fail(400, message);
  }
  stats.recordParse(ctx, user, source, 'url', songId, quality, true, null, ip);
  const extra = (result.extra || {}) as Record<string, any>;
  return ok(c, {
    url: result.data,
    quality: extra.quality?.result || quality,
    cached: Boolean(extra.cache),
    expire_at: extra.expire?.time ?? null,
  });
});

export default app;
