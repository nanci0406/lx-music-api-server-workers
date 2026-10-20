import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes, utf8Encode } from '../src/lib/crypto';
import { desCryptBlock, keySchedule, lyricDecode } from '../src/sources/tx/qdes';

// 向量由 Python 版依赖的原生实现(deps/pyqdes/des.cpp)编译后生成：原文 / KEY2 加密结果 / LyricDecode 结果
const vectors = readFileSync('test/fixtures/qdes-vectors.txt', 'utf8')
  .trim().split('\n').map((line) => line.split(' '));

describe('qdes', () => {
  it('单次加密与原生实现一致', () => {
    const schedule = keySchedule(utf8Encode('123ZXC!@#)(*$%^&'), false);
    for (const [plain, encrypted] of vectors) {
      const data = hexToBytes(plain);
      for (let i = 0; i < data.length; i += 8) desCryptBlock(data.subarray(i, i + 8), schedule);
      expect(bytesToHex(data)).toBe(encrypted);
    }
  });

  it('LyricDecode 与原生实现一致', () => {
    for (const [plain, , decoded] of vectors) {
      expect(bytesToHex(lyricDecode(hexToBytes(plain)))).toBe(decoded);
    }
  });

  it('加密后解密得到原文', () => {
    const data = hexToBytes('0011223344556677');
    desCryptBlock(data, keySchedule(utf8Encode('abcdefgh'), false));
    desCryptBlock(data, keySchedule(utf8Encode('abcdefgh'), true));
    expect(bytesToHex(data)).toBe('0011223344556677');
  });
});
