// 酷狗：token 保活(刷新登录)。30 天不刷新 token 会失效。
// 请求方式与 KuGouMusicApi(module/login_token.js)一致：/v5/login_by_token，
// 概念版(appid=3116)还要带上加密的设备信息 t1 / t2 / dev，否则真实的概念版 token 会被拒绝(20006)。
// 新的 token 可能放在加密的 secu_params 里返回。

import type { AppContext } from '../../lib/context';
import { aesCbcDecrypt, aesCbcEncrypt, bytesToHex, hexToBytes, md5, randomChoice, rsaRawEncryptHex, utf8Decode, utf8Encode } from '../../lib/crypto';
import { kvGet, kvSet } from '../../lib/db';
import { log } from '../../lib/log';
import { errorHint, kgTools, signRequest } from './utils';

const logger = log('kg_refresh_login');

export const LOGIN_URL = 'http://login.user.kugou.com/v5/login_by_token';

// 刷新失败的原因会显示在后台“模块状态”的任务错误里
class RefreshError extends Error {}

const P3_AES = {
  '1005': { key: '90b8382a1bb4ccdcf063102053fd75b8', iv: 'f063102053fd75b8' },
  '3116': { key: 'c24f74ca2820225badc01946dba4fdf7', iv: 'adc01946dba4fdf7' },
} as Record<string, { key: string; iv: string }>;
const LITE_T1 = { key: '5e4ef500e9597fe004bd09a46d8add98', iv: '04bd09a46d8add98' };
const LITE_T2 = { key: 'fd14b35e3f81af3817a20ae7adae7020', iv: '17a20ae7adae7020' };
const RSA_MODULUS: Record<string, string> = {
  '1005': 'c8006ed03842d2628209bd314984ca5ed6cfe06e30c95f9d4704d9c49791d7a935ba950ecb0bc8ebf5f5994f0bac927a7eb151b3c1de34330' +
    '3fa539c83136eccfd7d7e511e2dbce18eaa9f784c9b50d443e75865979e0a5e216e46c684066a8d6b998580bbaa22d73f5790286bb14742e83244e44db6d' +
    '707ffe162c5c7002d45',
  '3116': 'c40a2d0da76511f3bb1cc2bbd3afbd8bea83b4d6b05b6c13eb8920c53f1af7679b32ba0d0edb843240ef1b836efed3ee240734c14c1399fd6' +
    '594d16af22f52525d14d72e0155c6dcc8638d4f7bb94f3a0b1f4c29f991972f2a160a25eb0a9e724336be7f69bbd319ffab1c6dd8470b021dc434f3faba89' +
    'f4a2a01b33bdbdd08b',
};

function aesHex(data: string, key: string, iv: string): string {
  return bytesToHex(aesCbcEncrypt(data, key, iv));
}

/** 用随机密钥加密：密钥为 md5(随机串) 的前 32 位，IV 为密钥的后 16 位 */
function randomKeyAes(data: string): { str: string; key: string } {
  const tempKey = randomChoice('1234567890abcdefghijklmnopqrstuvwxyz', 16);
  const key = md5(tempKey).slice(0, 32);
  return { str: aesHex(data, key, key.slice(16)), key: tempKey };
}

