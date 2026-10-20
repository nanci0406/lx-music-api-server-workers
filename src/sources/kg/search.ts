// 酷狗：歌曲搜索

import type { AppContext } from '../../lib/context';
import { FailedException } from '../../lib/errors';
import { request } from '../../lib/http';
import { buildQuery, sizeFormat, timeLengthFormat } from '../../lib/utils';

function fileInfo(song: any): Record<string, { hash: string; size: string }> {
  const info: Record<string, { hash: string; size: string }> = {};
  const add = (quality: string, hash: string, size: number) => {
    if (size) info[quality] = { hash, size: sizeFormat(size) };
  };
  add('128k', song.FileHash, song.FileSize);
  add('320k', song.HQFileHash, song.HQFileSize);
  add('flac', song.SQFileHash, song.SQFileSize);
  add('flac24bit', song.ResFileHash, song.ResFileSize);
  return info;
}

function formatSong(song: any, withSub: boolean): Record<string, unknown> {
  const image = String(song.Image || '');
  const result: Record<string, unknown> = {
    name: song.SongName,
    name_ori: song.OriSongName,
    name_extra: String(song.SongName || '').replace(String(song.OriSongName || ''), ''),
    singer: song.SingerName,
    singer_list: (song.Singers || []).map((s: any) => ({ name: s.name, id: s.id })),
    isoriginal: song.IsOriginal === 1,
    tag: song.TagContent || '',
    format_length: timeLengthFormat(song.Duration),
    length: song.Duration,
    hash: song.FileHash,
    file_info: fileInfo(song),
    songmid: song.Audioid,
    album_id: song.AlbumID,
    album: song.AlbumName,
    language: song.trans_param?.language || '',
    cover: image.replace('{size}', '1080'),
    sizable_cover: image,
    mvid: song.MvHash,
  };
  if (withSub) result.subresult = Array.isArray(song.Grp) ? song.Grp.map((s: any) => formatSong(s, false)) : [];
  return result;
}

export async function getSongSearchResult(ctx: AppContext, query: string, page = 1, size = 20) {
  const resp = await request(ctx, 'https://songsearch.kugou.com/song_search_v2?' + buildQuery({
    keyword: query,
    page,
    pagesize: size,
    area_code: 1,
    userid: 0,
    clientver: '',
    platform: 'WebFilter',
    filter: 2,
    iscorrection: 1,
    privilege_filter: 0,
  }), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.142.86 Safari/537.36',
      Referer: 'https://www.kugou.com',
    },
  });
  const body = resp.jsonOrNull();
  if (!body || body.status !== 1) throw new FailedException('歌曲搜索失败');
  const lists = body.data?.lists;
  if (!body.data?.total || !Array.isArray(lists) || !lists.length) return { total: 0, page, size, list: [] };
  return { total: body.data.total, page, size, list: lists.map((song: any) => formatSong(song, true)) };
}
