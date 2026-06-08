import CryptoJS from 'crypto-js';

// ==================== 哈希函数 ====================

export function md5(text: string): string {
  return CryptoJS.MD5(text).toString();
}

export function sha256(text: string): string {
  return CryptoJS.SHA256(text).toString();
}

// ==================== Base64 编解码 ====================

export function base64Encode(text: string): string {
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(text));
}

export function base64Decode(encoded: string): string {
  return CryptoJS.enc.Base64.parse(encoded).toString(CryptoJS.enc.Utf8);
}

// ==================== 十六进制编解码 ====================

export function hexEncode(text: string): string {
  return CryptoJS.enc.Hex.stringify(CryptoJS.enc.Utf8.parse(text));
}

export function hexDecode(hex: string): string {
  return CryptoJS.enc.Hex.parse(hex).toString(CryptoJS.enc.Utf8);
}

// ==================== AES 加密 ====================

export function aesEncrypt(text: string, key: string, iv?: string, mode: 'CBC' | 'ECB' = 'CBC'): string {
  const keyBytes = CryptoJS.enc.Utf8.parse(key);
  const textBytes = CryptoJS.enc.Utf8.parse(text);

  const options: any = { mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC };

  if (iv && mode === 'CBC') {
    options.iv = CryptoJS.enc.Utf8.parse(iv);
  }

  const encrypted = CryptoJS.AES.encrypt(textBytes, keyBytes, options);
  return encrypted.toString();
}

export function aesDecrypt(ciphertext: string, key: string, iv?: string, mode: 'CBC' | 'ECB' = 'CBC'): string {
  const keyBytes = CryptoJS.enc.Utf8.parse(key);

  const options: any = { mode: mode === 'ECB' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC };

  if (iv && mode === 'CBC') {
    options.iv = CryptoJS.enc.Utf8.parse(iv);
  }

  const decrypted = CryptoJS.AES.decrypt(ciphertext, keyBytes, options);
  return decrypted.toString(CryptoJS.enc.Utf8);
}

// ==================== URL 编码 ====================

export function encodeURIComponentCustom(str: string): string {
  return globalThis.encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

export function decodeURIComponentCustom(str: string): string {
  return globalThis.decodeURIComponent(str);
}

// ==================== 工具函数 ====================

export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function sortObject<T extends Record<string, any>>(obj: T): T {
  const sorted: any = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = obj[key];
  });
  return sorted;
}

// ==================== API Key 生成 ====================

export function generateApiKey(): string {
  // 生成随机的 32 字符 API Key
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomBytes = CryptoJS.lib.WordArray.random(24);
  const randomString = randomBytes.toString(CryptoJS.enc.Base64)
    .replace(/\+/g, '')
    .replace(/\//g, '')
    .replace(/=/g, '')
    .substring(0, 32);
  
  return randomString;
}
