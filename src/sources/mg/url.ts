import { HttpClient } from '../../lib/http';
import type { MGConfig } from './types';
import { MG_QUALITY_MAP, MG_QUALITY_MAP_REVERSE } from './types';
import type { URLResult, Quality } from '../../types/music';

export async function getUrl(
  songId: string,
  quality: Quality,
  userInfo: MGConfig,
  http: HttpClient
): Promise<URLResult> {
  // 步骤1: 获取资源信息
  const infoUrl = `http://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/resourceinfo.do?resourceType=2&copyrightId=${songId}`;

  const infoResponse = await http.post(infoUrl, {
    cache: 259200 // 3天缓存
  });

  const infoData: any = await infoResponse.json();

  if (infoData.code !== '000000' || !infoData.resource || infoData.resource.length === 0) {
    throw new Error('获取资源信息失败');
  }

  const copyrightId = infoData.resource[0].copyrightId;

  // 步骤2: 获取播放链接
  const playUrl = `https://m.music.migu.cn/migumusic/h5/play/auth/getSongPlayInfo`;

  const params = new URLSearchParams({
    type: MG_QUALITY_MAP[quality] || '2',
    copyrightId
  });

  const playResponse = await http.get(`${playUrl}?${params}`, {
    headers: {
      'User-Agent': userInfo.useragent || 'Mozilla/5.0',
      'by': userInfo.by,
      'Cookie': `SESSION=${userInfo.session}`,
      'Referer': 'https://m.music.migu.cn/v4/',
      'Origin': 'https://m.music.migu.cn'
    }
  });

  const playData: any = await playResponse.json();

  if (parseInt(playData.code) !== 200 || !playData.data?.playUrl) {
    throw new Error(playData.msg || '获取播放链接失败');
  }

  let url = playData.data.playUrl.split('?')[0];
  if (!url.startsWith('http')) {
    url = 'http:' + url;
  }

  const formatId = playData.data.formatId;
  const resultQuality = MG_QUALITY_MAP_REVERSE[formatId] || quality;

  return {
    url,
    quality: resultQuality as Quality
  };
}
