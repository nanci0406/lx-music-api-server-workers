// 后台管理 JSON 接口(/api/admin/...)。所有接口都需要管理员会话，写操作额外做来源校验并要求 JSON 请求体。

import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { bytesToBase64, tokenUrlSafe } from '../lib/crypto';
import { LoginError } from '../lib/errors';
import { isPlainObject, now } from '../lib/utils';
import * as adminAuth from '../services/admin-auth';
import * as loginSession from '../services/login-session';
import { getCachedModuleHealth, refreshIfStale, refreshModuleHealth } from '../services/module-health';
import { getStatus, runNow, taskLabel } from '../services/scheduler';
import * as stats from '../services/stats';
import * as users from '../services/users';
import { SOURCE_NAMES } from '../sources/common';
import * as qqLogin from '../sources/tx/login';
import * as wyLogin from '../sources/wy/login';
import { convert, FIELDS, publicValue, SECTIONS, ValidationError } from '../webui/config-schema';
import {
  checkSameOrigin, clientIp, currentToken, fail, isHttps, ok, readJson, requireAdmin, type AppContextC, type AppEnv,
} from './http';

const USERNAME_RE = /^[A-Za-z0-9_.@-]{1,32}$/;
const API_KEY_RE = /^[A-Za-z0-9_.~-]{6,64}$/;
const MAX_RAW_CONFIG = 512 * 1024;

const app = new Hono<AppEnv>();

function setSessionCookie(c: AppContextC, token: string): void {
  // SameSite=Strict：后台是同源的单页应用，自己发出的请求都会带上 Cookie，跨站请求一律不带
  setCookie(c, adminAuth.COOKIE_NAME, token, { httpOnly: true, sameSite: 'Strict', secure: isHttps(c), path: '/' });
}

/** 设置了 ADMIN_PASSWORD 且还没有管理员时创建管理员(每次都检查：管理员被删掉后也能用它重新创建) */
async function ensureEnvAdmin(c: AppContextC): Promise<void> {
  await adminAuth.ensureAdminFromEnv(c.get('ctx').db, c.env);
}

// ---------------------------------------------------------------------------
// 登录 / 退出 / 首次设置
// ---------------------------------------------------------------------------

app.post('/api/admin/login', async (c) => {
  checkSameOrigin(c);
  const db = c.get('ctx').db;
  await ensureEnvAdmin(c);
  const ip = clientIp(c);
  if (await adminAuth.loginBlocked(db, ip)) fail(429, '登录失败次数过多，请 15 分钟后再试');
  const data = await readJson(c);
  const username = String(data.username ?? '').trim();
  const password = String(data.password ?? '').trim();
  if (!username || !password) fail(400, '请输入用户名和密码');
  if (!(await adminAuth.authenticateAdmin(db, username, password))) {
    await adminAuth.recordLoginFailure(db, ip);
    fail(401, '用户名或密码错误');
  }
  await adminAuth.clearLoginFailures(db, ip);
  setSessionCookie(c, await adminAuth.createSession(db, username));
  return ok(c, { username });
});

app.post('/api/admin/setup', async (c) => {
  checkSameOrigin(c);
  const db = c.get('ctx').db;
  await ensureEnvAdmin(c);
  if ((await adminAuth.adminCount(db)) > 0) fail(409, '管理员账号已经存在，请直接登录');
  const data = await readJson(c);
  const username = String(data.username ?? '').trim();
  const password = String(data.password ?? '').trim();
  if (!USERNAME_RE.test(username)) fail(400, '用户名需要 1～32 位，只能包含字母、数字和 _ . @ -');
  try {
    if (!(await adminAuth.createFirstAdmin(db, username, password))) fail(409, '管理员账号已经存在，请直接登录');
  } catch (e) {
    if (e instanceof Error && !(e as any).status) fail(400, e.message);
    throw e;
  }
  setSessionCookie(c, await adminAuth.createSession(db, username));
  return ok(c, { username });
});

