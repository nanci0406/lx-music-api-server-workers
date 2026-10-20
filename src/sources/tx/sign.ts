// QQ 音乐 musics.fcg 接口的 sign 参数(zzb 签名)

import { md5 } from '../../lib/crypto';

const OBFUSCATE = [212, 45, 80, 68, 195, 163, 163, 203, 157, 220, 254, 91, 204, 79, 104, 6];
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function pick(text: string, positions: number[]): string {
  return positions.map((p) => text[p]).join('');
}

export function sign(params: string): string {
  const hash = md5(params).toUpperCase();
  const head = pick(hash, [21, 4, 9, 26, 16, 20, 27, 30]);
  const tail = pick(hash, [18, 11, 3, 2, 1, 7, 6, 25]);
  const bytes: number[] = [];
  for (let i = 0; i < hash.length; i += 2) bytes.push(parseInt(hash.substr(i, 2), 16) ^ OBFUSCATE[i / 2]);
  // 按 3 字节一组编码成 base64 字符，最后不足 3 字节的一组只输出两个字符(不补 =)
  let middle = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    if (i < bytes.length - 2) {
      const b = bytes[i + 1];
      const c = bytes[i + 2];
      middle += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + B64[((b & 15) << 2) | (c >> 6)] + B64[c & 63];
    } else {
      middle += B64[a >> 2] + B64[(a & 3) << 4];
    }
  }
  return ('zzb' + head + middle + tail).toLowerCase().replace(/[\\/+]/g, '');
}
