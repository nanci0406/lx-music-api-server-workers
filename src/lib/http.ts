import { md5 } from './utils';
import type { KVNamespace } from '@cloudflare/workers-types';

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | FormData | Record<string, any>;
  cache?: number | 'no-cache'; // 缓存秒数或禁用
  timeout?: number;
}

export class HttpClient {
  constructor(private kv?: KVNamespace) {}

  async request(url: string, options: HttpRequestOptions = {}): Promise<Response> {
    const {
      method = 'GET',
      headers = {},
      body,
      cache = 'no-cache',
      timeout = 30000
    } = options;

    // 缓存检查
    if (cache !== 'no-cache' && method === 'GET' && this.kv) {
      const cacheKey = `httpx:${md5(url + JSON.stringify(options))}`;
      const cached = await this.kv.get(cacheKey, 'json');

      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 准备请求
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...headers
      }
    };

    // 处理请求体
    if (body) {
      if (typeof body === 'string' || body instanceof FormData) {
        fetchOptions.body = body;
      } else {
        fetchOptions.body = JSON.stringify(body);
        // 不自动添加 Content-Type，让调用方明确指定
        // Python 版本也不会自动添加 Content-Type
      }
    }

    // 超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    fetchOptions.signal = controller.signal;

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // 缓存响应
      if (cache !== 'no-cache' && method === 'GET' && response.ok && this.kv) {
        const cacheKey = `httpx:${md5(url + JSON.stringify(options))}`;
        const data = await response.clone().json();
        await this.kv.put(cacheKey, JSON.stringify(data), {
          expirationTtl: typeof cache === 'number' ? cache : 3600
        });
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async get(url: string, options: Omit<HttpRequestOptions, 'method'> = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  async post(url: string, options: Omit<HttpRequestOptions, 'method'> = {}) {
    return this.request(url, { ...options, method: 'POST' });
  }

  async json(url: string, options: HttpRequestOptions = {}) {
    const response = await this.request(url, options);
    return response.json();
  }

  async text(url: string, options: HttpRequestOptions = {}) {
    const response = await this.request(url, options);
    return response.text();
  }
}
