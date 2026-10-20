// QQ 音乐：获取播放链接

import type { AppContext } from '../../lib/context';
import { FailedException } from '../../lib/errors';
import { request } from '../../lib/http';
import { buildQuery } from '../../lib/utils';
import { pickAccount, type UrlResult } from '../common';
import { getMusicInfo } from './musicInfo';
import { cdnAddr, FILE_INFO, QUALITY_MAP_REVERSE, signRequest } from './utils';

// 第三方 vkey 接口下，这些音质的文件名取 track_info.vs 里对应位置的 media_mid
const VS_INDEX: Record<string, number> = { dolby: 4, master: 3 };

async function vkeyUrl(ctx: AppContext, songId: string, quality: string, info: Record<string, any>): Promise<UrlResult> {
  const file = FILE_INFO[quality];
  let mediaMid: string = info.track_info.file.media_mid;
  if (quality in VS_INDEX) mediaMid = info.track_info.vs?.[VS_INDEX[quality]];
  if (!mediaMid) throw new FailedException('未找到该音质');
  const api = String(ctx.config.get('module.tx.vkey_api.vkey_api_url'));
  const resp = await request(ctx, `${api}?${buildQuery({
    filename: `${file.h}${mediaMid}${file.e}`,
    guid: ctx.config.get('module.tx.vkeyserver.guid'),
    uin: ctx.config.get('module.tx.vkeyserver.uin'),
    src: `${file.h}${songId}${file.e}`,
  })}`);
  const purl = resp.jsonOrNull()?.data?.[0]?.purl;
  if (!purl) throw new FailedException('第三方 vkey 接口没有返回播放地址');
  return { url: cdnAddr(ctx) + purl, quality };
}

export async function url(ctx: AppContext, songId: string, quality: string): Promise<UrlResult> {
  const file = FILE_INFO[quality];
  if (!file) throw new FailedException('不支持的音质');
  const info = await getMusicInfo(ctx, songId);
  if (ctx.config.get('module.tx.vkey_api.use_vkey_api')) return vkeyUrl(ctx, songId, quality, info);
  const mediaMid = info.track_info.file.media_mid;
  const user = pickAccount(ctx, 'tx');
  const uin = String(user.uin ?? '');
  const resp = await signRequest(ctx, {
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        filename: [`${file.h}${mediaMid}${file.e}`],
        guid: String(ctx.config.get('module.tx.vkeyserver.guid')),
        songmid: [songId],
        songtype: [0],
        uin,
        loginflag: 1,
        platform: '20',
      },
    },
    comm: { qq: uin, authst: String(user.qqmusic_key ?? ''), ct: '26', cv: '2010101', v: '2010101' },
  });
  const data = resp.jsonOrNull()?.req_0?.data?.midurlinfo?.[0];
  if (!data || !data.purl) throw new FailedException('failed');
  const prefix = String(data.filename || '').split('.')[0].slice(0, 4);
  return { url: cdnAddr(ctx) + data.purl, quality: QUALITY_MAP_REVERSE[prefix] || quality };
}
