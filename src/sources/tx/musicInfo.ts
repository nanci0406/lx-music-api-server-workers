// QQ 音乐：歌曲信息

import type { AppContext } from '../../lib/context';
import { FailedException } from '../../lib/errors';
import { signRequest } from './utils';

export async function getMusicInfo(ctx: AppContext, songmid: string): Promise<Record<string, any>> {
  const resp = await signRequest(ctx, {
    comm: { ct: '19', cv: '1859', uin: '0' },
    req: {
      module: 'music.pf_song_detail_svr',
      method: 'get_song_detail_yqq',
      param: { song_type: 0, song_mid: songmid },
    },
  }, `tx_info_${songmid}`);
  const body = resp.jsonOrNull();
  if (!body || body.code !== 0 || body.req?.code !== 0 || !body.req?.data?.track_info) {
    throw new FailedException('获取音乐信息失败');
  }
  return body.req.data;
}
