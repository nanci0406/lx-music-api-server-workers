// 哈希、编码、AES 等加解密工具

import CryptoJS from 'crypto-js';
import { inflateSync, unzlibSync, zlibSync } from 'fflate';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8Encode(text: string): Uint8Array {
  return encoder.encode(text);
}

export function utf8Decode(bytes: Uint8Array | ArrayBuffer): string {
  return decoder.decode(bytes);
}

export function md5(text: string): string {
  return CryptoJS.MD5(text).toString();
}

export function sha256Hex(text: string): string {
  return CryptoJS.SHA256(text).toString();
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 ? '0' + hex : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(clean.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) throw new Error('无效的十六进制字符串');
    out[i] = byte;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  // 兼容 URL 安全的写法和缺少 = 的情况
  let normalized = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function base64Encode(text: string): string {
  return bytesToBase64(utf8Encode(text));
}

export function base64Decode(text: string): string {
  return utf8Decode(base64ToBytes(text));
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomHex(bytes: number): string {
  return bytesToHex(randomBytes(bytes));
}

/** 从字符集中随机取 length 个字符 */
export function randomChoice(chars: string, length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

/** [min, max] 之间的随机整数 */
export function randomInt(min: number, max: number): number {
  const range = max - min + 1;
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return min + (value[0] % range);
}

/** URL 安全的随机令牌(和 Python 的 secrets.token_urlsafe 一样) */
export function tokenUrlSafe(bytes = 32): string {
  return bytesToBase64(randomBytes(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function wordArrayToBytes(wordArray: CryptoJS.lib.WordArray): Uint8Array {
  const { words, sigBytes } = wordArray;
  const out = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) out[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  return out;
}

function bytesToWordArray(bytes: Uint8Array): CryptoJS.lib.WordArray {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function toWordArray(data: string | Uint8Array): CryptoJS.lib.WordArray {
  return typeof data === 'string' ? CryptoJS.enc.Utf8.parse(data) : bytesToWordArray(data);
}

/** AES-ECB(PKCS7) 加密，返回密文字节 */
export function aesEcbEncrypt(data: string | Uint8Array, key: string | Uint8Array): Uint8Array {
  const encrypted = CryptoJS.AES.encrypt(toWordArray(data), toWordArray(key), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  return wordArrayToBytes(encrypted.ciphertext);
}

/** AES-CBC(PKCS7) 加密，返回密文字节 */
export function aesCbcEncrypt(data: string | Uint8Array, key: string | Uint8Array, iv: string | Uint8Array): Uint8Array {
  const encrypted = CryptoJS.AES.encrypt(toWordArray(data), toWordArray(key), {
    iv: toWordArray(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return wordArrayToBytes(encrypted.ciphertext);
}

/** AES-ECB(PKCS7) 解密 */
export function aesEcbDecrypt(data: Uint8Array, key: string | Uint8Array): Uint8Array {
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: bytesToWordArray(data) }),
    toWordArray(key),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
  );
  return wordArrayToBytes(decrypted);
}

/**
 * 解压 zlib 或 raw deflate 数据。压缩数据后面多出来的字节(如 QRC 歌词解密后的分组填充)会被忽略，
 * 与 Python 的 zlib.decompress 一致；运行时自带的 DecompressionStream 在有些环境下会因此报错
 */
export function inflate(data: Uint8Array, format: 'deflate' | 'deflate-raw' = 'deflate'): Uint8Array {
  return format === 'deflate' ? unzlibSync(data) : inflateSync(data);
}

/** 压缩为 zlib 格式 */
export function deflate(data: Uint8Array): Uint8Array {
  return zlibSync(data);
}

/** 恒定时间比较两个字符串，避免通过响应时间猜测内容 */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = utf8Encode(a);
  const right = utf8Encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// RSA(无填充 / PKCS#1 v1.5)
// ---------------------------------------------------------------------------

export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  base %= modulus;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    exponent >>= 1n;
    base = (base * base) % modulus;
  }
  return result;
}

function bigintToBytes(value: bigint, length: number): Uint8Array {
  const hex = value.toString(16).padStart(length * 2, '0');
  return hexToBytes(hex);
}

/** RSA PKCS#1 v1.5 加密(公钥用十六进制的模数和指数给出) */
export function rsaPkcs1Encrypt(message: Uint8Array, modulusHex: string, exponentHex: string): Uint8Array {
  const modulus = BigInt('0x' + modulusHex);
  const size = Math.ceil(modulus.toString(16).length / 2);
  if (message.length > size - 11) throw new Error('RSA 明文太长');
  const padded = new Uint8Array(size);
  padded[1] = 0x02;
  const paddingLength = size - message.length - 3;
  const padding = randomBytes(paddingLength);
  for (let i = 0; i < paddingLength; i++) {
    while (padding[i] === 0) padding[i] = randomBytes(1)[0];
  }
  padded.set(padding, 2);
  padded.set(message, size - message.length);
  const result = modPow(BigInt('0x' + bytesToHex(padded)), BigInt('0x' + exponentHex), modulus);
  return bigintToBytes(result, size);
}

// ---------------------------------------------------------------------------
// 密码哈希：加盐 PBKDF2-HMAC-SHA256
// ---------------------------------------------------------------------------

// Workers 的 PBKDF2 最多允许 100000 次迭代；免费版每次请求只有 10ms CPU，迭代次数取一半，
// 避免登录请求因为超出 CPU 限制而失败。迭代次数写在哈希里，以后调整不影响已保存的密码。
export const PBKDF2_ITERATIONS = 50000;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', utf8Encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, length * 8);
  return new Uint8Array(bits);
}

/** 存储格式 pbkdf2$迭代次数$盐(base64)$哈希(base64) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const digest = await pbkdf2(password, salt, PBKDF2_ITERATIONS, 32);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(digest)}`;
}

/**
 * 校验密码
 *
 * @returns [是否匹配, 是否需要升级哈希]。旧版本存的是无盐 sha256 十六进制串，仍可校验，登录成功后升级
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<[boolean, boolean]> {
  stored = stored || '';
  if (stored.startsWith('pbkdf2$')) {
    try {
      const [, iterations, salt, digest] = stored.split('$');
      const expected = base64ToBytes(digest);
      const count = Number(iterations);
      if (!Number.isInteger(count) || count < 1 || count > 100000) return [false, false];
      const actual = await pbkdf2(password, base64ToBytes(salt), count, expected.length);
      return [timingSafeEqual(bytesToHex(actual), bytesToHex(expected)), false];
    } catch {
      return [false, false];
    }
  }
  if (/^[0-9a-f]{64}$/i.test(stored)) {
    return timingSafeEqual(sha256Hex(password), stored.toLowerCase()) ? [true, true] : [false, false];
  }
  return [false, false];
}
