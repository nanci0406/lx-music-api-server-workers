import { Context, Next } from 'hono';
import type { Env } from '../types/env';
import { CacheManager } from '../lib/cache';
import { sha256 } from '../lib/utils';

// 生成会话令牌
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// 检查管理员会话
export async function requireAdmin(c: Context<{ Bindings: Env; Variables: any }>, next: Next) {
  const cache = new CacheManager(c.env.KV);
  const sessionToken = c.req.header('cookie')?.match(/lx_admin_session=([^;]+)/)?.[1];

  if (!sessionToken) {
    return c.redirect('/admin/login');
  }

  const session = await cache.getSession(sessionToken);
  if (!session) {
    return c.redirect('/admin/login');
  }

  c.set('admin', session);
  return next();
}

// 验证管理员凭据
export async function authenticateAdmin(
  username: string,
  password: string,
  env: Env
): Promise<boolean> {
  // 从数据库查询管理员
  const admin = await env.DB
    .prepare('SELECT password_hash FROM admins WHERE username = ?')
    .bind(username)
    .first();

  if (!admin) {
    return false;
  }

  const passwordHash = sha256(password);
  return passwordHash === admin.password_hash;
}

// 创建会话
export async function createSession(
  c: Context<{ Bindings: Env; Variables: any }>,
  username: string
): Promise<string> {
  const cache = new CacheManager(c.env.KV);
  const token = generateToken();

  const sessionData = {
    username,
    loginTime: Date.now()
  };

  await cache.setSession(token, sessionData, 86400); // 24小时

  return token;
}

// 销毁会话
export async function destroySession(
  c: Context<{ Bindings: Env; Variables: any }>,
  token: string
): Promise<void> {
  const cache = new CacheManager(c.env.KV);
  await cache.deleteSession(token);
}
