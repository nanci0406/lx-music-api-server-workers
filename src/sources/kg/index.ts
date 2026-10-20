// 酷狗音乐

import type { AppContext } from '../../lib/context';
import { FailedException } from '../../lib/errors';
import { log } from '../../lib/log';
import { sizeFormat, timeLengthFormat } from '../../lib/utils';
import { getMusicInfo, getMusicMVHash, getMusicSingerInfo } from './musicInfo';
import { getMvInfo, getMvPlayURL } from './mv';
import { getSongSearchResult } from './search';
import { QUALITY_HASH_MAP } from './utils';

export { url } from './player';
export { lyric } from './lyric';

const logger = log('kg');

export async function info(ctx: AppContext, hash: string) {
  // 歌手头像和 MV 只是附加信息，获取失败时不影响歌曲信息本身
  const [res1, singers, mvid] = await Promise.all([
    getMusicInfo(ctx, hash),
    getMusicSingerInfo(ctx, hash).catch((e) => { logger.warning(`获取歌手信息失败: ${e}`); return []; }),
    getMusicMVHash(ctx, hash).catch((e) => { logger.warning(`获取 MV 信息失败: ${e}`); return ''; }),
  ]);
  if (!res1 || !res1.audio_info) throw new FailedException('获取歌曲信息失败，请检查歌曲是否存在');
  const audio = res1.audio_info;
  const fileInfo: Record<string, { hash: string; size: string }> = {};
  for (const [quality, field] of Object.entries(QUALITY_HASH_MAP)) {
    if (quality !== 'master' && audio[field]) {
      fileInfo[quality] = { hash: audio[field], size: sizeFormat(Number(audio[field.replace('hash', 'filesize')]) || 0) };
    }
  }
  const length = Number(audio.timelength) / 1000;
  const cover = String(res1.album_info?.sizable_cover || '');
  return {
    name: res1.songname,
    name_ori: res1.ori_audio_name,
    name_extra: String(res1.songname || '').replace(String(res1.ori_audio_name || ''), '').trim(),
    singer: res1.author_name,
    singer_list: singers,
    format_length: timeLengthFormat(length),
    length,
    hash: audio.hash,
    file_info: fileInfo,
    songmid: res1.audio_id,
    album_id: res1.album_info?.album_id,
    album: res1.album_info?.album_name,
    bpm: Number(res1.bpm) || 0,
    language: res1.language,
    cover: cover.replace('{size}', '1080'),
    sizable_cover: cover,
    publish_date: res1.publish_date,
    mvid,
    genre: [],
  };
}

export async function mv(ctx: AppContext, mvhash: string) {
  const [detail, playInfo] = await Promise.all([getMvInfo(ctx, mvhash), getMvPlayURL(ctx, mvhash)]);
  return { ...detail, play_info: playInfo };
}

/** /search/kg/song?query=…&page=1&size=20 */
export async function search(ctx: AppContext, type: string, query: URLSearchParams) {
  if (type !== 'song') throw new FailedException('暂不支持该类型搜索');
  const keyword = (query.get('query') || '').trim();
  if (!keyword) throw new FailedException('缺少搜索关键词(query)');
  const page = Math.max(1, Math.min(Number.parseInt(query.get('page') || '1', 10) || 1, 1000));
  const size = Math.max(1, Math.min(Number.parseInt(query.get('size') || '20', 10) || 20, 100));
  return getSongSearchResult(ctx, keyword, page, size);
}