app.post('/api/admin/logout', async (c) => {
  checkSameOrigin(c);
  await adminAuth.destroySession(c.get('ctx').db, currentToken(c));
  deleteCookie(c, adminAuth.COOKIE_NAME, { path: '/' });
  return ok(c);
});

app.get('/api/admin/me', async (c) => {
  const db = c.get('ctx').db;
  await ensureEnvAdmin(c);
  const session = await adminAuth.getSession(db, currentToken(c));
  if (!session) {
    if ((await adminAuth.adminCount(db)) === 0) fail(401, '还没有管理员账号，请先创建', { setup_required: true });
    fail(401, '登录已过期，请重新登录');
  }
  const admin = await adminAuth.getAdmin(db, session.username);
  return ok(c, {
    username: session.username,
    last_login_at: admin?.last_login_at ?? null,
    created_at: admin?.created_at ?? null,
    session_started_at: session.created_at,
    other_sessions: await adminAuth.countOtherSessions(db, session.username, session.token),
    cookiepool: c.get('ctx').config.cookiePool,
  });
});

// ---------------------------------------------------------------------------
// 概览
// ---------------------------------------------------------------------------

async function moduleRows(c: AppContextC) {
  const ctx = c.get('ctx');
  const rows = await getCachedModuleHealth(ctx.db);
  refreshIfStale(ctx, rows);
  return rows.map((row) => ({ ...row, name: SOURCE_NAMES[row.source] || row.source }));
}

async function taskRows(c: AppContextC) {
  return (await getStatus(c.get('ctx'))).map((task) => ({ ...task, label: taskLabel(task.name) }));
}

app.get('/api/admin/overview', async (c) => {
  const session = await requireAdmin(c);
  const ctx = c.get('ctx');
  const [userList, today, week, [logs], modules, tasks] = await Promise.all([
    users.listUsers(ctx.db),
    stats.getOverview(ctx, stats.dayStart(ctx)),
    stats.getOverview(ctx, stats.dayStart(ctx, 6)),
    stats.queryLogs(ctx.db, 6),
    moduleRows(c),
    taskRows(c),
  ]);
  return ok(c, {
    username: session.username,
    uptime: null, // Workers 没有“运行时长”的概念
    last_check: Math.max(0, ...modules.map((m) => m.checked_at || 0)) || null,
    users: { total: userList.length, enabled: userList.filter((u) => u.enabled).length },
    today: today.totals,
    week: week.totals,
    daily: stats.fillDays(ctx, week.daily, 7),
    modules,
    tasks: { total: tasks.length, failing: tasks.filter((t) => t.consecutive_failures) },
    recent: logs,
    cookiepool: ctx.config.cookiePool,
    key_enabled: Boolean(ctx.config.get('security.key.enable')),
  });
});

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

function configPayload(c: AppContextC) {
  const config = c.get('ctx').config;
  return {
    sections: SECTIONS.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({ ...field, value: publicValue(field, config.get(field.key)) })),
    })),
  };
}

app.get('/api/admin/config', async (c) => {
  await requireAdmin(c);
  return ok(c, configPayload(c));
});

app.put('/api/admin/config', async (c) => {
  await requireAdmin(c, true);
  const data = await readJson(c);
  const values = data.values;
  if (!isPlainObject(values) || !Object.keys(values).length) fail(400, '没有需要保存的修改');
  const updates: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const field = FIELDS[key];
    if (!field) {
      errors[key] = '未知的配置项';
      continue;
    }
    if (field.type === 'secret' && value === null) continue; // 密钥类字段没有修改
    try {
      updates[key] = convert(field, value);
    } catch (e) {
      if (e instanceof ValidationError) errors[key] = e.message;
      else throw e;
    }
  }
  if (Object.keys(errors).length) fail(400, '有配置项填写不正确', { errors });
  if (!Object.keys(updates).length) fail(400, '没有需要保存的修改');
  await c.get('ctx').config.writeBatch(updates);
  return ok(c, { ...configPayload(c), saved: Object.keys(updates), restart_required: [], reload_error: null });
});

