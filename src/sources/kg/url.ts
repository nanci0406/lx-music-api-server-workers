import { HttpClient } from '../../lib/http';
import type { KGConfig, KGMusicInfo } from './types';
import { KG_CLIENT_CONFIG, KG_QUALITY_HASH_MAP } from './types';
import { getKey, signRequest } from './encrypt';
import { getMusicInfo } from './info';
import type { URLResult, Quality } from '../../types/music';

export async function getUrl(
  songId: string,
  quality: Quality,
  userInfo: KGConfig,
  http: HttpClient
): Promise<URLResult> {
  // 转换为小写
  songId = songId.toLowerCase();

  console.log('酷狗 getUrl:', { songId, quality });

  // 获取歌曲信息
  const musicInfo = await getMusicInfo(songId, userInfo, http);

  console.log('酷狗歌曲信息:', {
    songname: musicInfo.songname,
    hash_320: musicInfo.audio_info?.hash_320?.substring(0, 20)
  });

  // 获取对应音质的 hash
  const hashKey = KG_QUALITY_HASH_MAP[quality];
  if (!hashKey) {
    throw new Error('不支持的音质');
  }

  const hash = (musicInfo.audio_info as any)[hashKey];
  if (!hash) {
    throw new Error('该音质不可用');
  }

  console.log('酷狗音质 hash:', { quality, hashKey, hash: hash.substring(0, 20) });

  const albumId = musicInfo.album_info?.album_id || '';
  const albumAudioId = musicInfo.audio_id || '';

  // 构建请求参数
  const params = {
    album_id: albumId,
    userid: userInfo.userid,
    area_code: 1,
    hash: hash.toLowerCase(),
    module: '',
    mid: userInfo.mid,
    appid: KG_CLIENT_CONFIG.appid,
    ssa_flag: 'is_fromtrack',
    clientver: KG_CLIENT_CONFIG.clientver,
    open_time: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    vipType: 6,
    ptype: 0,
    token: userInfo.token,
    auth: '',
    mtype: 0,
    album_audio_id: albumAudioId,
    behavior: 'play',
    clienttime: Math.floor(Date.now() / 1000),
    pid: KG_CLIENT_CONFIG.pid,
    key: getKey(hash, userInfo),
    dfid: '-',
    pidversion: 3001
  };

  // v5 版本需要添加 quality 参数
  const finalParams: any = { ...params };
  if (KG_CLIENT_CONFIG.tracker.version === 'v5') {
    // Python 版本的 qualityMap
    const qualityMap: Record<string, string> = {
      '128k': '128',
      '320k': '320',
      'flac': 'flac',
      'flac24bit': 'high'
    };
    finalParams['quality'] = qualityMap[quality] || '320';
  }

  console.log('酷狗 URL 请求参数:', {
    hash: finalParams.hash.substring(0, 20),
    quality: finalParams.quality,
    pid: finalParams.pid
  });

  // 发送签名请求
  const requestUrl = `${KG_CLIENT_CONFIG.tracker.host}${KG_CLIENT_CONFIG.tracker.path}`;
  console.log('酷狗 URL 请求地址:', requestUrl);

  const response = await signRequest(requestUrl, finalParams);

  console.log('酷狗 URL 响应状态:', response.status);

  const responseText = await response.text();
  console.log('酷狗 URL 响应长度:', responseText.length);
  console.log('酷狗 URL 响应内容:', responseText.substring(0, 200));

  const data: any = JSON.parse(responseText);

  console.log('酷狗 URL 响应解析:', { status: data.status, hasUrl: !!data.url, urlLength: data.url?.length });

  // 检查响应状态
  if (data.status === 3) {
    throw new Error('该歌曲在酷狗没有版权，请换源播放');
  } else if (data.status === 2) {
    throw new Error('链接获取失败，请检查账号是否有会员或数字专辑是否购买');
  } else if (data.status !== 1) {
    throw new Error('链接获取失败，可能是数字专辑或者api失效');
  }

  if (!data.url || !Array.isArray(data.url) || data.url.length === 0) {
    throw new Error('未获取到播放链接');
  }

  return {
    url: data.url[0],
    quality
  };
}