function randomKeyDecrypt(hex: string, tempKey: string): unknown {
  const key = md5(tempKey).slice(0, 32);
  const text = utf8Decode(aesCbcDecrypt(hexToBytes(hex), key, key.slice(16)));
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface KgDevice {
  guid: string;
  dev: string;
  mac: string;
}

/** 模拟的设备信息，保存在 D1 里(key = kg_device)，始终使用同一台“设备” */
export async function loadKgDevice(db: D1Database): Promise<KgDevice> {
  const stored = await kvGet<KgDevice>(db, 'kg_device');
  if (stored?.guid && stored.dev) return stored;
  const device = {
    guid: md5(crypto.randomUUID()),
    dev: randomChoice('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ', 10),
    mac: '02:00:00:00:00:00',
  };
  await kvSet(db, 'kg_device', device);
  return device;
}

/** 由设备 GUID 计算 mid：md5 的十进制值 */
export function deviceMid(guid: string): string {
  return BigInt('0x' + md5(guid)).toString();
}

export interface RefreshResult {
  userid: string | number;
  token: string;
  t1?: string;
}

/**
 * 发起一次 token 保活请求
 * @param t1 上一次刷新返回的 t1(概念版使用)
 * @returns 新的 userid / token / t1；appid 不支持时返回 null；接口返回失败时抛出带原因的错误
 */
export async function requestRefresh(
  ctx: AppContext, userId: string, token: string, loginUrl: string, t1 = '',
): Promise<RefreshResult | null> {
  const tools = kgTools(ctx);
  const appid = tools.appid;
  if (!P3_AES[appid]) {
    logger.warning(`酷狗音乐账号(UID_${userId})刷新登录失败: 不支持的 appid(${appid})，仅支持 1005 和 3116`);
    return null;
  }
  const lite = appid === '3116';
  // 旧版本的默认接口(v4)已经不能刷新概念版的 token
  const url = !loginUrl || /\/v4\/login_by_token$/.test(loginUrl) ? LOGIN_URL : loginUrl;
  const device = await loadKgDevice(ctx.db);
  const mid = deviceMid(device.guid);
  const ts = Date.now();
  const clienttime = Math.floor(ts / 1000);
  const encryptParams = randomKeyAes('{}');
  const data: Record<string, unknown> = {
    dfid: '-',
    p3: aesHex(JSON.stringify({ clienttime, token }), P3_AES[appid].key, P3_AES[appid].iv),
    plat: 1,
    t1: lite ? aesHex(t1 ? `${t1}|${ts}` : `|${ts}`, LITE_T1.key, LITE_T1.iv) : 0,
    t2: lite ? aesHex(`${device.guid}|0f607264fc6318a92b9e13c65db7cd3c|${device.mac}|${device.dev}|${ts}`, LITE_T2.key, LITE_T2.iv) : 0,
    t3: 'MCwwLDAsMCwwLDAsMCwwLDA=',
    pk: rsaRawEncryptHex(utf8Encode(JSON.stringify({ clienttime_ms: ts, key: encryptParams.key })), RSA_MODULUS[appid], '10001'),
    params: encryptParams.str,
    userid: userId,
    clienttime_ms: ts,
  };
  if (lite) data.dev = device.dev;
  const body = JSON.stringify(data);
  const params = { dfid: '-', mid, uuid: '-', appid, clientver: tools.clientver, clienttime, token, userid: userId };
  const resp = await signRequest(ctx, url, params, {
    method: 'POST',
    body,
    headers: {
      'User-Agent': 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi',
      dfid: '-',
      clienttime: String(clienttime),
      mid,
      'kg-rc': '1',
      'kg-thash': '5d816a0',
      'kg-rec': '1',
      'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
      'Content-Type': 'application/json',
    },
  }, tools.signkey);
  const result = resp.jsonOrNull();
  if (result?.status === 1 && result.data) {
    const info: Record<string, any> = { ...result.data };
    if (info.secu_params) {
      const secret = randomKeyDecrypt(String(info.secu_params), encryptParams.key);
      if (secret && typeof secret === 'object') Object.assign(info, secret);
      else if (secret) info.token = String(secret);
    }
    if (info.token) return { userid: info.userid || userId, token: String(info.token), t1: info.t1 ? String(info.t1) : undefined };
  }
  const code = result ? result.error_code ?? result.errcode ?? result.status : `HTTP ${resp.status}`;
  const hint = errorHint(code);
  // 带上实际使用的 appid、签名 key(前 6 位，都是公开的固定值)和接口，方便判断是不是配置没有生效
  const used = `appid ${appid}，签名 key ${tools.signkey.slice(0, 6)}…，接口 ${new URL(url).host}${new URL(url).pathname}`;
  throw new RefreshError(`酷狗音乐账号(UID_${userId})刷新登录失败(code: ${code}；${used})${hint ? '：' + hint : ''}`);
}

/** 单账号模式：刷新 module.kg.user */
export async function refresh(ctx: AppContext): Promise<boolean | void> {
  const user = ctx.config.get('module.kg.user') || {};
  if (!user.token || !user.refresh_login?.enable) return;
  const userId = String(user.userid);
  const usedToken = String(user.token);
  const data = await requestRefresh(ctx, userId, usedToken, String(user.refresh_login.login_url || ''), String(user.t1 || ''));
  if (!data) return false;
  const written = await ctx.config.update((config) => {
    // 请求期间 token 被管理员改掉了：不能用旧 token 刷出来的结果覆盖
    if (config.module.kg.user.token !== usedToken) return false;
    config.module.kg.user.userid = String(data.userid);
    config.module.kg.user.token = data.token;
    if (data.t1) config.module.kg.user.t1 = data.t1;
  });
  if (!written) {
    logger.warning(`酷狗音乐账号(UID_${userId})的 token 在刷新期间已被修改，本次刷新结果已丢弃`);
    return;
  }
  logger.info(`酷狗音乐账号(UID_${userId})刷新登录成功，数据已更新`);
}

/** 账号池模式：刷新 module.cookiepool.kg 中第 index 个账号 */
export async function refreshPool(ctx: AppContext, index: number): Promise<boolean | void> {
  const pool = ctx.config.get('module.cookiepool.kg') || [];
  const user = pool[index];
  if (!user) {
    logger.warning(`酷狗账号池刷新登录失败: 账号索引不存在(${index})`);
    return false;
  }
  if (!user.token) return;
  const userId = String(user.userid);
  const usedToken = String(user.token);
  const data = await requestRefresh(ctx, userId, usedToken, String(user.refresh_login?.login_url || ''), String(user.t1 || ''));
  if (!data) return false;
  const written = await ctx.config.update((config) => {
    const current = config.module.cookiepool.kg?.[index];
    if (!current || current.token !== usedToken) return false;
    current.token = data.token;
    current.userid = String(data.userid);
    if (data.t1) current.t1 = data.t1;
  });
  if (!written) {
    logger.warning(`酷狗音乐账号(UID_${userId})的配置在刷新期间已被修改，本次刷新结果已丢弃`);
    return;
  }
  logger.info(`酷狗音乐账号(UID_${userId})刷新登录成功，数据已更新`);
}
