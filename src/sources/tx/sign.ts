import { md5 } from '../../lib/utils';

// QQ音乐签名算法

// 混淆表
const OBFUSCATION_TABLE = [
  212, 45, 80, 68, 195, 163, 163, 203, 157, 220, 254, 91, 204, 79, 104, 6
];

// 提取特定位置的字符
function extractPositions(str: string, positions: number[]): string {
  return positions.map(pos => str[pos]).join('');
}

// v 函数 - 提取位置 [21,4,9,26,16,20,27,30]
function v(md5Str: string): string {
  const positions = [21, 4, 9, 26, 16, 20, 27, 30];
  return extractPositions(md5Str, positions);
}

// c 函数 - 提取位置 [18,11,3,2,1,7,6,25]
function c(md5Str: string): string {
  const positions = [18, 11, 3, 2, 1, 7, 6, 25];
  return extractPositions(md5Str, positions);
}

// t 函数 - 十六进制转字节并混淆
function t(md5Str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < md5Str.length; i += 2) {
    const hex = md5Str.substring(i, i + 2);
    const byte = parseInt(hex, 16);
    bytes.push(byte);
  }

  // 应用混淆表
  const obfuscated = bytes.map((byte, index) =>
    byte ^ OBFUSCATION_TABLE[index % OBFUSCATION_TABLE.length]
  );

  return obfuscated;
}

// n 函数 - Base64 编码（Python 风格，不添加 = 填充）
function n(bytes: number[]): string {
  const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const result: string[] = [];

  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : null;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : null;

    const enc1 = b1 >> 2;

    if (b2 !== null && b3 !== null) {
      // 完整的 3 字节组
      const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
      const enc3 = ((b2 & 15) << 2) | (b3 >> 6);
      const enc4 = b3 & 63;
      result.push(base64Chars[enc1]);
      result.push(base64Chars[enc2]);
      result.push(base64Chars[enc3]);
      result.push(base64Chars[enc4]);
    } else {
      // 不完整的组，只编码实际字节，不添加 = 填充
      const enc2 = (b1 & 3) << 4;
      result.push(base64Chars[enc1]);
      result.push(base64Chars[enc2]);
    }
  }

  return result.join('');
}

// 主签名函数
export function sign(params: string): string {
  // 1. MD5 哈希
  const md5Str = md5(params).toUpperCase();

  // 2. 提取字符
  const h = v(md5Str);
  const e = c(md5Str);

  // 3. 混淆和编码
  const ls = t(md5Str);
  const m = n(ls);

  // 4. 组合签名
  let result = 'zzb' + h + m + e;
  result = result.toLowerCase();

  // 5. 移除特殊字符
  result = result.replace(/[\\/+]/g, '');

  return result;
}

// 构建签名请求
export function buildSignedRequest(data: any): string {
  const dataStr = JSON.stringify(data);
  const signature = sign(dataStr);
  return `https://u.y.qq.com/cgi-bin/musics.fcg?format=json&sign=${signature}`;
}
