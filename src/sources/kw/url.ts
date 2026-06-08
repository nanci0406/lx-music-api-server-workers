import { HttpClient } from '../../lib/http';
import type { KWConfig } from './types';
import { KW_QUALITY_MAP, KW_EXT_MAP, KW_QUALITY_MAP_REVERSE } from './types';
import type { URLResult, Quality } from '../../types/music';

export async function getUrl(
  songId: string,
  quality: Quality,
  userInfo: KWConfig,
  http: HttpClient
): Promise<URLResult> {
  const targetUrl = `https://bd-api.kuwo.cn/api/service/music/downloadInfo/${songId}`;

  const params = new URLSearchParams({
    isMv: '0',
    format: KW_EXT_MAP[quality] || 'mp3',
    br: KW_QUALITY_MAP[quality] || '320kmp3',
    uid: userInfo.uid,
    token: userInfo.token
  });

  const response = await http.get(`${targetUrl}?${params}`, {
    headers: {
      'User-Agent': 'Dart/2.14 (dart:io)',
      'channel': 'qq',
      'plat': 'ar',
      'net': 'wifi',
      'ver': '3.1.2',
      'uid': userInfo.uid,
      'devId': userInfo.device_id
    }
  });

  const data: any = await response.json();

  if (data.code !== 200 || !data.data?.url) {
    throw new Error('获取播放链接失败');
  }

  const bitrate = parseInt(data.data.audioInfo?.bitrate || '0');

  if (bitrate === 1) {
    throw new Error('该音质不可用');
  }

  return {
    url: data.data.url.split('?')[0],
    quality: (KW_QUALITY_MAP_REVERSE[bitrate] || quality) as Quality
  };
}
