import { HttpClient } from '../../lib/http';
import type { WYConfig } from './types';
import { WY_QUALITY_MAP, WY_QUALITY_MAP_REVERSE } from './types';
import { eapiEncrypt } from './encrypt';
import type { URLResult, Quality } from '../../types/music';

export async function getUrl(
  songId: string,
  quality: Quality,
  userInfo: WYConfig,
  http: HttpClient
): Promise<URLResult> {
  const path = '/api/song/enhance/player/url/v1';
  const requestUrl = 'https://interface.music.163.com/eapi/song/enhance/player/url/v1';

  const requestBody = {
    ids: JSON.stringify([songId]),
    level: WY_QUALITY_MAP[quality] || 'exhigh',
    encodeType: 'flac'
  };

  // Sky 音质需要额外参数
  const finalBody: any = { ...requestBody };
  if (quality === 'sky') {
    finalBody['immerseType'] = 'c51';
  }

  // EAPI 加密
  const encrypted = eapiEncrypt(path, JSON.stringify(finalBody));

  console.log('网易云请求信息:', {
    url: requestUrl,
    encryptedKeys: Object.keys(encrypted),
    cookieLength: userInfo.cookie.length
  });

  // Python 版本直接拼接 form 字符串，不进行 URL 编码
  // 不使用 URLSearchParams，因为它会进行 URL 编码
  const formBody = Object.entries(encrypted)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  console.log('网易云 Form Body 长度:', formBody.length);
  console.log('网易云 Form Body (前50字符):', formBody.substring(0, 50));

  // 使用原生 fetch
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': userInfo.cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'X-Forwarded-For': '116.25.146.177'  // 伪装国内 IP
    },
    body: formBody
  });

  // 详细日志
  console.log('网易云 API 响应状态:', response.status);
  console.log('网易云 API 响应头:', Object.fromEntries(response.headers.entries()));

  const responseText = await response.text();
  console.log('网易云 API 响应长度:', responseText.length);
  console.log('网易云 API 响应内容 (前200字符):', responseText.substring(0, 200));

  if (!responseText || responseText.trim().length === 0) {
    throw new Error('网易云 API 返回空响应');
  }

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error('❌ JSON 解析失败:', e);
    console.error('完整响应:', responseText);
    throw new Error('网易云 API 返回非 JSON 内容');
  }

  if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
    throw new Error('获取播放链接失败');
  }

  const songData = data.data[0];

  if (!songData.url) {
    throw new Error('该歌曲无法播放');
  }

  // 检查音质是否匹配
  if (songData.level !== WY_QUALITY_MAP[quality]) {
    throw new Error('音质不匹配');
  }

  return {
    url: songData.url.split('?')[0],
    quality: WY_QUALITY_MAP_REVERSE[songData.level] as Quality
  };
}
