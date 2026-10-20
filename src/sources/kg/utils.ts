// 酷狗：签名、请求参数等工具

import type { AppContext } from '../../lib/context';
import { aesCbcEncrypt, bytesToHex, md5 } from '../../lib/crypto';
import { request, type HttpResponse, type RequestOptions } from '../../lib/http';
import { joinParams, sortObject } from '../../lib/utils';

export const QUALITY_HASH_MAP: Record<string, string> = {
  '128k': 'hash_128',
  '320k': 'hash_320',
  flac: 'hash_flac',
  flac24bit: 'hash_high',
  master: 'hash_128',
};

export const QUALITY_MAP: Record<string, string> = {
  '128k': '128',
  '320k': '320',
  flac: 'flac',
  flac24bit: 'high',
  master: 'viper_atmos',
};

export interface KgTools {
  signkey: string;
  pidversec: string;
  clientver: string;
  xRouter: { enable: boolean; value: string };
  url: string;
  version: string;
  extraParams: Record<string, unknown>;
  appid: string;
  mid: string;
  pid: string;
}

// 不同客户端(appid)对应的签名参数。概念版(3116)的账号必须用概念版的参数，否则酷狗返回 err signature(20006)
export const CLIENT_PRESETS: Record<string, { signatureKey: string; pidversionsecret: string; pid: string; clientver: string }> = {
  '1005': { signatureKey: 'OIlwieks28dk2k092lksi2UIkp', pidversionsecret: '57ae12eb6890223e355ccfcb74edf70d', pid: '2', clientver: '12029' },
  '3116': { signatureKey: 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA', pidversionsecret: '185672dd44712f60bb1736df5a377e82', pid: '411', clientver: '11440' },
};

/**
 * 客户端参数：配置里是空的、或者还是另一个客户端的预设值(只改了 appid)时，使用当前 appid 的预设值；
 * 自己填写的其他值照原样使用
 */
function clientValue(c: AppContext['config'], appid: string, field: 'signatureKey' | 'pidversionsecret' | 'pid' | 'clientver'): string {
  const configured = String(c.get(`module.kg.client.${field}`) ?? '').trim();
  const preset = CLIENT_PRESETS[appid];
  if (!preset) return configured;
  const otherPresets = Object.entries(CLIENT_PRESETS).filter(([id]) => id !== appid).map(([, p]) => p[field]);
  return !configured || otherPresets.includes(configured) ? preset[field] : configured;
}

export function kgTools(ctx: AppContext): KgTools {
  const c = ctx.config;
  const appid = String(c.get('module.kg.client.appid'));
  return {
    signkey: clientValue(c, appid, 'signatureKey'),
    pidversec: clientValue(c, appid, 'pidversionsecret'),
    clientver: clientValue(c, appid, 'clientver'),
    xRouter: c.get('module.kg.tracker.x-router') || { enable: false, value: '' },
    url: String(c.get('module.kg.tracker.host')) + String(c.get('module.kg.tracker.path')),
    version: String(c.get('module.kg.tracker.version')),
    extraParams: c.get('module.kg.tracker.extra_params') || {},
    appid,
    mid: String(c.get('module.kg.user.mid')),
    pid: clientValue(c, appid, 'pid'),
  };
}

// 酷狗接口常见的错误码
const ERROR_HINTS: Record<string, string> = {
  20006: '签名错误：token 和客户端类型(appid)不匹配。酷狗概念版 App 里得到的 token 要把 appid 设为 3116，酷狗音乐 App 的要设为 1005',
  20017: 'token 无效或已过期，请重新获取 token',
  20028: '酷狗要求验证这次请求，通常是伪装的国内 IP 不被认可，请在“配置 → 服务”里更换伪装国内 IP',
};

/** 把酷狗返回的错误码说明成人能看懂的话 */
export function errorHint(code: unknown): string {
  return code !== undefined && code !== null && code !== '' ? ERROR_HINTS[String(code)] || '' : '';
}

/** 签名：signkey + 按 key 排序后拼接的 k=v + 请求体 + signkey 的 MD5 */
export function sign(params: Record<string, unknown>, body: string, signkey: string): string {
  const joined = Object.entries(sortObject(params)).map(([k, v]) => `${k}=${v}`).join('');
  return md5(signkey + joined + body + signkey);
}

/** 给参数加上签名后发送请求；body 为字符串时原样发送并参与签名 */
export async function signRequest(
  ctx: AppContext,
  url: string,
  params: Record<string, unknown>,
  options: RequestOptions & { body?: string },
  signkey: string,
): Promise<HttpResponse> {
  const signed = { ...params, signature: sign(params, options.body || '', signkey) };
  return request(ctx, `${url}?${joinParams(signed)}`, options);
}

export function getKey(hash: string, userInfo: Record<string, any>, tools: KgTools): string {
  return md5(hash.toLowerCase() + tools.pidversec + tools.appid + String(userInfo.mid ?? '') + String(userInfo.userid ?? ''));
}

/** AES-CBC 加密后转十六进制(刷新登录的 p3 参数) */
export function aesSign(plain: string, key = '90b8382a1bb4ccdcf063102053fd75b8', iv = 'f063102053fd75b8'): string {
  return bytesToHex(aesCbcEncrypt(plain, key, iv));
}
