// 酷狗：歌词(KRC 解密与解析，输出 LX Music 使用的 lyric / tlyric / rlyric / lxlyric)

import type { AppContext } from '../../lib/context';
import { base64Decode, base64ToBytes, inflate, utf8Decode } from '../../lib/crypto';
import { FailedException } from '../../lib/errors';
import { request } from '../../lib/http';
import { buildQuery } from '../../lib/utils';
import type { LyricResult } from '../common';
import { getMusicInfo } from './musicInfo';

const KRC_KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];

export function krcDecode(data: Uint8Array): string {
  const content = data.subarray(4); // 去掉 "krc1" 头
  const xored = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) xored[i] = content[i] ^ KRC_KEY[i % KRC_KEY.length];
  return utf8Decode(inflate(xored));
}

function formatTime(ms: number): string {
  const m = String(Math.floor(ms / 1000 / 60)).padStart(2, '0');
  const s = String(Math.floor((ms / 1000) % 60)).padStart(2, '0');
  // 毫秒不补零，与 LX Music 自己的酷狗歌词解析保持一致
  return `${m}:${s}.${ms % 1000}`;
}

/** 解析解密后的 KRC 文本 */
export function parseKrc(text: string): LyricResult {
  let string = text.replace(/\r/g, '');
  const head = /^.*\[id:\$\w+\]\n/;
  if (head.test(string)) string = string.replace(head, '');

  let rlyric: unknown[] | null = null;
  let tlyric: unknown[] | null = null;
  const trans = string.match(/\[language:([\w=\\/+]+)\]/);
  if (trans) {
    string = string.replace(/\[language:[\w=\\/+]+\]\n/g, '');
    try {
      const transJson = JSON.parse(base64Decode(trans[1]));
      for (const item of transJson.content || []) {
        if (item.type === 0) rlyric = item.lyricContent;
        else if (item.type === 1) tlyric = item.lyricContent;
      }
    } catch {
      // 翻译数据损坏时只返回原文
    }
  }

  const rLines: string[] = [];
  const tLines: string[] = [];
  let index = 0;
  let lxlyric = string.replace(/\[((\d+),\d+)\].*/g, (line, tag: string, start: string) => {
    const time = formatTime(parseInt(start, 10));
    if (tlyric && index < tlyric.length) {
      const words = tlyric[index];
      const textLine = Array.isArray(words) ? words.join('') : String(words ?? '');
      tLines.push(`[${time}]${textLine}`);
    }
    if (rlyric && index < rlyric.length) {
      const words = Array.isArray(rlyric[index]) ? (rlyric[index] as unknown[]).map(String) : [String(rlyric[index] ?? '')];
      const joined = words.join('');
      const textLine = joined.includes(' ') ? joined : words.map((w) => w.trim()).join(' ');
      rLines.push(`[${time}]${textLine}`.replace(/ {2}/g, ' '));
    }
    index += 1;
    return line.replace(tag, time);
  });
  lxlyric = lxlyric.replace(/<(\d+,\d+),\d+>/g, '<$1>');
  const lyric = lxlyric.replace(/<\d+,\d+>/g, '');
  return {
    lyric,
    tlyric: tLines.join('\n'),
    rlyric: rLines.join('\n'),
    lxlyric,
  };
}

export async function lyricSearchByHash(ctx: AppContext, hash: string): Promise<any[]> {
  const info = await getMusicInfo(ctx, hash);
  if (!info || !info.audio_info) throw new FailedException('歌曲信息获取失败');
  const timelength = Math.floor(Number(info.audio_info.timelength) / 1000);
  const resp = await request(ctx, 'https://lyrics.kugou.com/search?' + buildQuery({
    ver: 1, man: 'yes', client: 'pc', keyword: info.songname || '', hash: info.audio_info.hash, timelength,
  }));
  const body = resp.jsonOrNull();
  if (!body || body.status !== 200) throw new FailedException('歌词获取失败');
  if (!Array.isArray(body.candidates) || !body.candidates.length) throw new FailedException('歌词获取失败: 当前歌曲无歌词');
  return body.candidates;
}

export async function getLyric(ctx: AppContext, id: string, accesskey: string): Promise<LyricResult> {
  const resp = await request(ctx, 'https://lyrics.kugou.com/download?' + buildQuery({
    ver: 1, client: 'pc', id, accesskey, fmt: 'krc', charset: 'utf8',
  }));
  const body = resp.jsonOrNull();
  if (!body || body.status !== 200 || body.error_code !== 0 || !body.content) throw new FailedException('歌词获取失败');
  let text: string;
  try {
    text = krcDecode(base64ToBytes(body.content));
  } catch {
    throw new FailedException('歌词解密失败');
  }
  return parseKrc(text);
}

export async function lyric(ctx: AppContext, hash: string): Promise<LyricResult> {
  const candidates = await lyricSearchByHash(ctx, hash);
  const chosen = candidates[0];
  return getLyric(ctx, String(chosen.id), String(chosen.accesskey));
}
