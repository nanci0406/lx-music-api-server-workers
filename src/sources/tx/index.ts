// QQ 音乐

import type { AppContext } from '../../lib/context';
import { FailedException } from '../../lib/errors';
import { sizeFormat, timeLengthFormat } from '../../lib/utils';
import { getLyric } from './lyric';
import { getMusicInfo } from './musicInfo';
import { formatSinger, signRequest } from './utils';

export { url } from './player';

export async function info(ctx: AppContext, songmid: string) {
  const req = await getMusicInfo(ctx, songmid);
  const track = req.track_info;
  const file = track.file || {};
  const fileInfo: Record<string, { size: string }> = {};
  const sizes: [string, unknown][] = [
    ['128k', file.size_128mp3], ['320k', file.size_320mp3], ['flac', file.size_flac],
    ['flac24bit', file.size_hires], ['dolby', file.size_dolby], ['master', file.size_new?.[0]],
  ];
  for (const [quality, size] of sizes) {
    if (Number(size)) fileInfo[quality] = { size: sizeFormat(Number(size)) };
  }
  const genres = (req.info?.genre?.content || []).map((g: any) => g.value);
  const subtitle = String(track.subtitle || '').trim();
  const albumSubtitle = String(track.album?.subtitle || '').trim();
  const pmid = track.album?.pmid || '';
  return {
    name: subtitle ? `${track.title} ${subtitle}` : track.title,
    name_ori: track.title,
    name_extra: subtitle,
    singer: formatSinger(track.singer),
    singer_list: (track.singer || []).map(({ uin, title, ...rest }: any) => rest),
    format_length: timeLengthFormat(track.interval),
    length: Number(track.interval),
    media_mid: file.media_mid,
    file_info: fileInfo,
    songmid: track.mid,
    album_id: track.album?.id,
    album_mid: track.album?.mid,
    album: albumSubtitle ? `${track.album?.title} ${albumSubtitle}` : track.album?.title,
    language: req.info?.lan?.content?.[0]?.value || '',
    cover: pmid ? `https://y.qq.com/music/photo_new/T002R800x800M000${pmid}.jpg` : '',
    sizable_cover: pmid ? `https://y.qq.com/music/photo_new/T002R{size}x{size}M000${pmid}.jpg` : '',
    publish_date: track.time_public,
    mvid: track.mv?.vid || '',
    genre: genres,
    kmid: track.ksong?.mid || '',
    kid: track.ksong?.id || 0,
    bpm: track.bpm || 0,
  };
}

export async function lyric(ctx: AppContext, songId: string) {
  return getLyric(ctx, songId);
}

// GetMvUrls 返回的 filetype 对应的清晰度
const MV_FILETYPE: Record<number, string> = { 10: '360p', 20: '480p', 30: '720p', 40: '1080p' };

export async function mv(ctx: AppContext, vid: string) {
  const [infoResp, urlResp] = await Promise.all([
    signRequest(ctx, {
      comm: { ct: 24, cv: 4747474 },
      mvinfo: {
        module: 'video.VideoDataServer',
        method: 'get_video_info_batch',
        param: {
          vidlist: [vid],
          required: ['vid', 'type', 'sid', 'cover_pic', 'duration', 'singers', 'video_switch', 'msg', 'name', 'desc',
            'playcnt', 'pubdate', 'isfav', 'gmid', 'songmid'],
        },
      },
    }, `tx_mv_${vid}`),
    signRequest(ctx, {
      comm: { ct: 24, cv: 4747474, g_tk: 812935580, uin: 0, format: 'json', platform: 'yqq' },
      mvUrl: {
        module: 'gosrf.Stream.MvUrlProxy',
        method: 'GetMvUrls',
        param: { vids: [vid], request_typet: 10001, addrtype: 3, format: 264 },
      },
    }),
  ]);
  const detail = infoResp.jsonOrNull()?.mvinfo?.data?.[vid];
  if (!detail) throw new FailedException('mv不存在');
  const playInfo: Record<string, unknown> = {};
  const streams = urlResp.jsonOrNull()?.mvUrl?.data?.[vid]?.mp4 || [];
  for (const stream of streams) {
    const link = stream.url?.[0] || stream.freeflow_url?.[0];
    if (!link || !stream.filetype) continue;
    playInfo[MV_FILETYPE[stream.filetype] || `filetype_${stream.filetype}`] = {
      url: link,
      format_size: sizeFormat(Number(stream.fileSize) || 0),
      size: Number(stream.fileSize) || 0,
    };
  }
  const singers = (detail.singers || []).map((s: any) => ({ name: s.name, id: s.id, mid: s.mid, avatar: s.picurl }));
  return {
    name: detail.name,
    intro: detail.desc,
    vid: detail.vid,
    format_length: timeLengthFormat(detail.duration),
    length: detail.duration,
    singer: singers.map((s: any) => s.name).join('、'),
    singer_list: singers,
    cover: detail.cover_pic,
    play_count: detail.playcnt,
    publish_date: detail.pubdate,
    // 有版权限制时接口会给出说明，例如“因版权限制，该视频在当前国家或地区暂不支持播放”
    message: detail.msg || '',
    play_info: playInfo,
  };
}
