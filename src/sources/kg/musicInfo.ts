// 酷狗：歌曲信息、歌手信息、MV hash

import type { AppContext } from '../../lib/context';
import { md5, randomInt } from '../../lib/crypto';
import { request } from '../../lib/http';
import { now } from '../../lib/utils';
import { signRequest } from './utils';

const CACHE_30_DAYS = 86400 * 30;

/** 歌曲信息(album_audio/audio 接口)，找不到时返回空对象 */
export async function getMusicInfo(ctx: AppContext, hash: string, useCache = true): Promise<Record<string, any>> {
  const resp = await request(ctx, 'http://gateway.kugou.com/v3/album_audio/audio', {
    method: 'POST',
    headers: {
      'KG-THash': '13a3164',
      'KG-RC': '1',
      'KG-Fake': '0',
      'KG-RF': '00869891',
      'User-Agent': 'Android712-AndroidPhone-11451-376-0-FeeCacheUpdate-wifi',
      'x-router': 'kmr.service.kugou.com',
    },
    body: JSON.stringify({
      area_code: '1',
      show_privilege: '1',
      show_album_info: '1',
      is_publish: '',
      appid: 1005,
      clientver: 11451,
      mid: '114514',
      dfid: '-',
      clienttime: now(),
      key: 'OIlwlieks28dk2k092lksi2UIkp',
      data: [{ hash }],
    }),
    cache: useCache ? CACHE_30_DAYS : 0,
    cacheKey: `kg_info_${hash}`,
  });
  const body = resp.jsonOrNull();
  const first = body && Array.isArray(body.data) && Array.isArray(body.data[0]) ? body.data[0][0] : null;
  return first && typeof first === 'object' ? first : {};
}

export interface KgSinger {
  name: string;
  id: number | string;
  avatar: string;
  sizable_avatar: string;
}

export async function getMusicSingerInfo(ctx: AppContext, hash: string, useCache = true): Promise<KgSinger[]> {
  const uuid = md5(String(randomInt(100000, 999999)) + '114514');
  const resp = await signRequest(ctx, 'https://expendablekmrcdn.kugou.com/container/v2/image', {
    album_image_type: -3,
    appid: 1005,
    author_image_type: '4,5',
    clientver: 12029,
    count: 5,
    data: JSON.stringify([{ hash: hash.toLowerCase() }]),
    isCdn: 1,
    publish_time: 1,
  }, {
    method: 'GET',
    headers: {
      'User-Agent': 'Android712-AndroidPhone-11451-18-0-Avatar-wifi',
      'KG-THash': '2a2624f',
      'KG-RC': '1',
      'KG-Fake': '0',
      'KG-RF': '0074c2c4',
      appid: '1005',
      clientver: '11451',
      uuid,
    },
    cache: useCache ? CACHE_30_DAYS : 0,
    cacheKey: `kg_singer_${hash.toLowerCase()}`,
  }, 'OIlwieks28dk2k092lksi2UIkp');
  const body = resp.jsonOrNull();
  const authors = body?.data?.[0]?.author;
  if (!Array.isArray(authors)) return [];
  return authors.map((a: any) => ({
    name: a.author_name,
    id: a.author_id,
    avatar: String(a.sizable_avatar || '').replace('{size}', '1080'),
    sizable_avatar: a.sizable_avatar || '',
  }));
}

export async function getMusicMVHash(ctx: AppContext, hash: string, useCache = true): Promise<string> {
  const resp = await request(ctx, `http://mobilecdnbj.kugou.com/api/v3/song/info?hash=${encodeURIComponent(hash)}`, {
    cache: useCache ? CACHE_30_DAYS : 0,
    cacheKey: `kg_mvhash_${hash}`,
  });
  const body = resp.jsonOrNull();
  return body?.data?.mvhash || '';
}
