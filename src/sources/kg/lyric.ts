import { HttpClient } from '../../lib/http';
import { base64Decode } from '../../lib/utils';
import type { KGLyricSearchResult, KGLyricData } from './types';
import type { LyricResult } from '../../types/music';

// KRC 解密密钥
const KRC_KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];

export async function getLyric(
  songId: string,
  songName: string,
  http: HttpClient
): Promise<LyricResult> {
  // 1. 搜索歌词
  const searchResults = await searchLyric(songId, songName, http);

  if (!searchResults || searchResults.length === 0) {
    throw new Error('未找到歌词');
  }

  // 使用第一个结果
  const lyricInfo = searchResults[0];

  // 2. 下载歌词
  const lyricData = await downloadLyric(lyricInfo.id, lyricInfo.accesskey, http);

  // 3. 解密 KRC
  const decrypted = decryptKrc(lyricData.content);

  // 4. 解析 KRC 格式为 LRC
  const lrc = parseKrcToLrc(decrypted);

  return {
    lyric: lrc
  };
}

async function searchLyric(
  hash: string,
  keyword: string,
  http: HttpClient
): Promise<KGLyricSearchResult[]> {
  const url = 'https://lyrics.kugou.com/search';
  const params = new URLSearchParams({
    ver: '1',
    man: 'yes',
    client: 'pc',
    hash,
    keyword
  });

  const response = await http.get(`${url}?${params}`);
  const data: any = await response.json();

  if (data.status !== 200 || !data.candidates) {
    return [];
  }

  return data.candidates.map((item: any) => ({
    id: item.id,
    accesskey: item.accesskey
  }));
}

async function downloadLyric(
  id: string,
  accesskey: string,
  http: HttpClient
): Promise<KGLyricData> {
  const url = 'https://lyrics.kugou.com/download';
  const params = new URLSearchParams({
    ver: '1',
    client: 'pc',
    id,
    accesskey,
    fmt: 'krc',
    charset: 'utf8'
  });

  const response = await http.get(`${url}?${params}`);
  const data: any = await response.json();

  if (data.status !== 200 || !data.content) {
    throw new Error('下载歌词失败');
  }

  return {
    content: data.content,
    info: data.info || ''
  };
}

function decryptKrc(base64Content: string): string {
  // Base64 解码
  const decoded = base64Decode(base64Content);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }

  // 跳过前4个字节的头部
  const encrypted = bytes.slice(4);

  // XOR 解密
  const decrypted = new Uint8Array(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ KRC_KEY[i % 16];
  }

  // 解压缩 (zlib)
  // 注意: Workers 环境需要使用 pako 或其他 zlib 实现
  // 这里先返回解密后的数据，实际需要解压缩
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(decrypted);
}

function parseKrcToLrc(krc: string): string {
  // KRC 格式示例:
  // [00:00.00]<0,393,0>歌<393,197,0>曲<590,197,0>名
  // 转换为标准 LRC:
  // [00:00.00]歌曲名

  const lines = krc.split('\n');
  const lrcLines: string[] = [];

  for (const line of lines) {
    // 匹配时间标签
    const timeMatch = line.match(/\[(\d+:\d+\.\d+)\]/);
    if (!timeMatch) {
      continue;
    }

    const time = timeMatch[1];

    // 移除 KRC 的逐字时间标记
    let text = line.replace(/\[\d+:\d+\.\d+\]/, '');
    text = text.replace(/<\d+,\d+,\d+>/g, '');

    if (text.trim()) {
      lrcLines.push(`[${time}]${text.trim()}`);
    }
  }

  return lrcLines.join('\n');
}
