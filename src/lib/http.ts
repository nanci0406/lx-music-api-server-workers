// 请求音乐平台接口用的 HTTP 客户端(对应 Python 版的 Httpx.AsyncRequest)：
// 默认浏览器 UA、附带 X-Forwarded-For 伪装国内 IP、超时、可选的响应缓存(D1)、保留全部 Set-Cookie。

import type { AppContext } from './context';
import { getCache, setCache } from './cache';
import { md5, utf8Decode, utf8Encode } from './crypto';
import { log } from './log';
import { buildQuery } from './utils';

const logger = log('http');

export const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Safari/537.36';

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  /** 原样发送的请求体 */
  body?: string | Uint8Array;
  /** 以 JSON 发送 */
  json?: unknown;
  /** 以 application/x-www-form-urlencoded 发送 */
  form?: Record<string, string | number>;
  /** 缓存响应的秒数(只缓存 2xx 的文本响应) */
  cache?: number;
  /** 缓存键，默认由 URL 和请求体计算 */
  cacheKey?: string;
  /** 超时(毫秒) */
  timeout?: number;
  /** 是否自动跟随重定向，默认跟随 */
  redirect?: 'follow' | 'manual';
  /** 是否附带 common.fakeip，默认附带 */
  fakeIp?: boolean;
}

export class HttpResponse {
  constructor(
    public status: number,
    public headers: Headers,
    public body: Uint8Array,
    public url: string,
    public setCookies: string[],
  ) {}

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  text(): string {
    return utf8Decode(this.body);
  }

  json<T = any>(): T {
    return JSON.parse(this.text()) as T;
  }

  /** 解析 JSON，失败时返回 null */
  jsonOrNull<T = any>(): T | null {
    try {
      return this.json<T>();
    } catch {
      return null;
    }
  }
}

export class HttpRequestError extends Error {
  constructor(message: string, public timeout = false) {
    super(message);
    this.name = 'HttpRequestError';
  }
}

export function fakeIp(ctx: AppContext | null): string {
  const value = ctx ? ctx.config.get('common.fakeip') : '';
  return typeof value === 'string' ? value.trim() : '';
}

export async function request(ctx: AppContext | null, url: string, options: RequestOptions = {}): Promise<HttpResponse> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { ...(options.headers || {}) };
  const lowerKeys = new Set(Object.keys(headers).map((k) => k.toLowerCase()));
  if (!lowerKeys.has('user-agent')) headers['User-Agent'] = DEFAULT_UA;
  if (options.fakeIp !== false && !lowerKeys.has('x-forwarded-for')) {
    const ip = fakeIp(ctx);
    if (ip) headers['X-Forwarded-For'] = ip;
  }

  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    body = JSON.stringify(options.json);
    if (!lowerKeys.has('content-type')) headers['Content-Type'] = 'application/json';
  } else if (options.form) {
    body = buildQuery(options.form);
    if (!lowerKeys.has('content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (options.body !== undefined) {
    body = options.body;
  }

  const cacheTtl = ctx && options.cache && options.cache > 0 ? options.cache : 0;
  const cacheKey = cacheTtl
    ? 'httpx:' + (options.cacheKey || md5(`${method} ${url} ${typeof body === 'string' ? body : ''}`))
    : '';
  if (cacheTtl && ctx) {
    const cached = await getCache<{ s: number; b: string; u: string }>(ctx.db, cacheKey);
    if (cached) return new HttpResponse(cached.s, new Headers(), utf8Encode(cached.b), cached.u || url, []);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      redirect: options.redirect || 'follow',
      signal: AbortSignal.timeout(options.timeout || 15000),
    });
  } catch (e: any) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    logger.debug(`${method} ${url} 失败: ${e}`);
    throw new HttpRequestError(timeout ? '请求超时' : `网络请求失败: ${e && e.message ? e.message : e}`, timeout);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  const result = new HttpResponse(response.status, response.headers, bytes, response.url || url, setCookies);
  logger.debug(`${method} ${url} -> ${response.status}`);

  if (cacheTtl && ctx && result.ok) {
    ctx.waitUntil(setCache(ctx.db, cacheKey, { s: result.status, b: result.text(), u: result.url }, cacheTtl));
  }
  return result;
}
