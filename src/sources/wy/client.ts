// 网易云 eapi 请求的客户端参数(请求体里的 header、Cookie、UA、设备信息)。
// 参考 NeteaseCloudMusicApi 的 util/request.js：没有 os 等字段时按 PC 客户端填写，并且总是带上 deviceId。

import type { AppContext } from '../../lib/context';
import { kvGet, kvSet } from '../../lib/db';
import { randomChoice, randomInt } from '../../lib/crypto';
import { request, type HttpResponse } from '../../lib/http';
import { now } from '../../lib/utils';
import { eapiEncrypt } from './encrypt';

export const API_BASE = 'https://interface.music.163.com';
export const EAPI_UA = 'NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)';

export const OS_PROFILES: Record<string, { os: string; appver: string; osver: string; channel: string }> = {
  pc: { os: 'pc', appver: '3.1.17.204416', osver: 'Microsoft-Windows-10-Professional-build-19045-64bit', channel: 'netease' },
  linux: { os: 'linux', appver: '1.2.1.0428', osver: 'Deepin 20.9', channel: 'netease' },
  android: { os: 'android', appver: '8.20.20.231215173437', osver: '14', channel: 'xiaomi' },
  iphone: { os: 'iPhone OS', appver: '9.0.90', osver: '16.2', channel: 'distribution' },
};

export function newDeviceId(): string {
  return randomChoice('0123456789ABCDEF', 52);
}

// Cookie 里没有 deviceId 时使用的设备 ID：保存在 D1 里，始终是同一台“设备”
let defaultDeviceId = '';

async function getDefaultDeviceId(ctx: AppContext): Promise<string> {
  if (defaultDeviceId) return defaultDeviceId;
  const stored = await kvGet<string>(ctx.db, 'wy_device_id');
  if (typeof stored === 'string' && /^[0-9A-F]{52}$/.test(stored)) {
    defaultDeviceId = stored;
  } else {
    defaultDeviceId = newDeviceId();
    await kvSet(ctx.db, 'wy_device_id', defaultDeviceId);
  }
  return defaultDeviceId;
}

export function parseCookie(cookie: string | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const raw of (cookie || '').split(';')) {
    const part = raw.trim();
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq);
    if (name) result[name] = part.slice(eq + 1);
  }
  return result;
}

/** 新登录使用的设备信息，会和登录凭证一起保存，之后的刷新登录沿用同一台“设备” */
export function deviceFields(osName = 'pc', deviceId?: string): Record<string, string> {
  return { ...OS_PROFILES[osName], deviceId: deviceId || newDeviceId() };
}

/** eapi 请求体里的 header，同时也作为请求的 Cookie */
export function buildHeader(cookie: Record<string, string>, fallbackDeviceId: string): Record<string, string> {
  const osName = cookie.os;
  // 既认 pc / iphone 这样的键名，也认 'iPhone OS' 这样实际写在 Cookie 里的值
  const profile = OS_PROFILES[osName] || Object.values(OS_PROFILES).find((p) => p.os === osName) || OS_PROFILES.pc;
  const header: Record<string, string> = {
    osver: cookie.osver || profile.osver,
    deviceId: cookie.deviceId || fallbackDeviceId,
    os: cookie.os || profile.os,
    appver: cookie.appver || profile.appver,
    versioncode: cookie.versioncode || '140',
    mobilename: cookie.mobilename || '',
    buildver: cookie.buildver || String(now()),
    resolution: cookie.resolution || '1920x1080',
    __csrf: cookie.__csrf || '',
    channel: cookie.channel || profile.channel,
    requestId: `${Date.now()}_${String(randomInt(0, 999)).padStart(4, '0')}`,
  };
  if (cookie.MUSIC_U) header.MUSIC_U = cookie.MUSIC_U;
  if (cookie.MUSIC_A) header.MUSIC_A = cookie.MUSIC_A;
  return header;
}

/**
 * 发送 eapi 请求
 * @param path 接口路径，如 /api/login/token/refresh
 * @param cookie Cookie 字典(登录凭证和设备信息)
 */
export async function eapiRequest(ctx: AppContext, path: string, data: Record<string, unknown>, cookie: Record<string, string>): Promise<HttpResponse> {
  const header = buildHeader(cookie, cookie.deviceId ? '' : await getDefaultDeviceId(ctx));
  const body = { ...data, header, e_r: false };
  return request(ctx, `${API_BASE}/eapi/${path.slice(5)}`, {
    method: 'POST',
    headers: {
      'User-Agent': EAPI_UA,
      Cookie: Object.entries(header).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('; '),
    },
    form: eapiEncrypt(path, JSON.stringify(body)),
  });
}

/** eapi 响应的业务码；响应不是 JSON 时返回 null */
export function responseCode(resp: HttpResponse): [number | null, Record<string, any>] {
  const body = resp.jsonOrNull();
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [null, {}];
  const code = Number.parseInt(String(body.code), 10);
  return [Number.isNaN(code) ? null : code, body];
}
