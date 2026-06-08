import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../types/env';
import { requireAdmin, authenticateAdmin, createSession, destroySession } from './auth';
import { DatabaseQueries } from '../db/queries';
import { loginPage, loginErrorPage, dashboardPage, usersPage, statsPage, configPage, healthPage } from './python-templates';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  resetApiKey,
  getUserStats
} from '../routes/admin/users';
import {
  getSourceConfigs,
  updateSourceConfig,
  batchUpdateSourceConfigs,
  getSystemSettings,
  updateSystemSetting
} from '../routes/admin/config';

type Variables = {
  user?: any;
  admin?: any;
  username?: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// 登录页面
app.get('/admin/login', (c) => {
  return c.html(loginPage());
});

// 处理登录
app.post('/admin/login', async (c) => {
  const body = await c.req.parseBody();
  const username = body.username as string;
  const password = body.password as string;

  if (!username || !password) {
    return c.html(loginErrorPage('用户名或密码不能为空'));
  }

  const isValid = await authenticateAdmin(username, password, c.env);

  if (!isValid) {
    return c.html(loginErrorPage('用户名或密码错误'));
  }

  // 创建会话
  const token = await createSession(c, username);

  setCookie(c, 'lx_admin_session', token, {
    maxAge: 86400,
    path: '/',
    httpOnly: true,
    secure: false,  // 本地开发改为 false
    sameSite: 'Lax'
  });

  return c.redirect('/admin');
});

// 登出
app.get('/admin/logout', async (c) => {
  const sessionToken = c.req.header('cookie')?.match(/lx_admin_session=([^;]+)/)?.[1];
  if (sessionToken) {
    await destroySession(c, sessionToken);
  }

  deleteCookie(c, 'lx_admin_session');
  return c.redirect('/admin/login');
});

// 仪表盘
app.get('/admin', requireAdmin, async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  const [users, logs, health] = await Promise.all([
    db.listUsers(10),
    db.getRecentLogs(10),
    db.getAllModuleHealth()
  ]);

  // 获取管理员用户名
  const admin = c.get('admin');
  const username = admin?.username || 'admin';

  // 计算统计摘要
  const summary = logs.map((log: any) => ({
    username: log.username || '-',
    total: 1,
    success_count: log.success ? 1 : 0,
    failure_count: log.success ? 0 : 1
  }));

  // 计算启用的音源数量（只计算有配置信息的音源）
  // 每个音源至少需要有一个配置项才算"已配置"
  const enabledSourcesResult = await c.env.DB
    .prepare(`
      SELECT source, COUNT(*) as config_count
      FROM source_configs
      WHERE enabled = 1
      GROUP BY source
    `)
    .all();

  // 过滤掉没有配置的音源（config_count > 0）
  const activeModules = enabledSourcesResult.results.filter((r: any) => r.config_count > 0).length;

  return c.html(dashboardPage({ username, users, health, summary, activeModules }));
});

// 用户管理
app.get('/admin/users', requireAdmin, async (c) => {
  return c.html(usersPage());
});

// 创建用户
app.post('/admin/users/create', requireAdmin, async (c) => {
  const body = await c.req.parseBody();
  const name = body.name as string;
  const apiKey = body.api_key as string;

  if (!name || !apiKey) {
    return c.json({ code: 6, msg: '参数缺失' }, 400);
  }

  const db = new DatabaseQueries(c.env.DB);
  await db.createUser(name, apiKey);

  return c.json({ code: 0, msg: '创建成功' });
});

// 删除用户
app.post('/admin/users/delete', requireAdmin, async (c) => {
  const body = await c.req.parseBody();
  const userId = parseInt(body.user_id as string);

  if (!userId) {
    return c.json({ code: 6, msg: '参数缺失' }, 400);
  }

  const db = new DatabaseQueries(c.env.DB);
  await db.deleteUser(userId);

  return c.json({ code: 0, msg: '删除成功' });
});

// 统计页面
app.get('/admin/stats', requireAdmin, async (c) => {
  const db = new DatabaseQueries(c.env.DB);
  const logs = await db.getRecentLogs(100);

  return c.html(statsPage(logs));
});

// 模块健康状态
app.get('/admin/health', requireAdmin, async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  // 获取管理员用户名
  const admin = c.get('admin');
  const username = admin?.username || 'admin';

  // 从 source_configs 实时查询音源状态
  const configResult = await c.env.DB
    .prepare(`
      SELECT
        source,
        COUNT(*) as config_count,
        MAX(enabled) as enabled,
        MAX(updated_at) as last_updated
      FROM source_configs
      GROUP BY source
    `)
    .all();

  // 所有支持的音源
  const allSources = ['kg', 'kw', 'tx', 'wy', 'mg'];

  // 构建健康状态数据
  const health = allSources.map(source => {
    const config = configResult.results.find((r: any) => r.source === source);

    let status = 'disabled';
    let detail = '未配置';
    let checked_at = 0;

    if (config && config.config_count > 0) {
      if (config.enabled === 1) {
        status = 'healthy';
        detail = `已配置 ${config.config_count} 项`;
        checked_at = config.last_updated || 0;
      } else {
        status = 'disabled';
        detail = '已禁用';
        checked_at = config.last_updated || 0;
      }
    }

    return {
      source,
      status,
      detail,
      checked_at
    };
  });

  return c.html(healthPage({ username, health }));
});

// ============================================
// API 路由 - 用户管理
// ============================================

app.get('/admin/api/users', requireAdmin, getUsers);
app.post('/admin/api/users', requireAdmin, createUser);
app.put('/admin/api/users/:id', requireAdmin, updateUser);
app.delete('/admin/api/users/:id', requireAdmin, deleteUser);
app.post('/admin/api/users/:id/reset-key', requireAdmin, resetApiKey);
app.get('/admin/api/users/stats', requireAdmin, getUserStats);

// ============================================
// API 路由 - 配置管理
// ============================================

app.get('/admin/api/configs/sources', requireAdmin, getSourceConfigs);
app.put('/admin/api/configs/sources', requireAdmin, updateSourceConfig);
app.post('/admin/api/configs/sources/batch', requireAdmin, batchUpdateSourceConfigs);

app.get('/admin/api/configs/system', requireAdmin, getSystemSettings);
app.put('/admin/api/configs/system', requireAdmin, updateSystemSetting);

// ============================================
// 页面路由 - 配置管理
// ============================================

app.get('/admin/config', requireAdmin, async (c) => {
  return c.html(configPage());
});

export default app;
