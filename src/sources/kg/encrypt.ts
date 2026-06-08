import { md5, sortObject } from '../../lib/utils';
import CryptoJS from 'crypto-js';
import type { KGConfig } from './types';
import { KG_CLIENT_CONFIG } from './types';

// ==================== MD5 签名 ====================

export function sign(params: Record<string, any>, body: string = '', signkey: string = KG_CLIENT_CONFIG.signatureKey): string {
  const sorted = sortObject(params);
  const paramsStr = Object.entries(sorted)
    .map(([k, v]) => `${k}=${v}`)
    .join('');

  // Python 版本：signkey + paramsStr + body + signkey
  return md5(signkey + paramsStr + body + signkey);
}

// ==================== AES 加密 ====================

const AES_KEY = CryptoJS.enc.Utf8.parse('90b8382a1bb4ccdcf063102053fd75b8');
const AES_IV = CryptoJS.enc.Utf8.parse('f063102053fd75b8');

// 概念版专用密钥（appid=3116）
const CONCEPT_AES_KEY = CryptoJS.enc.Utf8.parse('c24f74ca2820225badc01946dba4fdf7');
const CONCEPT_AES_IV = CryptoJS.enc.Utf8.parse('adc01946dba4fdf7');

export function aesEncrypt(data: string): string {
  const encrypted = CryptoJS.AES.encrypt(data, AES_KEY, {
    iv: AES_IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  return encrypted.toString();
}

export function aesDecrypt(ciphertext: string): string {
  const decrypted = CryptoJS.AES.decrypt(ciphertext, AES_KEY, {
    iv: AES_IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}

/**
 * 概念版 AES 加密（用于刷新登录）
 * appid=3116 专用
 */
export function conceptAesEncrypt(data: string): string {
  const encrypted = CryptoJS.AES.encrypt(data, CONCEPT_AES_KEY, {
    iv: CONCEPT_AES_IV,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  return encrypted.toString();
}

// ==================== 获取密钥 ====================

export function getKey(hash: string, userInfo: KGConfig): string {
  // Python 版本：md5(hash + pidversec + appid + mid + userid)
  const str = hash.toLowerCase() +
              KG_CLIENT_CONFIG.pidversionsecret +
              KG_CLIENT_CONFIG.appid +
              userInfo.mid +
              userInfo.userid;
  return md5(str);
}

// ==================== KRC 歌词解密 ====================

const KRC_KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];

export function decryptKrc(encrypted: Uint8Array): string {
  // 跳过前4个字节的头部
  const data = encrypted.slice(4);

  // XOR 解密
  const decrypted = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    decrypted[i] = data[i] ^ KRC_KEY[i % 16];
  }

  // zlib 解压缩
  try {
    // 使用 pako 或其他 zlib 库
    // 这里暂时返回解密后的数据
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(decrypted);
  } catch (error) {
    throw new Error('KRC 解密失败');
  }
}

// ==================== 构建签名请求 ====================

export async function signRequest(
  url: string,
  params: Record<string, any>,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<Response> {
  const { method = 'GET', headers = {}, body = '' } = options;

  // 添加签名
  const signature = sign(params, body);
  const signedParams = { ...params, signature };

  // 构建 URL
  const queryString = Object.entries(signedParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  const fullUrl = `${url}?${queryString}`;

  // 构建请求头
  const requestHeaders: Record<string, string> = {
    'User-Agent': 'Android712-AndroidPhone-8983-18-0-NetMusic-wifi',
    'KG-THash': '3e5ec6b',
    'KG-Rec': '1',
    'KG-RC': '1',
    ...headers
  };

  // 如果启用了 x-router，添加该请求头
  if (KG_CLIENT_CONFIG.tracker?.xRouter?.enable) {
    requestHeaders['x-router'] = KG_CLIENT_CONFIG.tracker.xRouter.value;
  }

  // 发送请求
  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders
  };

  if (body && method === 'POST') {
    fetchOptions.body = body;
  }

  return fetch(fullUrl, fetchOptions);
}
