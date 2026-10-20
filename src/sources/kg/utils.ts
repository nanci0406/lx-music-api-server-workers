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

export function kgTools(ctx: AppContext): KgTools {
  const c = ctx.config;
  return {
    signkey: String(c.get('module.kg.client.signatureKey')),
    pidversec: String(c.get('module.kg.client.pidversionsecret')),
    clientver: String(c.get('module.kg.client.clientver')),
    xRouter: c.get('module.kg.tracker.x-router') || { enable: false, value: '' },
    url: String(c.get('module.kg.tracker.host')) + String(c.get('module.kg.tracker.path')),
    version: String(c.get('module.kg.tracker.version')),
    extraParams: c.get('module.kg.tracker.extra_params') || {},
    appid: String(c.get('module.kg.client.appid')),
    mid: String(c.get('module.kg.user.mid')),
    pid: String(c.get('module.kg.client.pid')),
  };
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
