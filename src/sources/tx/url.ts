import { HttpClient } from '../../lib/http';
import type { TXConfig } from './types';
import { TX_QUALITY_MAP, TX_FILE_EXT, TX_QUALITY_MAP_REVERSE } from './types';
import { buildSignedRequest } from './sign';
import { getMusicInfo } from './info';
import type { URLResult, Quality } from '../../types/music';

const CDN_ADDR = 'https://ws.stream.qqmusic.qq.com/';

export async function getUrl(
  songId: string,
  quality: Quality,
  userInfo: TXConfig,
  http: HttpClient
): Promise<URLResult> {
  // 获取歌曲信息
  const musicInfo = await getMusicInfo(songId, userInfo, http);
  const mediaMid = musicInfo.track_info.file.media_mid;

  if (!mediaMid) {
    throw new Error('未找到歌曲文件');
  }

  // 构建文件名
  const prefix = TX_QUALITY_MAP[quality];
  const ext = TX_FILE_EXT[quality];
  const filename = `${prefix}${mediaMid}${ext}`;

  // 构建请求
  const requestBody = {
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        filename: [filename],
        guid: '10000',
        songmid: [songId],
        songtype: [0],
        uin: userInfo.uin,
        loginflag: 1,
        platform: '20'
      }
    },
    comm: {
      qq: userInfo.uin,
      authst: userInfo.key,
      ct: '26',
      cv: '2010101',
      v: '2010101'
    }
  };

  const url = buildSignedRequest(requestBody);

  const response = await http.post(url, {
    headers: {
      'Content-Type': 'application/json',
      'Referer': 'https://y.qq.com/',
      'Cookie': `uin=${userInfo.uin}; qm_keyst=${userInfo.key}`
    },
    body: JSON.stringify(requestBody)
  });

  const data: any = await response.json();

  if (!data.req_0?.data?.midurlinfo?.[0]?.purl) {
    throw new Error('获取播放链接失败');
  }

  const purl = data.req_0.data.midurlinfo[0].purl;
  const resultFilename = data.req_0.data.midurlinfo[0].filename;

  // 解析实际音质
  const resultPrefix = resultFilename.split(mediaMid)[0];
  const resultQuality = TX_QUALITY_MAP_REVERSE[resultPrefix] || quality;

  return {
    url: CDN_ADDR + purl,
    quality: resultQuality as Quality
  };
}
