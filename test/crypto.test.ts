import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  aesCbcEncrypt, aesEcbDecrypt, bytesToHex, hashPassword, hexToBytes, modPow, rsaPkcs1Encrypt, sha256Hex, utf8Decode,
  utf8Encode, verifyPassword,
} from '../src/lib/crypto';
import { sizeFormat, timeLengthFormat } from '../src/lib/utils';
import { aesSign, sign as kgSign } from '../src/sources/kg/utils';
import { hash33 } from '../src/sources/tx/login';
import { sign as txSign } from '../src/sources/tx/sign';
import { eapiEncrypt } from '../src/sources/wy/encrypt';
import { pyJsonDumps } from '../src/routes/gcsp';

// 由 Python 版的实现生成(modules/tx/QMWSign、modules/kg/utils、modules/wy/encrypt、modules/tx/qimei 等)
const vectors = JSON.parse(readFileSync('test/fixtures/python-vectors.json', 'utf8'));

describe('与 Python 版的算法一致', () => {
  it('QQ 音乐 zzb 签名', () => {
    for (const [body, expected] of vectors.tx_sign) expect(txSign(body)).toBe(expected);
  });

  it('酷狗签名', () => {
    for (const [params, body, expected] of vectors.kg_sign) expect(kgSign(params, body, 'OIlwieks28dk2k092lksi2UIkp')).toBe(expected);
  });

  it('网易云 eapi 加密', () => {
    for (const [path, text, expected] of vectors.eapi) expect(eapiEncrypt(path, text).params).toBe(expected);
  });

  it('酷狗刷新登录的 p3(安卓版和概念版两套密钥)', () => {
    for (const [plain, normal, lite] of vectors.aes_sign) {
      expect(aesSign(plain)).toBe(normal);
      expect(aesSign(plain, 'c24f74ca2820225badc01946dba4fdf7', 'adc01946dba4fdf7')).toBe(lite);
    }
  });

  it('QIMEI 的 AES(IV 与密钥相同)', () => {
    for (const [key, plain, expected] of vectors.qimei_aes) expect(bytesToHex(aesCbcEncrypt(plain, key, key))).toBe(expected);
  });

  it('hash33', () => {
    for (const [text, seed0, seed5381] of vectors.hash33) {
      expect(hash33(text)).toBe(seed0);
      expect(hash33(text, 5381)).toBe(seed5381);
    }
  });

  it('文件大小和时长格式化', () => {
    for (const [size, expected] of vectors.size) expect(sizeFormat(size)).toBe(expected);
    for (const [seconds, expected] of vectors.length) expect(timeLengthFormat(seconds)).toBe(expected);
  });

  it('eapi 密文可以解开', () => {
    const [path, text] = vectors.eapi[0];
    const plain = utf8Decode(aesEcbDecrypt(hexToBytes(eapiEncrypt(path, text).params), 'e82ckenh8dichen8'));
    expect(plain.split('-36cd479b6b5-')[1]).toBe(text);
  });

  it('pyJsonDumps 与 ujson.dumps 的转义一致', () => {
    expect(pyJsonDumps('a/b"晴')).toBe('"a\\/b\\"\\u6674"');
    expect(pyJsonDumps({ t: '😀' })).toBe('{"t":"\\ud83d\\ude00"}');
  });
});

describe('RSA PKCS#1 v1.5', () => {
  it('用私钥解开后得到原文，填充格式为 00 02 <非零随机字节> 00 <原文>', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
    const jwk = publicKey.export({ format: 'jwk' }) as { n: string; e: string };
    const toHex = (b64url: string) => Buffer.from(b64url, 'base64url').toString('hex');
    const message = utf8Encode('0123456789abcdef');
    const encrypted = rsaPkcs1Encrypt(message, toHex(jwk.n), toHex(jwk.e));
    expect(encrypted.length).toBe(128);
    const raw = privateDecrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, Buffer.from(encrypted));
    expect([raw[0], raw[1]]).toEqual([0, 2]);
    const separator = raw.indexOf(0, 2);
    expect(separator).toBe(128 - message.length - 1);
    expect(raw.subarray(2, separator).every((byte) => byte !== 0)).toBe(true);
    expect(utf8Decode(raw.subarray(separator + 1))).toBe('0123456789abcdef');
  });

  it('modPow', () => {
    expect(modPow(4n, 13n, 497n)).toBe(445n);
  });
});

describe('密码哈希', () => {
  it('加盐、可以校验', async () => {
    const a = await hashPassword('password123');
    const b = await hashPassword('password123');
    expect(a).not.toBe(b);
    expect(a.startsWith('pbkdf2$')).toBe(true);
    expect(await verifyPassword('password123', a)).toEqual([true, false]);
    expect(await verifyPassword('wrong', a)).toEqual([false, false]);
  });

  it('旧版的无盐 sha256 仍能校验，并要求升级', async () => {
    expect(await verifyPassword('admin123', sha256Hex('admin123'))).toEqual([true, true]);
    expect(await verifyPassword('admin124', sha256Hex('admin123'))).toEqual([false, false]);
  });

  it('损坏的哈希不会抛出异常', async () => {
    for (const stored of ['', 'pbkdf2$', 'pbkdf2$abc$$', 'pbkdf2$999999999$AAAA$AAAA', 'scrypt$1$2$3$4$5', null]) {
      expect(await verifyPassword('x', stored as any)).toEqual([false, false]);
    }
  });
});