app.get('/api/admin/config/raw', async (c) => {
  await requireAdmin(c);
  return ok(c, { content: c.get('ctx').config.text() });
});

app.put('/api/admin/config/raw', async (c) => {
  await requireAdmin(c, true);
  const data = await readJson(c, MAX_RAW_CONFIG + 4096);
  const content = data.content;
  if (typeof content !== 'string' || !content.trim()) fail(400, '配置内容不能为空');
  if (content.length > MAX_RAW_CONFIG) fail(413, '配置内容太大');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    fail(400, `JSON 格式错误：${e instanceof Error ? e.message : e}`);
  }
  if (!isPlainObject(parsed) || !['common', 'security', 'module'].every((key) => isPlainObject((parsed as any)[key]))) {
    fail(400, '配置必须包含 common、security、module 三个部分');
  }
  await c.get('ctx').config.replace(parsed as Record<string, any>);
  return ok(c, { content: c.get('ctx').config.text(), backup: 'config_backup' });
});

// ---------------------------------------------------------------------------
// 用户
// ---------------------------------------------------------------------------

function validateKey(apiKey: string): void {
  if (!API_KEY_RE.test(apiKey)) fail(400, 'Key 需要 6～64 位，只能包含字母、数字和 _ . ~ -');
}

async function userOr404(c: AppContextC): Promise<users.User> {
  const id = Number(c.req.param('id'));
  const user = Number.isInteger(id) ? await users.getUser(c.get('ctx').db, id) : null;
  if (!user) fail(404, '用户不存在');
  return user;
}

app.get('/api/admin/users', async (c) => {
  await requireAdmin(c);
  const ctx = c.get('ctx');
  return ok(c, {
    users: await users.listUsersWithUsage(ctx.db),
    script_enabled: Boolean(ctx.config.get('common.allow_download_script')),
    key_enabled: Boolean(ctx.config.get('security.key.enable')),
  });
});

app.post('/api/admin/users', async (c) => {
  await requireAdmin(c, true);
  const db = c.get('ctx').db;
  const data = await readJson(c);
  const name = String(data.name ?? '').trim();
  const apiKey = String(data.api_key ?? '').trim() || tokenUrlSafe(18);
  if (!USERNAME_RE.test(name)) fail(400, '用户名需要 1～32 位，只能包含字母、数字和 _ . @ -');
  validateKey(apiKey);
  const taken = await users.nameOrKeyTaken(db, name, apiKey);
  if (taken) fail(409, taken === 'name' ? '用户名已存在' : '这个 Key 已被其他用户使用');
  await users.createUser(db, name, apiKey);
  const created = (await users.listUsersWithUsage(db)).find((u: any) => u.name === name);
  return ok(c, created, 201);
});

app.patch('/api/admin/users/:id', async (c) => {
  await requireAdmin(c, true);
  const user = await userOr404(c);
  const data = await readJson(c);
  if ('enabled' in data) {
    if (typeof data.enabled !== 'boolean') fail(400, 'enabled 需要布尔值');
    await users.setEnabled(c.get('ctx').db, user.id, data.enabled);
  }
  return ok(c, await users.getUser(c.get('ctx').db, user.id));
});

app.post('/api/admin/users/:id/reset-key', async (c) => {
  await requireAdmin(c, true);
  const user = await userOr404(c);
  const db = c.get('ctx').db;
  const data = await readJson(c);
  const apiKey = String(data.api_key ?? '').trim() || tokenUrlSafe(18);
  validateKey(apiKey);
  if (await users.nameOrKeyTaken(db, null, apiKey, user.id)) fail(409, '这个 Key 已被其他用户使用');
  await users.setApiKey(db, user.id, apiKey);
  return ok(c, await users.getUser(db, user.id));
});

app.delete('/api/admin/users/:id', async (c) => {
  await requireAdmin(c, true);
  const user = await userOr404(c);
  await users.deleteUser(c.get('ctx').db, user.id);
  return ok(c, { id: user.id });
});

// ---------------------------------------------------------------------------
// 统计
// ---------------------------------------------------------------------------

