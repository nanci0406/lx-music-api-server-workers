// 酷狗概念版(appid=3116)每日签到：上报一次“听歌”

import type { AppContext } from '../../lib/context';
import { randomHex } from '../../lib/crypto';
import { FailedException } from '../../lib/errors';
import { request } from '../../lib/http';
import { log } from '../../lib/log';
import { buildQuery, joinParams, now, pickRandom } from '../../lib/utils';
import { sign } from './utils';

const logger = log('kugou_lite_sign_in');

/** 从 TOP500 榜单随机挑一首歌，再通过搜索拿到它的 mixsongid */
async function randomMixSongMid(ctx: AppContext): Promise<string> {
  const rank = await request(ctx, 'http://mobilecdnbj.kugou.com/api/v3/rank/song?version=9108&ranktype=1&plat=0' +
    '&pagesize=100&area_code=1&page=1&rankid=8888&with_res_tag=0&show_portrait_mv=1');
  const rankBody = rank.jsonOrNull();
  if (!rankBody || rankBody.status !== 1) throw new FailedException('排行榜获取失败');
  const song = pickRandom<any>(rankBody.data?.info || []);
  if (!song) throw new FailedException('排行榜获取失败');
  const search = await request(ctx, 'https://songsearch.kugou.com/song_search_v2?' + buildQuery({
    keyword: song.filename, area_code: 1, page: 1, pagesize: 1, userid: 0, clientver: '',
    platform: 'WebFilter', filter: 2, iscorrection: 1, privilege_filter: 0,
  }), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.142.86 Safari/537.36',
      Referer: 'https://www.kugou.com',
    },
  });
  const body = search.jsonOrNull();
  const first = body?.data?.lists?.[0];
  if (!body || body.status !== 1 || !first) throw new FailedException('歌曲搜索失败');
  return String(first.MixSongID);
}

/** 为一个账号签到，失败时抛出异常 */
export async function doAccountSignin(ctx: AppContext, userInfo: Record<string, any>): Promise<void> {
  let mixid = String(userInfo.lite_sign_in?.mixsongmid?.value ?? 'auto');
  if (mixid === 'auto') mixid = await randomMixSongMid(ctx);
  if (!/^\d+$/.test(mixid)) throw new FailedException('mixsongmid 必须是数字或 auto');
  const clientver = String(ctx.config.get('module.kg.client.clientver'));
  const body = `{"mixsongid":${mixid}}`;
  const params: Record<string, unknown> = {
    userid: userInfo.userid,
    token: userInfo.token,
    appid: 3116,
    clientver,
    clienttime: now(),
    mid: userInfo.mid,
    uuid: randomHex(16),
    dfid: '-',
  };
  params.signature = sign(params, body, String(ctx.config.get('module.kg.client.signatureKey')));
  const resp = await request(ctx, `https://gateway.kugou.com/v2/report/listen_song?${joinParams(params)}`, {
    method: 'POST',
    body,
    headers: {
      'User-Agent': `Android712-AndroidPhone-${clientver}-18-0-NetMusic-wifi`,
      'KG-THash': '3e5ec6b',
      'KG-Rec': '1',
      'KG-RC': '1',
      'x-router': 'youth.kugou.com',
    },
  });
  const result = resp.jsonOrNull();
  if (!result || result.status !== 1) {
    throw new FailedException(result?.error_msg || `签到失败(HTTP ${resp.status})`);
  }
  logger.info(`酷狗概念版账号(UID_${userInfo.userid})签到成功`);
}

export async function signinMain(ctx: AppContext): Promise<void> {
  await doAccountSignin(ctx, ctx.config.get('module.kg.user') || {});
}

export async function signinPool(ctx: AppContext, index: number): Promise<boolean | void> {
  const user = (ctx.config.get('module.cookiepool.kg') || [])[index];
  if (!user) {
    logger.warning(`酷狗账号池签到失败: 账号索引不存在(${index})`);
    return false;
  }
  await doAccountSignin(ctx, user);
}
