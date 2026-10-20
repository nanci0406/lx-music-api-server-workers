// 网易云音乐

import type { AppContext } from '../../lib/context';
import { FailedException } from '../../lib/errors';
import { request } from '../../lib/http';
import { pickAccount, type UrlResult } from '../common';
import { eapiEncrypt } from './encrypt';

export const QUALITY_MAP: Record<string, string> = {
  '128k': 'standard',
  '192k': 'higher',
  '320k': 'exhigh',
  flac: 'lossless',
  flac24bit: 'hires',
  dolby: 'jyeffect',
  sky: 'sky',
  master: 'jymaster',
  standard: 'standard',
  higher: 'higher',
  exhigh: 'exhigh',
  lossless: 'lossless',
  hires: 'hires',
  jyeffect: 'jyeffect',
  jymaster: 'jymaster',
};

export const QUALITY_MAP_REVERSE: Record<string, string> = {
  standard: '128k',
  higher: '192k',
  exhigh: '320k',
  lossless: 'flac',
  hires: 'flac24bit',
  jyeffect: 'dolby',
  sky: 'sky',
  jymaster: 'master',
};

export async function url(ctx: AppContext, songId: string, quality: string): Promise<UrlResult> {
  const level = QUALITY_MAP[quality];
  if (!level) throw new FailedException('不支持的音质');
  const path = '/api/song/enhance/player/url/v1';
  const body: Record<string, unknown> = { ids: JSON.stringify([songId]), level, encodeType: 'flac' };
  if (quality === 'sky') body.immerseType = 'c51';
  const resp = await request(ctx, 'https://interface.music.163.com/eapi/song/enhance/player/url/v1', {
    method: 'POST',
    headers: { Cookie: String(pickAccount(ctx, 'wy').cookie || '') },
    form: eapiEncrypt(path, JSON.stringify(body)),
  });
  const data = resp.jsonOrNull()?.data?.[0];
  if (!data || !data.url) throw new FailedException('failed');
  if (data.level !== level) throw new FailedException('reject unmatched quality');
  return { url: String(data.url).split('?')[0], quality: QUALITY_MAP_REVERSE[data.level] || quality };
}