app.get('/api/admin/stats', async (c) => {
  await requireAdmin(c);
  const ctx = c.get('ctx');
  let days = Number.parseInt(c.req.query('days') || '7', 10);
  if (![1, 7, 30].includes(days)) days = 7;
  const data = await stats.getOverview(ctx, stats.dayStart(ctx, days - 1));
  return ok(c, {
    ...data,
    daily: stats.fillDays(ctx, data.daily, days),
    days,
    by_source: data.by_source.map((row) => ({ ...row, name: (SOURCE_NAMES as Record<string, string>)[row.source] || row.source })),
  });
});

app.get('/api/admin/stats/logs', async (c) => {
  await requireAdmin(c);
  const limit = Number.parseInt(c.req.query('limit') || '30', 10);
  const offset = Number.parseInt(c.req.query('offset') || '0', 10);
  if (Number.isNaN(limit) || Number.isNaN(offset)) fail(400, '分页参数错误');
  const result = c.req.query('result');
  const success = result === 'success' ? true : result === 'failure' ? false : null;
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const safeOffset = Math.max(0, offset);
  const [logs, total] = await stats.queryLogs(c.get('ctx').db, safeLimit, safeOffset,
    c.req.query('username') || null, c.req.query('source') || null, success);
  return ok(c, { logs, total, limit: safeLimit, offset: safeOffset });
});

// ---------------------------------------------------------------------------
// 模块状态与定时任务
// ---------------------------------------------------------------------------

app.get('/api/admin/health', async (c) => {
  await requireAdmin(c);
  return ok(c, { modules: await moduleRows(c), tasks: await taskRows(c) });
});

app.post('/api/admin/health/refresh', async (c) => {
  await requireAdmin(c, true);
  await refreshModuleHealth(c.get('ctx'), true);
  return ok(c, { modules: await moduleRows(c), tasks: await taskRows(c) });
});

app.post('/api/admin/tasks/:name/run', async (c) => {
  await requireAdmin(c, true);
  const ctx = c.get('ctx');
  const name = c.req.param('name');
  const result = await runNow(ctx, name);
  if (result === 'missing') fail(404, '任务不存在或未启用');
  if (result === 'running') fail(409, '任务正在执行中');
  ctx.waitUntil(result.done);
  return ok(c, { name });
});

// ---------------------------------------------------------------------------
// 管理员账号
// ---------------------------------------------------------------------------

app.post('/api/admin/account/password', async (c) => {
  const session = await requireAdmin(c, true);
  const db = c.get('ctx').db;
  const data = await readJson(c);
  const current = String(data.current ?? '').trim();
  const next = String(data.new ?? '').trim();
  const limitKey = 'password:' + clientIp(c);
  if (await adminAuth.loginBlocked(db, limitKey)) fail(429, '尝试次数过多，请 15 分钟后再试');
  if (!(await adminAuth.checkPassword(db, session.username, current))) {
    await adminAuth.recordLoginFailure(db, limitKey);
    fail(400, '当前密码不正确');
  }
  if (next === current) fail(400, '新密码不能和当前密码相同');
  const admin = await adminAuth.getAdmin(db, session.username);
  try {
    await adminAuth.updateAdminPassword(db, admin!.id, next);
  } catch (e) {
    fail(400, e instanceof Error ? e.message : String(e));
  }
  await adminAuth.destroyOtherSessions(db, session.username, session.token);
  return ok(c);
});

app.post('/api/admin/account/logout-others', async (c) => {
  const session = await requireAdmin(c, true);
  const closed = await adminAuth.destroyOtherSessions(c.get('ctx').db, session.username, session.token);
  return ok(c, { closed });
});

// ---------------------------------------------------------------------------
// 音乐平台登录(QQ 音乐扫码 / 验证码、网易云扫码)
// ---------------------------------------------------------------------------

