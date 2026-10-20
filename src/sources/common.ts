// 各平台共用的类型和工具

import type { AppContext } from '../lib/context';
import { pickRandom } from '../lib/utils';

export const SUPPORTED_SOURCES = ['tx', 'kg', 'wy'] as const;
export type Source = (typeof SUPPORTED_SOURCES)[number];

export const SOURCE_NAMES: Record<Source, string> = { tx: 'QQ 音乐', kg: '酷狗音乐', wy: '网易云音乐' };

// 链接有效期(秒)
export const SOURCE_EXPIRATION: Record<Source, { expire: boolean; time: number }> = {
  tx: { expire: true, time: 80400 },
  kg: { expire: true, time: 24 * 60 * 60 },
  wy: { expire: true, time: 20 * 60 },
};

export const QUALITY_OPTIONS: Record<Source, string[]> = {
  kg: ['128k', '320k', 'flac', 'flac24bit', 'master'],
  tx: ['128k', '320k', 'flac', 'flac24bit', 'dolby', 'master'],
  wy: ['128k', '192k', '320k', 'flac', 'flac24bit', 'dolby', 'sky', 'master'],
};

export function isSupportedSource(source: string): source is Source {
  return (SUPPORTED_SOURCES as readonly string[]).includes(source);
}

export interface UrlResult {
  url: string;
  quality: string;
}

export interface LyricResult {
  lyric: string;
  tlyric: string;
  rlyric: string;
  lxlyric: string;
}

// 判断账号池里的账号是否填写了凭证
const CREDENTIAL_FIELD: Record<Source, string> = { tx: 'qqmusic_key', kg: 'token', wy: 'cookie' };

/**
 * 选择本次请求使用的账号：单账号模式用 module.<平台>.user；
 * 账号池模式从 module.cookiepool.<平台> 中随机选一个(优先选填写了凭证的账号)
 */
export function pickAccount(ctx: AppContext, source: Source): Record<string, any> {
  if (!ctx.config.cookiePool) return ctx.config.get(`module.${source}.user`) || {};
  const pool: Record<string, any>[] = (ctx.config.get(`module.cookiepool.${source}`) || []).filter(
    (item: unknown) => item && typeof item === 'object');
  const usable = pool.filter((account) => account[CREDENTIAL_FIELD[source]]);
  return pickRandom(usable.length ? usable : pool) || {};
}
