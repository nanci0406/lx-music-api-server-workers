// 酷狗：获取播放链接

import type { AppContext } from '../../lib/context';
import { FailedException } from '../../lib/errors';
import { now, timestampFormat } from '../../lib/utils';
import { pickAccount, type UrlResult } from '../common';
import { getMusicInfo } from './musicInfo';
import { errorHint, getKey, kgTools, QUALITY_HASH_MAP, QUALITY_MAP, signRequest } from './utils';

export async function url(ctx: AppContext, songId: string, quality: string): Promise<UrlResult> {
  songId = songId.toLowerCase();
  const tools = kgTools(ctx);
  const hashField = QUALITY_HASH_MAP[quality];
  if (!hashField) throw new FailedException('不支持的音质');
  const info = await getMusicInfo(ctx, songId);
  let thash: string = info.audio_info?.[hashField] || '';
  if (!thash) throw new FailedException('获取歌曲信息失败');
  thash = thash.toLowerCase();
  const albumId = info.album_info?.album_id || '';
  const albumAudioId = info.album_audio_id || '';
  const userInfo = pickAccount(ctx, 'kg');

  let params: Record<string, unknown> = {
    album_id: albumId,
    userid: userInfo.userid ?? '0',
    area_code: 1,
    hash: thash,
    module: '',
    mid: userInfo.mid ?? tools.mid,
    appid: tools.appid,
    ssa_flag: 'is_fromtrack',
    clientver: tools.clientver,
    open_time: timestampFormat(now(), 8).slice(0, 10).replace(/-/g, ''),
    vipType: 6,
    ptype: 0,
    token: userInfo.token ?? '',
    auth: '',
    mtype: 0,
    album_audio_id: albumAudioId,
    behavior: 'play',
    clienttime: now(),
    pid: tools.pid,
    key: getKey(thash, { mid: userInfo.mid ?? tools.mid, userid: userInfo.userid ?? '0' }, tools),
    dfid: '-',
    pidversion: 3001,
  };
  if (tools.version === 'v5') params.quality = QUALITY_MAP[quality];
  if (tools.version === 'v4') params.version = tools.clientver;
  // 自定义参数优先级高于默认参数
  params = { ...params, ...tools.extraParams };

  const headers: Record<string, string> = {
    'User-Agent': 'Android712-AndroidPhone-8983-18-0-NetMusic-wifi',
    'KG-THash': '3e5ec6b',
    'KG-Rec': '1',
    'KG-RC': '1',
  };
  if (tools.xRouter.enable) headers['x-router'] = tools.xRouter.value;
  const resp = await signRequest(ctx, tools.url, params, { headers }, tools.signkey);
  const body = resp.jsonOrNull();
  if (!body) throw new FailedException(`链接获取失败，接口返回了无法识别的内容(HTTP ${resp.status})`);
  const hint = errorHint(body.errcode ?? body.error_code);
  if (hint) throw new FailedException(`链接获取失败(${body.errcode ?? body.error_code})：${hint}`);
  if (body.status === 3) throw new FailedException('该歌曲在酷狗没有版权，请换源播放');
  if (body.status === 2) throw new FailedException('链接获取失败，请检查账号是否有会员或数字专辑是否购买');
  if (body.status !== 1) {
    const detail = body.errcode ?? body.error_code;
    throw new FailedException(`链接获取失败，可能是数字专辑或者api失效${detail ? `(${detail}${body.error || body.errmsg ? '，' + (body.error || body.errmsg) : ''})` : ''}`);
  }
  const link = Array.isArray(body.url) ? body.url[0] : '';
  if (!link) throw new FailedException('链接获取失败，接口没有返回播放地址');
  return { url: link, quality };
}