/** 人机验证地址来自服务端响应，只放行 QQ / 腾讯域名下的 https 地址 */
function safeSecurityUrl(url: string | undefined): string {
  try {
    const parts = new URL(url || '');
    const host = parts.hostname.toLowerCase();
    if (parts.protocol === 'https:' && ['qq.com', 'tencent.com'].some((d) => host === d || host.endsWith('.' + d))) return url!;
  } catch {
    // 无效地址
  }
  return '';
}

function loginError(e: unknown): never {
  if (e instanceof LoginError) fail(400, e.message);
  throw e;
}

async function sessionOr404(c: AppContextC, owner: string): Promise<loginSession.LoginSession> {
  const ls = await loginSession.getSession(c.get('ctx').db, c.req.param('id')!, owner);
  if (!ls) fail(404, '登录会话不存在或已过期');
  return ls;
}

app.post('/api/admin/music-login/qr', async (c) => {
  const session = await requireAdmin(c, true);
  const ctx = c.get('ctx');
  const data = await readJson(c);
  const kind = String(data.kind ?? '');
  let started: [loginSession.LoginSession, Uint8Array, string];
  try {
    started = kind === 'wy' ? await wyLogin.startQr(ctx, session.username) : await qqLogin.startQr(ctx, kind, session.username);
  } catch (e) {
    loginError(e);
  }
  const [ls, image, mimetype] = started;
  return ok(c, { ...ls.public(), image: `data:${mimetype};base64,${bytesToBase64(image)}`, expires_in: loginSession.QR_TIMEOUT });
});

app.post('/api/admin/music-login/phone/send', async (c) => {
  await requireAdmin(c, true);
  const data = await readJson(c);
  let result: { state: string; url?: string };
  try {
    result = await qqLogin.phoneSend(c.get('ctx'), data.phone ?? '', data.country_code ?? '86');
  } catch (e) {
    loginError(e);
  }
  if ('url' in result) result.url = safeSecurityUrl(result.url);
  return ok(c, { ...result, cooldown: qqLogin.SMS_COOLDOWN });
});

app.post('/api/admin/music-login/phone/verify', async (c) => {
  const session = await requireAdmin(c, true);
  const data = await readJson(c);
  try {
    const ls = await qqLogin.phoneVerify(c.get('ctx'), session.username, data.phone ?? '', data.code ?? '', data.country_code ?? '86');
    return ok(c, ls.public());
  } catch (e) {
    loginError(e);
  }
});

app.get('/api/admin/music-login/:id', async (c) => {
  const session = await requireAdmin(c);
  const ctx = c.get('ctx');
  let ls = await sessionOr404(c, session.username);
  if (!ls.finished) {
    if (now() - ls.createdAt > loginSession.QR_TIMEOUT) {
      ls.finish('timeout', '二维码已失效');
      await loginSession.saveSession(ctx.db, ls, true);
    } else if (await loginSession.claimCheck(ctx.db, ls, ls.kind === 'wx' ? 40 : 30)) {
      // 向平台查询一次二维码状态(微信是长轮询，最多等 25 秒)
      if (ls.kind === 'wy') await wyLogin.advance(ctx, ls);
      else await qqLogin.advance(ctx, ls);
      if (!(await loginSession.saveSession(ctx.db, ls, true))) ls = await sessionOr404(c, session.username);
    }
  }
  return ok(c, ls.public());
});

app.post('/api/admin/music-login/:id/cancel', async (c) => {
  const session = await requireAdmin(c, true);
  await loginSession.cancelSession(c.get('ctx').db, c.req.param('id'), session.username);
  return ok(c);
});

app.post('/api/admin/music-login/:id/apply', async (c) => {
  const session = await requireAdmin(c, true);
  const ctx = c.get('ctx');
  const ls = await sessionOr404(c, session.username);
  const data = await readJson(c);
  const platformLogin = ls.platform === 'wy' ? wyLogin : qqLogin;
  try {
    const note = await platformLogin.applyCredential(ctx, ls, String(data.target ?? ''), Boolean(data.enable_refresh));
    return ok(c, { note, reload_error: null });
  } catch (e) {
    loginError(e);
  }
});

export default app;
