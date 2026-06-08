import { HttpClient } from '../../lib/http';
import type { SearchResult } from '../../types/music';
import { formatTime } from '../../lib/utils';

export async function search(
  keyword: string,
  page: number = 1,
  pageSize: number = 30,
  http: HttpClient
): Promise<SearchResult> {
  const url = 'https://songsearch.kugou.com/song_search_v2';

  const params = new URLSearchParams({
    keyword,
    page: page.toString(),
    pagesize: pageSize.toString(),
    userid: '0',
    clientver: '1000',
    platform: 'WebFilter',
    tag: 'em',
    filter: '2',
    iscorrection: '1',
    privilege_filter: '0',
    area_code: '1'
  });

  const response = await http.get(`${url}?${params}`, { cache: 3600 });
  const data: any = await response.json();

  if (data.status !== 1 || !data.data || !data.data.lists) {
    throw new Error('搜索失败');
  }

  const list = data.data.lists.map((item: any) => ({
    name: item.SongName,
    singer: item.SingerName,
    songmid: item.FileHash || item.EMixSongID,
    albumname: item.AlbumName,
    interval: item.Duration,
    albumId: item.AlbumID,
    hash_128: item.HQFileHash,
    hash_320: item.SQFileHash,
    hash_flac: item.HiFiQuality ? item.FileHash : '',
    hash_hires: ''
  }));

  return {
    list,
    total: data.data.total
  };
}
