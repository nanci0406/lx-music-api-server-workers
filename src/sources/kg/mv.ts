// 酷狗：MV 信息与播放地址

import type { AppContext } from '../../lib/context';
import { FailedException } from '../../lib/errors';
import { request } from '../../lib/http';
import { sizeFormat, timeLengthFormat } from '../../lib/utils';

export async function getMvInfo(ctx: AppContext, mvhash: string, useCache = true) {
  const resp = await request(ctx, `http://mobilecdnbj.kugou.com/api/v3/mv/detail?mvhash=${encodeURIComponent(mvhash)}`, {
    cache: useCache ? 86400 * 30 : 0,
    cacheKey: `kg_mv_${mvhash}`,
  });
  const body = resp.jsonOrNull();
  if (!body || body.status !== 1) throw new FailedException('获取失败');
  const info = body.data?.info;
  if (!info) throw new FailedException('mv不存在');
  return {
    name: String(info.filename || '').replace(`${info.singername} - `, ''),
    name_ori: info.videoname,
    name_extra: info.remark,
    filename: info.filename,
    intro: info.description,
    music_hash: info.audio_info?.hash,
    music_id: info.audio_info?.audio_id,
    format_length: timeLengthFormat(info.mv_timelength / 1000),
    length: info.mv_timelength / 1000,
    hash: info.hash,
    vid: info.video_id,
    singer: info.singername,
    singer_list: (info.authors || []).map((s: any) => ({
      name: s.singername,
      id: s.singerid,
      avatar: String(s.singeravatar || '').replace('{size}', '1080'),
      sizable_avatar: s.singeravatar,
    })),
    tags: (info.tags || []).map((t: any) => t.tag_name),
    cover: String(info.imgurl || '').replace('{size}', '1080'),
    sizable_cover: info.imgurl,
  };
}

export async function getMvPlayURL(ctx: AppContext, mvhash: string) {
  const resp = await request(ctx, `https://m.kugou.com/app/i/mv.php?cmd=100&hash=${encodeURIComponent(mvhash)}&ismp3=1&ext=mp4`);
  const body = resp.jsonOrNull();
  if (!body || body.status !== 1 || !body.mvdata) return {};
  const formatted: Record<string, unknown> = {};
  for (const [field, label] of [['le', '270p'], ['sq', '720p'], ['rq', '1080p']]) {
    const item = body.mvdata[field];
    if (!item) continue;
    formatted[label] = {
      url: item.downurl,
      hash: item.hash,
      bitrate: item.bitrate,
      format_size: sizeFormat(item.filesize),
      size: item.filesize,
    };
  }
  return formatted;
}
