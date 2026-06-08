import { HttpClient } from '../../lib/http';
import type { KGConfig, KGMusicInfo } from './types';
import { KG_CLIENT_CONFIG } from './types';
import { sign } from './encrypt';

export async function getMusicInfo(
  songId: string,
  userInfo: KGConfig,
  http: HttpClient
): Promise<KGMusicInfo> {
  const url = 'http://gateway.kugou.com/v3/album_audio/audio';
  const clienttime = Math.floor(Date.now() / 1000);

  console.log('酷狗 getMusicInfo:', { songId, userid: userInfo.userid, mid: userInfo.mid });

  // 构建请求体（Python 版本的方式）
  const requestBody = {
    area_code: '1',
    show_privilege: '1',
    show_album_info: '1',
    is_publish: '',
    appid: KG_CLIENT_CONFIG.appid,
    clientver: KG_CLIENT_CONFIG.clientver,
    mid: userInfo.mid,
    dfid: '-',
    clienttime: clienttime,
    key: KG_CLIENT_CONFIG.signatureKey,
    data: [
      {
        hash: songId.toLowerCase()
      }
    ]
  };

  console.log('酷狗请求 URL:', url);
  console.log('酷狗请求 Body:', JSON.stringify(requestBody).substring(0, 200));

  const response = await http.post(url, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Android712-AndroidPhone-11451-376-0-FeeCacheUpdate-wifi',
      'KG-THash': '13a3164',
      'KG-RC': '1',
      'KG-Fake': '0',
      'KG-RF': '00869891',
      'x-router': 'kmr.service.kugou.com'
    },
    body: requestBody,
    cache: 2592000
  });

  console.log('酷狗响应状态:', response.status);

  const responseText = await response.text();
  console.log('酷狗响应长度:', responseText.length);
  console.log('酷狗响应内容:', responseText.substring(0, 200));

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error('酷狗音乐 JSON 解析失败');
    throw new Error(`酷狗 API 返回非 JSON 内容: ${responseText.substring(0, 100)}`);
  }

  console.log('酷狗响应解析:', { hasData: !!data.data, dataLength: data.data?.length });

  if (!data.data || !data.data[0] || !data.data[0][0]) {
    throw new Error('获取歌曲信息失败');
  }

  return data.data[0][0];
}
