// QQ 音乐：歌词。请求加密的 QRC(逐字)歌词、翻译和罗马音，解密后转换成 LX Music 使用的格式

import type { AppContext } from '../../lib/context';
import { FailedException } from '../../lib/errors';
import type { LyricResult } from '../common';
import { getMusicInfo } from './musicInfo';
import { qdesDecrypt } from './qdes';
import { signRequest } from './utils';

const LINE_TIME = /^\[(\d+),\d+\]/;
const LINE_TIME2 = /^\[([\d:.]+)\]/;
const WORD_TIME = /\(\d+,\d+\)/;
const WORD_TIME_ALL = /\(\d+,\d+\)/g;

function msFormat(timeMs: number): string {
  if (Number.isNaN(timeMs)) return '';
  const ms = timeMs % 1000;
  const total = Math.floor(timeMs / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `[${m}:${s}.${String(ms).padStart(3, '0')}]`;
}

/** QRC 主歌词 → 普通 LRC(lyric) + 逐字歌词(lxlyric) */
export function parseLyric(lrc: string): { lyric: string; lxlyric: string } {
  lrc = lrc.trim().replace(/\r/g, '');
  if (!lrc) return { lyric: '', lxlyric: '' };
  const lxlrcLines: string[] = [];
  const lrcLines: string[] = [];
  for (let line of lrc.split('\n')) {
    line = line.trim();
    const result = LINE_TIME.exec(line);
    if (!result) {
      if (line.startsWith('[offset')) {
        lxlrcLines.push(line);
        lrcLines.push(line);
      }
      if (LINE_TIME2.test(line)) lrcLines.push(line);
      continue;
    }
    const startMsTime = parseInt(result[1], 10);
    const startTimeStr = msFormat(startMsTime);
    if (!startTimeStr) continue;
    const words = line.replace(LINE_TIME, '');
    lrcLines.push(`${startTimeStr}${words.replace(WORD_TIME_ALL, '')}`);
    const times = words.match(WORD_TIME_ALL);
    if (!times) continue;
    const marks = times.map((time) => {
      const [, start, duration] = /\((\d+),(\d+)\)/.exec(time)!;
      return `<${Math.max(parseInt(start, 10) - startMsTime, 0)},${duration}>`;
    });
    const wordArr = words.split(WORD_TIME);
    lxlrcLines.push(`${startTimeStr}${marks.map((mark, index) => `${mark}${wordArr[index]}`).join('')}`);
  }
  return { lyric: lrcLines.join('\n'), lxlyric: lxlrcLines.join('\n') };
}

/** QRC 罗马音 → LRC */
export function parseRlyric(lrc: string): string {
  lrc = lrc.trim().replace(/\r/g, '');
  if (!lrc) return '';
  const lines: string[] = [];
  for (let line of lrc.split('\n')) {
    line = line.trim();
    const result = LINE_TIME.exec(line);
    if (!result) continue;
    const startTimeStr = msFormat(parseInt(result[1], 10));
    if (!startTimeStr) continue;
    lines.push(`${startTimeStr}${line.replace(LINE_TIME, '').replace(WORD_TIME_ALL, '')}`);
  }
  return lines.join('\n');
}

/** 去掉 QRC 外层的 XML，只保留 LyricContent 的内容 */
export function removeTag(text: string): string {
  return text.replace(/^[\s\S]*?LyricContent="/, '').replace(/"\/>[\s\S]*$/, '');
}

function getIntv(interval: string): number {
  if (!interval) return 0;
  if (!interval.includes('.')) interval += '.0';
  const arr = interval.split(/[:.]/);
  while (arr.length < 3) arr.unshift('0');
  const [m, s, ms] = arr;
  return parseInt(m, 10) * 3600000 + parseInt(s, 10) * 1000 + parseInt(ms, 10);
}

/** 把罗马音 / 翻译的时间标签对齐到主歌词上 */
function fixTimeTag(lines: string, lrc: string, padMs: boolean): string {
  const lrcLines = lrc.split('\n');
  const result: string[] = [];
  for (const line of lines.split('\n')) {
    const match = LINE_TIME2.exec(line);
    if (!match) continue;
    const words = line.replace(LINE_TIME2, '');
    if (!words.trim()) continue;
    let time = match[1];
    if (padMs && time.includes('.')) time += '0'.repeat(Math.max(0, 3 - time.split('.')[1].length));
    const t1 = getIntv(time);
    while (lrcLines.length) {
      const lrcLine = lrcLines.shift()!;
      const lrcMatch = LINE_TIME2.exec(lrcLine);
      if (!lrcMatch) continue;
      if (Math.abs(t1 - getIntv(lrcMatch[1])) < 100) {
        result.push(lrcMatch[0] + words);
        break;
      }
    }
  }
  return result.join('\n');
}

export function parse(lrc: string, tlrc = '', rlrc = ''): LyricResult {
  const info: LyricResult = { lyric: '', tlyric: '', rlyric: '', lxlyric: '' };
  if (lrc) {
    const parsed = parseLyric(removeTag(lrc));
    info.lyric = parsed.lyric;
    info.lxlyric = parsed.lxlyric;
  }
  if (rlrc) info.rlyric = fixTimeTag(parseRlyric(removeTag(rlrc)), info.lyric, false);
  if (tlrc) info.tlyric = fixTimeTag(tlrc, info.lyric, true);
  return info;
}

export async function getLyric(ctx: AppContext, songId: string): Promise<LyricResult> {
  let numericId: number;
  if (/^[0-9]+$/.test(songId)) {
    numericId = parseInt(songId, 10);
  } else {
    let info: Record<string, any>;
    try {
      info = await getMusicInfo(ctx, songId);
    } catch {
      throw new FailedException('歌曲信息获取失败');
    }
    numericId = info.track_info.id;
  }
  const resp = await signRequest(ctx, {
    comm: { ct: '19', cv: '1859', uin: '0' },
    req: {
      method: 'GetPlayLyricInfo',
      module: 'music.musichallSong.PlayLyricInfo',
      param: {
        format: 'json',
        crypt: 1,
        ct: 19,
        cv: 1873,
        interval: 0,
        lrc_t: 0,
        qrc: 1,
        qrc_t: 0,
        roma: 1,
        roma_t: 0,
        songID: numericId,
        trans: 1,
        trans_t: 0,
        type: -1,
      },
    },
  });
  const body = resp.jsonOrNull();
  if (!body || body.code !== 0 || body.req?.code !== 0) throw new FailedException('歌词获取失败');
  const data = body.req.data || {};
  const l = String(data.lyric || '');
  const t = String(data.trans || '');
  const r = String(data.roma || '');
  if (!l) throw new FailedException('歌词获取失败: 当前歌曲无歌词');
  if (l.startsWith('789C') && l.length < 200) throw new FailedException('纯音乐短歌词不受支持');
  try {
    return parse(qdesDecrypt(l), t ? qdesDecrypt(t) : '', r ? qdesDecrypt(r) : '');
  } catch (e) {
    if (e instanceof FailedException) throw e;
    throw new FailedException('歌词解密失败');
  }
}
