// QQ 音乐：公共工具

import type { AppContext } from '../../lib/context';
import { request, type HttpResponse } from '../../lib/http';
import { sign } from './sign';

export const FILE_INFO: Record<string, { e: string; h: string }> = {
  '128k': { e: '.mp3', h: 'M500' },
  '320k': { e: '.mp3', h: 'M800' },
  flac: { e: '.flac', h: 'F000' },
  flac24bit: { e: '.flac', h: 'RS01' },
  dolby: { e: '.flac', h: 'Q000' },
  master: { e: '.flac', h: 'AI00' },
};

export const QUALITY_MAP_REVERSE: Record<string, string> = {
  M500: '128k',
  M800: '320k',
  F000: 'flac',
  RS01: 'flac24bit',
  Q000: 'dolby',
  AI00: 'master',
};

export function cdnAddr(ctx: AppContext): string {
  return ctx.config.get('module.tx.cdnaddr') || 'http://ws.stream.qqmusic.qq.com/';
}

/** 签名后请求 musics.fcg；cacheKey 不为空时缓存 30 天 */
export async function signRequest(ctx: AppContext, data: unknown, cacheKey?: string): Promise<HttpResponse> {
  const body = JSON.stringify(data);
  return request(ctx, `https://u.y.qq.com/cgi-bin/musics.fcg?format=json&sign=${sign(body)}`, {
    method: 'POST',
    body,
    cache: cacheKey ? 86400 * 30 : 0,
    cacheKey,
  });
}

export function formatSinger(singers: { name: string }[]): string {
  return (singers || []).map((s) => s.name).join('、');
}

/**
 * 判断账号的登录类型，决定刷新登录 / 检查登录状态时用哪一种请求。
 * 优先使用登录时保存的 login_type(1 微信、2 QQ)，没有时按 qqmusic_key 的前缀判断
 * (手机验证码登录得到的 key 不一定以 W_X / Q_H_L 开头)。
 */
export function loginKind(userInfo: Record<string, any>): 'wx' | 'qq' | null {
  const loginType = String(userInfo.login_type ?? '').trim();
  if (loginType === '1') return 'wx';
  if (loginType === '2') return 'qq';
  const key = String(userInfo.qqmusic_key ?? '');
  if (key.startsWith('W_X')) return 'wx';
  if (key.startsWith('Q_H_L')) return 'qq';
  return null;
}
