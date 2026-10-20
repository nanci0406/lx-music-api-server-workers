// QQ 音乐 QRC 歌词解密：移植自 Python 版依赖的 qdes 原生库(deps/pyqdes/des.cpp，Brad Conte 的 DES 实现)。
// QQ 音乐用的是改过的 DES：S 盒有两处与标准不同，取位时按小端 32 位字处理，这里逐位照搬，不能换成标准 DES。

import { hexToBytes, inflate, utf8Decode, utf8Encode } from '../../lib/crypto';

const SBOX = [
  [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
    0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
    4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
    15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
  [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
    3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5,
    0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
    13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
  [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
    13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
    13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
    1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
  [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
    13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
    10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
    3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
  [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
    14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
    4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
    11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
  [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
    10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
    9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
    4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
  [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
    13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
    1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
    6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
  [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
    1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
    7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
    2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11],
];

// 从字节数组左数第 b 位取出，放到右数第 c 位(按小端 32 位字取字节)
function bitnum(a: Uint8Array, b: number, c: number): number {
  return ((a[((b / 32) | 0) * 4 + 3 - (((b % 32) / 8) | 0)] >>> (7 - (b % 8))) & 1) << c;
}

// 从 32 位整数左数第 b 位取出，放到右数第 c 位
function bitnumIntR(a: number, b: number, c: number): number {
  return ((a >>> (31 - b)) & 1) << c;
}

// 从 32 位整数左数第 b 位取出，放到左数第 c 位
function bitnumIntL(a: number, b: number, c: number): number {
  return ((a << b) & 0x80000000) >>> c;
}

function sboxBit(a: number): number {
  return (a & 0x20) | ((a & 0x1f) >> 1) | ((a & 0x01) << 4);
}

const IP0 = [57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7];
const IP1 = [56, 48, 40, 32, 24, 16, 8, 0, 58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6];

function initialPermutation(input: Uint8Array): [number, number] {
  let s0 = 0;
  let s1 = 0;
  for (let i = 0; i < 32; i++) {
    s0 |= bitnum(input, IP0[i], 31 - i);
    s1 |= bitnum(input, IP1[i], 31 - i);
  }
  return [s0 >>> 0, s1 >>> 0];
}

function inverseInitialPermutation(s0: number, s1: number, out: Uint8Array): void {
  // out[3], out[2], out[1], out[0], out[7], out[6], out[5], out[4] 依次取位 7..0、6..、5..、4..、3..、2..、1..、0..
  const order = [3, 2, 1, 0, 7, 6, 5, 4];
  for (let k = 0; k < 8; k++) {
    const base = 7 - k;
    out[order[k]] = (bitnumIntR(s1, base, 7) | bitnumIntR(s0, base, 6) | bitnumIntR(s1, base + 8, 5) |
      bitnumIntR(s0, base + 8, 4) | bitnumIntR(s1, base + 16, 3) | bitnumIntR(s0, base + 16, 2) |
      bitnumIntR(s1, base + 24, 1) | bitnumIntR(s0, base + 24, 0)) & 0xff;
  }
}

const PBOX = [15, 6, 19, 20, 28, 11, 27, 16, 0, 14, 22, 25, 4, 17, 30, 9, 1, 7, 23, 13, 31, 26, 2, 8, 18, 12, 29, 5, 21, 10, 3, 24];

function f(state: number, key: Uint8Array): number {
  const t1 = (bitnumIntL(state, 31, 0) | ((state & 0xf0000000) >>> 1) | bitnumIntL(state, 4, 5) |
    bitnumIntL(state, 3, 6) | ((state & 0x0f000000) >>> 3) | bitnumIntL(state, 8, 11) |
    bitnumIntL(state, 7, 12) | ((state & 0x00f00000) >>> 5) | bitnumIntL(state, 12, 17) |
    bitnumIntL(state, 11, 18) | ((state & 0x000f0000) >>> 7) | bitnumIntL(state, 16, 23)) >>> 0;
  const t2 = (bitnumIntL(state, 15, 0) | ((state & 0x0000f000) << 15) | bitnumIntL(state, 20, 5) |
    bitnumIntL(state, 19, 6) | ((state & 0x00000f00) << 13) | bitnumIntL(state, 24, 11) |
    bitnumIntL(state, 23, 12) | ((state & 0x000000f0) << 11) | bitnumIntL(state, 28, 17) |
    bitnumIntL(state, 27, 18) | ((state & 0x0000000f) << 9) | bitnumIntL(state, 0, 23)) >>> 0;

  const l0 = ((t1 >>> 24) & 0xff) ^ key[0];
  const l1 = ((t1 >>> 16) & 0xff) ^ key[1];
  const l2 = ((t1 >>> 8) & 0xff) ^ key[2];
  const l3 = ((t2 >>> 24) & 0xff) ^ key[3];
  const l4 = ((t2 >>> 16) & 0xff) ^ key[4];
  const l5 = ((t2 >>> 8) & 0xff) ^ key[5];

  const s = ((SBOX[0][sboxBit(l0 >> 2)] << 28) |
    (SBOX[1][sboxBit(((l0 & 0x03) << 4) | (l1 >> 4))] << 24) |
    (SBOX[2][sboxBit(((l1 & 0x0f) << 2) | (l2 >> 6))] << 20) |
    (SBOX[3][sboxBit(l2 & 0x3f)] << 16) |
    (SBOX[4][sboxBit(l3 >> 2)] << 12) |
    (SBOX[5][sboxBit(((l3 & 0x03) << 4) | (l4 >> 4))] << 8) |
    (SBOX[6][sboxBit(((l4 & 0x0f) << 2) | (l5 >> 6))] << 4) |
    SBOX[7][sboxBit(l5 & 0x3f)]) >>> 0;

  let result = 0;
  for (let i = 0; i < 32; i++) result |= bitnumIntL(s, PBOX[i], i);
  return result >>> 0;
}

const KEY_RND_SHIFT = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
const KEY_PERM_C = [56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35];
const KEY_PERM_D = [62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3];
const KEY_COMPRESSION = [13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9, 22, 18, 11, 3, 25, 7, 15, 6, 26, 19, 12, 1,
  40, 51, 30, 36, 46, 54, 29, 39, 50, 44, 32, 47, 43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31];

export function keySchedule(key: Uint8Array, decrypt: boolean): Uint8Array[] {
  const schedule = Array.from({ length: 16 }, () => new Uint8Array(6));
  let c = 0;
  let d = 0;
  for (let i = 0, j = 31; i < 28; i++, j--) {
    c |= bitnum(key, KEY_PERM_C[i], j);
    d |= bitnum(key, KEY_PERM_D[i], j);
  }
  c >>>= 0;
  d >>>= 0;
  for (let i = 0; i < 16; i++) {
    const shift = KEY_RND_SHIFT[i];
    c = (((c << shift) | (c >>> (28 - shift))) & 0xfffffff0) >>> 0;
    d = (((d << shift) | (d >>> (28 - shift))) & 0xfffffff0) >>> 0;
    const target = schedule[decrypt ? 15 - i : i];
    for (let j = 0; j < 24; j++) target[(j / 8) | 0] |= bitnumIntR(c, KEY_COMPRESSION[j], 7 - (j % 8));
    for (let j = 24; j < 48; j++) target[(j / 8) | 0] |= bitnumIntR(d, KEY_COMPRESSION[j] - 27, 7 - (j % 8));
  }
  return schedule;
}

/** 原地加/解密一个 8 字节分组 */
export function desCryptBlock(block: Uint8Array, schedule: Uint8Array[]): void {
  let [s0, s1] = initialPermutation(block);
  for (let i = 0; i < 15; i++) {
    const t = s1;
    s1 = (f(s1, schedule[i]) ^ s0) >>> 0;
    s0 = t;
  }
  s0 = (f(s1, schedule[15]) ^ s0) >>> 0;
  inverseInitialPermutation(s0, s1, block);
}

function cryptAll(data: Uint8Array, key: Uint8Array, decrypt: boolean): void {
  const schedule = keySchedule(key, decrypt);
  for (let i = 0; i + 8 <= data.length; i += 8) desCryptBlock(data.subarray(i, i + 8), schedule);
}

const KEY1 = utf8Encode('!@#)(NHLiuy*$%^&');
const KEY2 = utf8Encode('123ZXC!@#)(*$%^&');
const KEY3 = utf8Encode('!@#)(*$%^&abcDEF');

/** 对应 qdes.LyricDecode：解密(KEY1) → 加密(KEY2) → 解密(KEY3)，原地修改 */
export function lyricDecode(data: Uint8Array): Uint8Array {
  cryptAll(data, KEY1, true);
  cryptAll(data, KEY2, false);
  cryptAll(data, KEY3, true);
  return data;
}

/** 解密 QRC 歌词：十六进制密文 → 3DES → zlib 解压 */
export function qdesDecrypt(hex: string): string {
  return utf8Decode(inflate(lyricDecode(hexToBytes(hex.trim()))));
}
