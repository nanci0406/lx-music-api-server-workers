// 向 QQ 音乐的 QIMEI 服务申请设备标识。请求的构造方式参考 MIT 许可的
// MeoProject/lx-music-api-server (utils/platform/tx/qimei.py)，与 Python 版一致。

import type { AppContext } from '../../lib/context';
import { aesCbcEncrypt, bytesToBase64, md5, randomChoice, randomInt, rsaPkcs1Encrypt, utf8Encode } from '../../lib/crypto';
import { request } from '../../lib/http';
import { log } from '../../lib/log';
import { now, timestampFormat } from '../../lib/utils';
import { type Device, qimeiFresh, saveDevice } from './device';

const logger = log('qqmusic_qimei');

const QIMEI_URL = 'https://api.tencentmusic.com/tme/trpc/proxy';
const APP_VERSION = '14.9.0.8';
// 公钥(与 Python 版的 PEM 相同)的模数和指数
const RSA_MODULUS = 'c4231830a2eb5fc2827170641e79d80fec51bda9a22e4b4ab37d1f205a4ae44d928cda25879f66a3429051663312a127fa' +
  'f8a246bdaaf63918417e90d7c95b5908aa6a2d0f852e4a6770294a548ac1c2fe8f1f252fb826f4ac86ab9a00e7ce47d002a56e7c4b51eb889acc' +
  '60ca6adbc9f72e81f4d31b1dd7464805264530ab1d';
const RSA_EXPONENT = '10001';
const SECRET = 'ZdJqM15EeO2zWc08';
const APP_KEY = '0AND0HD6FE4HY80F';

export function randomBeaconId(): string {
  const month = timestampFormat(now(), 8).slice(0, 8) + '01';
  const rand1 = randomInt(100000, 999999);
  const rand2 = randomInt(100000000, 999999999);
  const paired = new Set([1, 2, 13, 14, 17, 18, 21, 22, 25, 26, 29, 30, 33, 34, 37, 38]);
  let beaconId = '';
  for (let i = 1; i <= 40; i++) {
    if (paired.has(i)) beaconId += `k${i}:${month}${rand1}.${rand2}`;
    else if (i === 3) beaconId += 'k3:0000000000000000';
    else if (i === 4) beaconId += 'k4:' + randomChoice('123456789abcdef', 16);
    else beaconId += `k${i}:${randomInt(0, 9999)}`;
    beaconId += ';';
  }
  return beaconId;
}

export function buildPayload(device: Device, version = APP_VERSION): Record<string, unknown> {
  const reserved = {
    harmony: '0',
    clone: '0',
    containe: '',
    oz: 'UhYmelwouA+V2nPWbOvLTgN2/m8jwGB+yUB5v9tysQg=',
    oo: 'Xecjt+9S1+f8Pz2VLSxgpw==',
    kelong: '0',
    uptimes: timestampFormat(now() - randomInt(0, 14400), 8),
    multiUser: '0',
    bod: device.brand,
    dv: device.device,
    firstLevel: '',
    manufact: device.brand,
    name: device.model,
    host: 'se.infra',
    kernel: device.proc_version,
  };
  return {
    androidId: device.android_id,
    platformId: 1,
    appKey: APP_KEY,
    appVersion: version,
    beaconIdSrc: randomBeaconId(),
    brand: device.brand,
    channelId: '10003505',
    cid: '',
    imei: device.imei,
    imsi: '',
    mac: '',
    model: device.model,
    networkType: 'unknown',
    oaid: '',
    osVersion: `Android ${device.version.release},level ${device.version.sdk}`,
    qimei: '',
    qimei36: '',
    sdkVersion: '1.2.13.6',
    targetSdkVersion: '33',
    audit: '',
    userId: '{}',
    packageId: 'com.tencent.qqmusic',
    deviceType: 'Phone',
    sdkName: '',
    reserved: JSON.stringify(reserved),
  };
}

/** 向服务端申请 QIMEI，返回 {q16, q36}；失败时抛出异常 */
export async function fetchQimei(ctx: AppContext | null, device: Device): Promise<{ q16: string; q36: string }> {
  const cryptKey = randomChoice('adbcdef1234567890', 16);
  const nonce = randomChoice('adbcdef1234567890', 16);
  const ts = now();
  const key = bytesToBase64(rsaPkcs1Encrypt(utf8Encode(cryptKey), RSA_MODULUS, RSA_EXPONENT));
  const params = bytesToBase64(aesCbcEncrypt(JSON.stringify(buildPayload(device)), cryptKey, cryptKey));
  const extra = `{"appKey":"${APP_KEY}"}`;
  const sign = md5(key + params + String(ts * 1000) + nonce + SECRET + extra);
  const resp = await request(ctx, QIMEI_URL, {
    method: 'POST',
    headers: {
      method: 'GetQimei',
      service: 'trpc.tme_datasvr.qimeiproxy.QimeiProxy',
      appid: 'qimei_qq_android',
      sign: md5('qimei_qq_androidpzAuCmaFAaFaHrdakPjLIEqKrGnSOOvH' + String(ts)),
      'User-Agent': 'QQMusic',
      timestamp: String(ts),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app: 0,
      os: 1,
      qimeiParams: { key, params, time: String(ts), nonce, sign, extra },
    }),
  });
  const data = JSON.parse(resp.json().data).data;
  if (!data?.q36) throw new Error('QIMEI 响应中没有 q36');
  return { q16: data.q16 || '', q36: data.q36 };
}

/** 返回有效的 QIMEI，必要时申请并保存；申请失败时沿用旧值(没有旧值则为空) */
export async function ensureQimei(ctx: AppContext, device: Device): Promise<{ q16?: string; q36?: string }> {
  if (qimeiFresh(device)) return device.qimei;
  try {
    device.qimei = await fetchQimei(ctx, device);
    device.qimei_time = now();
    await saveDevice(ctx.db, device);
  } catch (e) {
    logger.warning(`获取 QIMEI 失败: ${e}`);
    if (!device.qimei?.q36) return { q16: '', q36: '' };
  }
  return device.qimei;
}
