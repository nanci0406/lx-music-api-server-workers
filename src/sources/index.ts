// 各平台方法的分发与缓存(对应 Python 版的 modules/__init__.py)

import type { AppContext } from '../lib/context';
import { cacheStatement, getCache } from '../lib/cache';
import { FailedException } from '../lib/errors';
import { log } from '../lib/log';
import { now } from '../lib/utils';
import { SOURCE_EXPIRATION, type LyricResult, type Source, type UrlResult } from './common';
import * as kg from './kg';
import * as tx from './tx';
import * as wy from './wy';

export * from './common';

const logger = log('api_handler');

export interface ApiResult {
  code: number;
  msg: string;
  data: unknown;
  extra?: Record<string, unknown>;
}

type UrlFn = (ctx: AppContext, songId: string, quality: string) => Promise<UrlResult>;
type IdFn = (ctx: AppContext, id: string) => Promise<unknown>;

const URL_FUNCS: Record<Source, UrlFn> = { tx: tx.url, kg: kg.url, wy: wy.url };
const LYRIC_FUNCS: Partial<Record<Source, (ctx: AppContext, id: string) => Promise<LyricResult>>> = { tx: tx.lyric, kg: kg.lyric };
const OTHER_FUNCS: Record<string, Partial<Record<Source, IdFn>>> = {
  info: { tx: tx.info, kg: kg.info },
  mv: { tx: tx.mv, kg: kg.mv },
};

const UNSUPPORTED: ApiResult = { code: 1, msg: '未知的源或不支持的方法', data: null };

export function urlCacheKey(source: Source, songId: string, quality: string): string {
  return `urls:${source}_${source === 'kg' ? songId.toLowerCase() : songId}_${quality}`;
}

interface UrlCache {
  url: string;
  quality?: string;
  time: number; // 缓存可用到的时间(链接有效期的 75%)
  expire: boolean;
}

/**
 * 获取播放链接。cached 为调用方已经读到的缓存(undefined 表示还没读)
 */
export async function url(ctx: AppContext, source: Source, songId: string, quality: string, cached?: UrlCache | null): Promise<ApiResult> {
  if (!quality) return { code: 2, msg: '需要参数"quality"', data: null };
  if (source === 'kg') songId = songId.toLowerCase();
  const expiration = SOURCE_EXPIRATION[source];
  const key = urlCacheKey(source, songId, quality);
  if (cached === undefined) cached = await getCache<UrlCache>(ctx.db, key);
  if (cached && (!cached.expire || now() < cached.time)) {
    logger.debug(`使用缓存的 ${source}_${songId}_${quality}`);
    return {
      code: 0,
      msg: 'success',
      data: cached.url,
      extra: {
        cache: true,
        quality: { target: quality, result: cached.quality || quality },
        expire: {
          // 缓存时把有效期的 75% 作为链接可用时长，这里加回来
          time: cached.expire ? Math.floor(cached.time + expiration.time * 0.25) : null,
          canExpire: cached.expire,
        },
      },
    };
  }
  try {
    const result = await URL_FUNCS[source](ctx, songId, quality);
    const expireTime = now() + expiration.time;
    const entry: UrlCache = {
      url: result.url,
      quality: result.quality,
      time: Math.floor(expireTime - expiration.time * 0.25),
      expire: expiration.expire,
    };
    ctx.waitUntil(cacheStatement(ctx.db, key, entry, expiration.expire ? Math.floor(expiration.time * 0.75) : null)
      .run().catch((e) => logger.warning(`写入缓存失败: ${e}`)));
    logger.info(`获取 ${source}_${songId}_${quality} 成功`);
    return {
      code: 0,
      msg: 'success',
      data: result.url,
      extra: {
        cache: false,
        quality: { target: quality, result: result.quality },
        expire: { time: expiration.expire ? expireTime : null, canExpire: expiration.expire },
      },
    };
  } catch (e) {
    if (e instanceof FailedException) {
      logger.info(`获取 ${source}_${songId}_${quality} 失败，原因：${e.message}`);
      return { code: 2, msg: e.message, data: null };
    }
    throw e;
  }
}

export async function lyric(ctx: AppContext, source: Source, songId: string): Promise<ApiResult> {
  const func = LYRIC_FUNCS[source];
  if (!func) return UNSUPPORTED;
  const key = `lyric:${source}_${songId}`;
  const cached = await getCache<LyricResult>(ctx.db, key);
  if (cached) return { code: 0, msg: 'success', data: cached };
  try {
    const result = await func(ctx, songId);
    // 歌词缓存 3 天
    ctx.waitUntil(cacheStatement(ctx.db, key, result, 86400 * 3).run().catch((e) => logger.warning(`写入缓存失败: ${e}`)));
    return { code: 0, msg: 'success', data: result };
  } catch (e) {
    if (e instanceof FailedException) return { code: 2, msg: e.message, data: null };
    throw e;
  }
}

export async function search(ctx: AppContext, source: Source, type: string, query: URLSearchParams): Promise<ApiResult> {
  if (source !== 'kg') return UNSUPPORTED;
  try {
    return { code: 0, msg: 'success', data: await kg.search(ctx, type, query) };
  } catch (e) {
    if (e instanceof FailedException) return { code: 2, msg: e.message, data: null };
    throw e;
  }
}

export async function other(ctx: AppContext, method: string, source: Source, id: string): Promise<ApiResult> {
  const func = OTHER_FUNCS[method]?.[source];
  if (!func) return UNSUPPORTED;
  try {
    return { code: 0, msg: 'success', data: await func(ctx, id) };
  } catch (e) {
    if (e instanceof FailedException) return { code: 2, msg: e.message, data: null };
    throw e;
  }
}

/** 按方法名分发：url / lyric / search / info / mv */
export async function dispatch(
  ctx: AppContext, method: string, source: Source, songId: string, quality: string | undefined, query: URLSearchParams,
  cachedUrl?: UrlCache | null,
): Promise<ApiResult> {
  switch (method) {
    case 'url':
      return url(ctx, source, songId, quality || '', cachedUrl);
    case 'lyric':
      return lyric(ctx, source, songId);
    case 'search':
      return search(ctx, source, songId, query);
    default:
      return other(ctx, method, source, songId);
  }
}
