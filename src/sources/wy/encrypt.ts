// 网易云：eapi 加密

import { aesEcbEncrypt, bytesToHex, md5 } from '../../lib/crypto';

const EAPI_KEY = 'e82ckenh8dichen8';

export function eapiEncrypt(url: string, text: string): { params: string } {
  const digest = md5(`nobody${url}use${text}md5forencrypt`);
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  return { params: bytesToHex(aesEcbEncrypt(data, EAPI_KEY)).toUpperCase() };
}
