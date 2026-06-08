import { HttpClient } from '../../lib/http';
import type { TXConfig } from './types';
import { buildSignedRequest } from './sign';
import type { LyricResult } from '../../types/music';

export async function getLyric(
  songId: string,
  userInfo: TXConfig,
  http: HttpClient
): Promise<LyricResult> {
  const requestBody = {
    comm: {
      ct: 19,
      cv: 1859,
      uin: userInfo.uin
    },
    req: {
      method: 'GetPlayLyricInfo',
      module: 'music.musichallSong.PlayLyricInfo',
      param: {
        songID: parseInt(songId),
        songType: 0
      }
    }
  };

  const url = buildSignedRequest(requestBody);

  const response = await http.post(url, {
    headers: {
      'Content-Type': 'application/json',
      'Referer': 'https://y.qq.com/'
    },
    body: JSON.stringify(requestBody),
    cache: 259200 // 3天缓存
  });

  const data: any = await response.json();

  if (data.code !== 0 || !data.req?.data) {
    throw new Error('获取歌词失败');
  }

  const lyricData = data.req.data;

  return {
    lyric: lyricData.lyric || '',
    tlyric: lyricData.trans || ''
  };
}
