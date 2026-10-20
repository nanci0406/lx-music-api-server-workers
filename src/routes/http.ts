// Web 界面后端的公共工具：统一的 JSON 响应、鉴权、CSRF 防护、安全响应头

import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env } from '../env';
import type { AppContext } from '../lib/context';
import { HttpError } from '../lib/errors';
import { COOKIE_NAME, getSession, type AdminSession } from '../services/admin-auth';

export type AppEnv = { Bindings: Env; Variables: { ctx: AppContext; ip: string } };
export type AppContextC = Context<AppEnv>;

export function ok(c: AppContextC, data: unknown = null, status: 200 | 201 = 200) {
  return c.json({ code: 0, msg: 'success', data }, status);
}

/** 中断请求并返回 JSON 错误 */
export function fail(status: number, message: string, data: unknown = null): never {
  throw new HttpError(status, message, data);
}

/** 客户端 IP：Cloudflare 提供的 CF-Connecting-IP(本地开发时没有，视为 127.0.0.1) */
export function clientIp(c: Context): string {
  return c.req.header('CF-Connecting-IP') || '127.0.0.1';
}

export function requestHost(c: Context): string {
  return (c.req.header('Host') || new URL(c.req.url).host).toLowerCase();
}

/** 服务的对外地址，例如 https://music.example.com */
export function baseUrl(c: Context): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${requestHost(c)}`;
}

export function isHttps(c: Context): boolean {
  return new URL(c.req.url).protocol === 'https:';
}

/**
 * 写操作的来源校验：浏览器发起的跨站请求会带 Origin(或 Referer)，其主机必须与本站一致；
 * 两者都没有时(如 curl)不拦截
 */
export function checkSameOrigin(c: AppContextC): void {
  if (!c.get('ctx').config.get('security.admin_origin_check')) return;
  const source = c.req.header('Origin') || c.req.header('Referer');
  if (!source) return;
  const allowed = new Set([requestHost(c)]);
  const forwarded = c.req.header('X-Forwarded-Host');
  if (forwarded) allowed.add(forwarded.split(',')[0].trim().toLowerCase());
  let host = '';
  try {
    host = new URL(source).host.toLowerCase();
  } catch {
    host = '';
  }
  if (source === 'null' || !allowed.has(host)) {
    fail(403, '请求来源校验失败。如果你通过其他代理访问，请让代理传递原始 Host，或在配置中关闭 security.admin_origin_check');
  }
}

/** 读取 JSON 请求体。要求 Content-Type 为 application/json：跨站表单无法发出这种请求，是 CSRF 的又一道防线 */
export async function readJson(c: AppContextC, maxSize = 256 * 1024): Promise<Record<string, any>> {
  const contentType = (c.req.header('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') fail(400, '请求格式错误，需要 JSON');
  const length = Number(c.req.header('Content-Length'));
  if (Number.isFinite(length) && length > maxSize) fail(413, '请求内容太大');
  const text = await c.req.text();
  if (text.length > maxSize) fail(413, '请求内容太大');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    fail(400, '请求内容不是有效的 JSON');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, '请求内容格式错误');
  return data as Record<string, any>;
}

export function currentToken(c: AppContextC): string | undefined {
  return getCookie(c, COOKIE_NAME);
}

export async function requireAdmin(c: AppContextC, write = false): Promise<AdminSession> {
  const session = await getSession(c.get('ctx').db, currentToken(c));
  if (!session) fail(401, '登录已过期，请重新登录');
  if (write) checkSameOrigin(c);
  return session;
}

export const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; " +
  "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

/** 给 Web 界面相关的响应加上安全头和缓存策略 */
export function addSecurityHeaders(c: Context): void {
  const path = c.req.path;
  if (!(path === '/' || path.startsWith('/admin') || path.startsWith('/api/admin') || path.startsWith('/api/public'))) return;
  const headers = c.res.headers;
  if (!headers.has('X-Content-Type-Options')) headers.set('X-Content-Type-Options', 'nosniff');
  if (!headers.has('Referrer-Policy')) headers.set('Referrer-Policy', 'same-origin');
  if (path.startsWith('/api/') && !headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  if ((headers.get('Content-Type') || '').startsWith('text/html')) {
    if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
    if (!headers.has('X-Frame-Options')) headers.set('X-Frame-Options', 'DENY');
    if (!headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', CSP);
  }
}
