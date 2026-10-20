import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseKrc } from '../src/sources/kg/lyric';
import { parse } from '../src/sources/tx/lyric';
import { qdesDecrypt } from '../src/sources/tx/qdes';
import { base64Encode } from '../src/lib/crypto';

// tx-lyric-encrypted.json：QQ 音乐接口返回的加密歌词(晴天、Lemon，后者带翻译和罗马音)
// tx-lyric-expected.json：用 Python 版的 ParseTools 解析同一份歌词得到的结果
const encrypted = JSON.parse(readFileSync('test/fixtures/tx-lyric-encrypted.json', 'utf8'));
const expected = JSON.parse(readFileSync('test/fixtures/tx-lyric-expected.json', 'utf8'));

describe('QQ 音乐歌词', () => {
  for (const id of Object.keys(encrypted)) {
    it(`解密并解析的结果与 Python 版一致(${id})`, () => {
      const item = encrypted[id];
      const result = parse(qdesDecrypt(item.lyric), item.trans ? qdesDecrypt(item.trans) : '', item.roma ? qdesDecrypt(item.roma) : '');
      expect(result).toEqual(expected[id]);
    });
  }

  it('带翻译和罗马音的歌词都对齐到了主歌词的时间', () => {
    const result = expected['213086592'];
    expect(result.tlyric.split('\n').length).toBeGreaterThan(10);
    expect(result.rlyric.split('\n').length).toBeGreaterThan(10);
    expect(result.lxlyric).toMatch(/<\d+,\d+>/);
  });
});

describe('酷狗歌词', () => {
  it('解析 KRC：逐字时间、翻译、罗马音', () => {
    const language = base64Encode(JSON.stringify({
      content: [
        { type: 0, lyricContent: [['a', 'ka'], ['sa ', 'ta']] },
        { type: 1, lyricContent: [['第一句'], ['第二句']] },
      ],
    }));
    const krc = `[id:$00000000]\n[ar:歌手]\n[language:${language}]\n[1000,2000]<0,500,0>あ<500,500,0>か\n[3005,1000]<0,500,0>さ<500,500,0>た\n`;
    const result = parseKrc(krc);
    expect(result.lyric).toBe('[ar:歌手]\n[00:01.0]あか\n[00:03.5]さた\n');
    expect(result.lxlyric).toBe('[ar:歌手]\n[00:01.0]<0,500>あ<500,500>か\n[00:03.5]<0,500>さ<500,500>た\n');
    expect(result.tlyric).toBe('[00:01.0]第一句\n[00:03.5]第二句');
    expect(result.rlyric).toBe('[00:01.0]a ka\n[00:03.5]sa ta');
  });

  it('翻译行数比歌词少时不会出错', () => {
    const language = base64Encode(JSON.stringify({ content: [{ type: 1, lyricContent: [['只有一句']] }] }));
    const result = parseKrc(`[language:${language}]\n[0,1000]<0,1000,0>一\n[1000,1000]<0,1000,0>二`);
    expect(result.tlyric).toBe('[00:00.0]只有一句');
  });
});
