import CryptoJS from 'crypto-js';
import { md5 } from '../../lib/utils';
import { NONCE, EAPI_KEY, MODULUS, PUBKEY } from './types';

// ==================== AES 加密 ====================

function aesEncrypt(text: string, key: string, mode: 'CBC' | 'ECB' = 'CBC'): string {
  const keyBytes = CryptoJS.enc.Utf8.parse(key);
  const textBytes = CryptoJS.enc.Utf8.parse(text);

  let encrypted;
  if (mode === 'CBC') {
    const iv = CryptoJS.enc.Utf8.parse('0102030405060708');
    encrypted = CryptoJS.AES.encrypt(textBytes, keyBytes, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
  } else {
    encrypted = CryptoJS.AES.encrypt(textBytes, keyBytes, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    });
  }

  return encrypted.toString();
}

// ==================== RSA 加密 ====================

function rsaEncrypt(text: string, pubkey: string, modulus: string): string {
  // 反转文本
  const reversed = text.split('').reverse().join('');
  const hex = Array.from(reversed)
    .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');

  // 大整数幂运算
  const textNum = BigInt('0x' + hex);
  const pubkeyNum = BigInt('0x' + pubkey);
  const modulusNum = BigInt('0x' + modulus);

  const result = modPow(textNum, pubkeyNum, modulusNum);

  return result.toString(16).padStart(256, '0');
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;

  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp >> 1n;
    base = (base * base) % mod;
  }

  return result;
}

// ==================== 生成随机密钥 ====================

function createRandomKey(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// ==================== Web 加密（双层 AES + RSA）====================

export function weEncrypt(text: string): { params: string; encSecKey: string } {
  const data = JSON.stringify(text);
  const secretKey = createRandomKey(16);

  // 第一层 AES 加密（使用 NONCE）
  const firstEncrypt = aesEncrypt(data, NONCE, 'CBC');

  // 第二层 AES 加密（使用随机密钥）
  const secondEncrypt = aesEncrypt(firstEncrypt, secretKey, 'CBC');

  // RSA 加密密钥
  const encSecKey = rsaEncrypt(secretKey, PUBKEY, MODULUS);

  return {
    params: secondEncrypt,
    encSecKey
  };
}

// ==================== EAPI 加密 ====================

export function eapiEncrypt(url: string, text: string): { params: string } {
  // text 已经是 JSON 字符串了，不需要再次 stringify
  const digest = md5(`nobody${url}use${text}md5forencrypt`);

  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;

  // AES-ECB 加密
  const encrypted = aesEncrypt(data, EAPI_KEY, 'ECB');

  // 转十六进制
  const hex = CryptoJS.enc.Base64.parse(encrypted).toString(CryptoJS.enc.Hex).toUpperCase();

  return {
    params: hex
  };
}

// ==================== Linux 加密 ====================

const LINUXKEY = 'rFgB&h#%2?^eDg:Q';

export function linuxEncrypt(text: string): { eparams: string } {
  const data = JSON.stringify(text);
  const encrypted = aesEncrypt(data, LINUXKEY, 'ECB');

  // 转十六进制
  const hex = CryptoJS.enc.Base64.parse(encrypted).toString(CryptoJS.enc.Hex).toUpperCase();

  return {
    eparams: hex
  };
}
