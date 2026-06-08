import { HttpClient } from '../../lib/http';
import type { TXConfig, TXMusicInfo } from './types';
import { buildSignedRequest } from './sign';

export async function getMusicInfo(
  songId: string,
  userInfo: TXConfig,
  http: HttpClient
): Promise<TXMusicInfo> {
  const requestBody = {
    comm: {
      ct: '19',
      cv: '1859',
      uin: '0'
    },
    req: {
      module: 'music.pf_song_detail_svr',
      method: 'get_song_detail_yqq',
      param: {
        song_type: 0,
        song_mid: songId
      }
    }
  };

  const url = buildSignedRequest(requestBody);

  const response = await http.post(url, {
    headers: {
      'X-Forwarded-For': '116.25.146.177'
    },
    body: JSON.stringify(requestBody),
    cache: 2592000
  });

  const responseText = await response.text();

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error('QQ音乐 JSON 解析失败:', e);
    throw new Error('QQ音乐 API 返回非 JSON 内容');
  }

  // 检查响应
  if (data.code !== 0) {
    throw new Error(`QQ音乐 API 错误 (code: ${data.code})`);
  }

  if (data.req?.code !== 0) {
    throw new Error(`获取歌曲信息失败 (req.code: ${data.req.code})`);
  }

  if (!data.req?.data?.track_info) {
    throw new Error('响应中没有 track_info');
  }

  return data.req.data;
}
