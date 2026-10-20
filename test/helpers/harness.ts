// 测试工具：在进程内运行 Worker(Hono app + 测试用 D1)，模拟 Cron，拦截对外的 fetch

import { afterEach, beforeEach, vi } from 'vitest';
import app from '../../src/app';
import { Config } from '../../src/config/config';
import { handleScheduled } from '../../src/cron';
import type { Env } from '../../src/env';
import { createContext, type AppContext } from '../../src/lib/context';
import { ensureSchema, resetSchemaState } from '../../src/lib/db';
import { TestD1 } from './d1';

export interface FetchCall {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

type Route = (call: FetchCall) => Response | Promise<Response> | undefined | null;

/** 拦截全局 fetch：按顺序匹配路由，没有匹配的请求返回 404(不会访问真实网络) */
export class FetchMock {
  calls: FetchCall[] = [];
  routes: Route[] = [];

  on(match: string | RegExp | ((call: FetchCall) => boolean), handler: Response | ((call: FetchCall) => Response | Promise<Response>)) {
    this.routes.push((call) => {
      const hit = typeof match === 'string' ? call.url.startsWith(match) : match instanceof RegExp ? match.test(call.url) : match(call);
      if (!hit) return null;
      return typeof handler === 'function' ? handler(call) : handler.clone();
    });
    return this;
  }

  install() {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as any, init);
      const call: FetchCall = { url: request.url, method: request.method, headers: request.headers, body: await request.text() };
      this.calls.push(call);
      for (const route of this.routes) {
        const response = await route(call);
        if (response) return response;
      }
      return new Response('not mocked', { status: 404 });
    });
  }

  callsTo(prefix: string | RegExp): FetchCall[] {
    return this.calls.filter((call) => (typeof prefix === 'string' ? call.url.startsWith(prefix) : prefix.test(call.url)));
  }
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  // headers 可以是对象，也可以是 [名称, 值] 的列表(同名的 Set-Cookie 需要用列表)
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status: 200, ...init, headers });
}

export class Harness {
  db = new TestD1();
  env: Env;
  pending: Promise<unknown>[] = [];
  cookies = new Map<string, string>();
  ip = '203.0.113.5';
  host = 'lx.test';
  fetch = new FetchMock();

  constructor(env: Partial<Env> = {}) {
    resetSchemaState();
    this.env = { DB: this.db as unknown as D1Database, ...env };
    this.fetch.install();
  }

  executionCtx(): ExecutionContext {
    return { waitUntil: (p: Promise<unknown>) => { this.pending.push(p); }, passThroughOnException() {}, props: {} } as any;
  }

  async settle(): Promise<void> {
    while (this.pending.length) await Promise.allSettled(this.pending.splice(0));
  }

  async request(method: string, path: string, options: { json?: unknown; body?: string; headers?: Record<string, string>; cookies?: boolean } = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('CF-Connecting-IP')) headers.set('CF-Connecting-IP', this.ip);
    if (!headers.has('Host')) headers.set('Host', this.host);
    if (options.cookies !== false && this.cookies.size) {
      headers.set('Cookie', Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join('; '));
    }
    let body = options.body;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    }
    const response = await app.fetch(new Request(`https://${this.host}${path}`, { method, headers, body }), this.env, this.executionCtx());
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, value] = pair.split('=');
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(line) || !value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    await this.settle();
    return response;
  }

  async api(method: string, path: string, jsonBody?: unknown, headers: Record<string, string> = {}) {
    const response = await this.request(method, path, { json: jsonBody, headers });
    const text = await response.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: response.status, body, headers: response.headers };
  }

  /** 创建管理员并登录 */
  async loginAdmin(username = 'admin', password = 'password123') {
    const result = await this.api('POST', '/api/admin/setup', { username, password });
    if (result.status !== 200) throw new Error(`setup failed: ${JSON.stringify(result.body)}`);
  }

  async context(): Promise<AppContext> {
    await ensureSchema(this.env.DB);
    return createContext(this.env, await Config.load(this.env.DB), (p) => { this.pending.push(p); });
  }

  async writeConfig(updates: Record<string, unknown>) {
    const ctx = await this.context();
    await ctx.config.writeBatch(updates);
  }

  async config() {
    return (await this.context()).config;
  }

  async cron(at = new Date()) {
    await handleScheduled({ scheduledTime: at.getTime(), cron: '* * * * *', noRetry() {} } as any, this.env, this.executionCtx());
    await this.settle();
  }

  async createUser(name = 'alice', apiKey = 'alice-key-123') {
    const result = await this.api('POST', '/api/admin/users', { name, api_key: apiKey });
    if (result.status !== 201) throw new Error(`create user failed: ${JSON.stringify(result.body)}`);
    return result.body.data;
  }
}

/** 每个测试一个新的 Harness，测试结束后恢复全局 fetch */
export function useHarness(env: Partial<Env> = {}): () => Harness {
  let harness: Harness;
  beforeEach(() => {
    harness = new Harness(env);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  return () => harness;
}
