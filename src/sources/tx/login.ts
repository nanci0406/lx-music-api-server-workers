// QQ 音乐登录：QQ 扫码、微信扫码、手机验证码。登录成功后得到完整的登录凭证
// (musickey、refresh_key、refresh_token 等)，可以直接写入配置并交给自动刷新登录使用。
// 登录流程的协议细节参考了 YAQMC/qm-api-rs 的文档与行为说明，代码为独立实现(与 Python 版一致)。

import type { AppContext } from '../../lib/context';
import { LoginError } from '../../lib/errors';
import { HttpRequestError, request, type HttpResponse } from '../../lib/http';
import { log } from '../../lib/log';
import { buildQuery, now } from '../../lib/utils';
import { ensureCapacity, LoginSession, saveSession } from '../../services/login-session';
import { loadDevice } from './device';
import { ensureQimei } from './qimei';
import { sign } from './sign';

const logger = log('qqmusic_login');

// 接口地址集中放在这里，测试时可以替换成本地的模拟服务
export const ENDPOINTS = {
  ptqrshow: 'https://ssl.ptlogin2.qq.com/ptqrshow',
  ptqrlogin: 'https://ssl.ptlogin2.qq.com/ptqrlogin',
  check_sig: 'https://ssl.ptlogin2.graph.qq.com/check_sig',
  authorize: 'https://graph.qq.com/oauth2.0/authorize',
  wx_qrconnect: 'https://open.weixin.qq.com/connect/qrconnect',
  wx_qrcode: 'https://open.weixin.qq.com/connect/qrcode/{uuid}',
  wx_poll: 'https://lp.open.weixin.qq.com/connect/l/qrconnect',
  cgi: 'https://u.y.qq.com/cgi-bin/musics.fcg',
};

// 只跟随这些域名下的重定向，避免被带到不相干的站点
const ALLOWED_REDIRECT_SUFFIXES = ['qq.com', 'weixin.qq.com'];

const WECHAT_APP_ID = 'wx48db31d50e334801';
const QQ_CLIENT_ID = '100497308';
const QQ_APP_ID = '716027609';
const PTLOGIN_REFERER = 'https://xui.ptlogin2.qq.com/';
// ptlogin 的 check_sig 等接口会检查 User-Agent，非浏览器的 UA 拿不到 p_skey
export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const QQ_REDIRECT_URI = 'https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https://y.qq.com/';
const WX_REDIRECT_URI = 'https://y.qq.com/portal/wx_redirect.html?login_type=2&surl=https://y.qq.com/';
export const DEFAULT_REFRESH_INTERVAL = 86000;
export const SMS_COOLDOWN = 60; // 同一个手机号两次发送验证码的最短间隔
const ANDROID_VERSION = 14090008;

const QR_EVENTS: Record<number, 'done' | 'scan' | 'conf' | 'timeout' | 'refuse'> = {
  0: 'done', 405: 'done',
  66: 'scan', 408: 'scan',
  67: 'conf', 404: 'conf',
  65: 'timeout', 402: 'timeout',
  68: 'refuse', 403: 'refuse',
};

const LOGIN_MESSAGES: Record<number, string> = {
  1000: '登录鉴权参数无效或已过期',
  104400: '登录鉴权参数无效或已过期',
  104401: '登录鉴权参数无效或已过期',
  20261: '登录参数错误',
  20271: '验证码错误',
  20272: '账号绑定异常',
  20274: '账号绑定缺失',
  20277: '账号受限',
  20278: '账号受限',
  20279: '登录设备数量超限',
  20450: '账号已被封禁',
  104604: '操作过于频繁',
};

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

export function hash33(text: string, seed = 0): number {
  let value = seed;
  for (const ch of text) value = ((value << 5) + value + ch.charCodeAt(0)) & 0x7fffffff;
  return value;
}

export function extractBetween(text: string, start: string, end: string): string {
  const index = text.indexOf(start);
  if (index < 0) return '';
  const rest = text.slice(index + start.length);
  const endIndex = rest.indexOf(end);
  return endIndex < 0 ? '' : rest.slice(0, endIndex);
}

/** Set-Cookie 里设置的 Cookie；同名的取最后一个非空值(服务端可能先下发一个空值清掉旧 Cookie) */
export function responseCookies(setCookies: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of setCookies) {
    const first = line.split(';', 1)[0].trim();
    const eq = first.indexOf('=');
    if (eq < 0) continue;
    const key = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

interface RawOptions {
  params?: Record<string, string>;
  form?: Record<string, string>;
  body?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  timeout?: number;
}

/** 不跟随重定向、不带伪装 IP 的请求；Cookie 由调用方显式传递 */
async function rawRequest(method: string, url: string, options: RawOptions = {}): Promise<HttpResponse> {
  const headers: Record<string, string> = { 'User-Agent': BROWSER_UA, ...(options.headers || {}) };
  if (options.cookies && Object.keys(options.cookies).length) {
    headers.Cookie = Object.entries(options.cookies).map(([name, value]) => `${name}=${value}`).join('; ');
  }
  const target = options.params ? `${url}${url.includes('?') ? '&' : '?'}${buildQuery(options.params)}` : url;
  try {
    return await request(null, target, {
      method,
      headers,
      form: options.form,
      body: options.body,
      redirect: 'manual',
      fakeIp: false,
      timeout: (options.timeout || 20) * 1000,
    });
  } catch (e) {
    if (e instanceof HttpRequestError) throw new LoginError(e.timeout ? '请求超时' : '网络请求失败');
    throw e;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function redirectAllowed(url: string): boolean {
  let parts: URL;
  try {
    parts = new URL(url);
  } catch {
    return false;
  }
  const host = parts.hostname.toLowerCase();
  return (parts.protocol === 'http:' || parts.protocol === 'https:') &&
    ALLOWED_REDIRECT_SUFFIXES.some((suffix) => host === suffix || host.endsWith('.' + suffix));
}

// ---------------------------------------------------------------------------
// CGI 调用与凭证解析
// ---------------------------------------------------------------------------

export async function cgiCall(
  module: string, method: string, param: unknown, comm: unknown, userAgent?: string,
): Promise<[number | null, Record<string, any>]> {
  const body = JSON.stringify({ comm, req_0: { module, method, param } });
  const resp = await rawRequest('POST', `${ENDPOINTS.cgi}?sign=${sign(body)}`, {
    body,
    headers: {
      'User-Agent': userAgent || BROWSER_UA,
      Referer: 'https://y.qq.com/',
      Origin: 'https://y.qq.com',
      'Content-Type': 'application/json',
    },
  });
  if (resp.status !== 200) throw new LoginError(`接口返回了 HTTP ${resp.status}`);
  const result = resp.jsonOrNull();
  if (!result || typeof result !== 'object') throw new LoginError('接口返回的不是有效的 JSON');
  if (result.code !== 0 && result.code !== undefined && result.code !== null) {
    throw new LoginError('接口返回了全局错误', result.code);
  }
  const inner = result.req_0 || {};
  return [inner.code ?? null, inner.data || {}];
}

export interface TxCredential {
  qqmusic_key: string;
  uin: string;
  refresh_key: string;
  refresh_token: string;
  openid: string;
  access_token: string;
  unionid: string;
  login_type: string;
  nick: string;
}

/** 校验登录接口的响应，转换成可以写入配置的凭证 */
export function credentialFromLogin(code: number | null, data: Record<string, any>, loginType: number | string): TxCredential {
  if (code !== 0) {
    throw new LoginError((code !== null && LOGIN_MESSAGES[code]) || `登录失败(业务码 ${code})`, code);
  }
  const musickey = data.musickey || data.musicKey || '';
  const musicid = data.musicid || 0;
  const uin = musicid ? String(musicid) : String(data.str_musicid || data.uin || '');
  if (!musickey || !uin) throw new LoginError('登录接口没有返回有效的 musickey 或 uin');
  return {
    qqmusic_key: String(musickey),
    uin,
    refresh_key: String(data.refresh_key || ''),
    refresh_token: String(data.refresh_token || ''),
    openid: String(data.openid || ''),
    access_token: String(data.access_token || ''),
    unionid: String(data.unionid || ''),
    login_type: String(loginType),
    nick: String(data.nick || ''),
  };
}

// ---------------------------------------------------------------------------
// QQ 扫码
// ---------------------------------------------------------------------------

export async function qqQrStart(): Promise<[string, Uint8Array, string]> {
  const resp = await rawRequest('GET', ENDPOINTS.ptqrshow, {
    params: {
      appid: QQ_APP_ID, e: '2', l: 'M', s: '3', d: '72', v: '4',
      t: (Date.now() / 1000).toFixed(3), daid: '383', pt_3rd_aid: QQ_CLIENT_ID,
    },
    headers: { Referer: PTLOGIN_REFERER },
  });
  if (resp.status !== 200) throw new LoginError(`获取二维码失败(HTTP ${resp.status})`);
  const qrsig = responseCookies(resp.setCookies).qrsig;
  if (!qrsig) throw new LoginError('获取二维码失败: 没有拿到 qrsig');
  return [qrsig, resp.body, 'image/png'];
}

export interface QqLoginInfo {
  uin: string;
  sigx: string;
  url: string;
  set_cookies: string[];
}

export async function qqQrCheck(qrsig: string): Promise<[string, QqLoginInfo | null]> {
  const resp = await rawRequest('GET', ENDPOINTS.ptqrlogin, {
    params: {
      u1: 'https://graph.qq.com/oauth2.0/login_jump',
      ptqrtoken: String(hash33(qrsig)),
      ptredirect: '0', h: '1', t: '1', g: '1', from_ui: '1', ptlang: '2052',
      action: `0-0-${Date.now()}`,
      js_ver: '20102616', js_type: '1', pt_uistyle: '40',
      aid: QQ_APP_ID, daid: '383', pt_3rd_aid: QQ_CLIENT_ID, has_onekey: '1',
    },
    headers: { Referer: PTLOGIN_REFERER },
    cookies: { qrsig },
  });
  const match = /ptuiCB\(([\s\S]*)\)/.exec(resp.text());
  const args = match ? Array.from(match[1].matchAll(/'([^']*)'/g), (m) => m[1]) : [];
  if (!args.length) throw new LoginError('获取二维码状态失败: 无法解析响应');
  const code = Number.parseInt(args[0], 10);
  if (Number.isNaN(code)) throw new LoginError('获取二维码状态失败: 状态码无效');
  const event = QR_EVENTS[code];
  if (!event) throw new LoginError(`无法识别的二维码状态码: ${code}`);
  if (event !== 'done') return [event, null];
  if (args.length < 3) throw new LoginError('获取登录凭据失败: 缺少必要参数');
  // 只认 ?uin= / &uin= 这样的完整参数名，不会误匹配 pt_uin= 之类的参数
  const sigx = /[?&]ptsigx=(.+?)&s_url/.exec(args[2])?.[1] || '';
  const uin = /[?&]uin=(.+?)&service/.exec(args[2])?.[1] || '';
  if (!sigx || !uin) throw new LoginError('获取登录凭据失败: 无法解析必要参数');
  return [event, { uin, sigx, url: args[2], set_cookies: [...resp.setCookies] }];
}

/**
 * 从 Set-Cookie 里挑出浏览器会带给 host 的 Cookie：只要带 Domain 且域名匹配的；
 * 没有 Domain 的只属于下发它的那个主机，不会被带到别的主机
 */
export function cookiesForHost(setCookies: string[], host: string): Record<string, string> {
  host = (host || '').toLowerCase();
  const result: Record<string, string> = {};
  for (const line of setCookies || []) {
    const parts = line.split(';').map((part) => part.trim());
    const eq = parts[0].indexOf('=');
    if (eq < 0) continue;
    const name = parts[0].slice(0, eq).trim();
    const value = parts[0].slice(eq + 1).trim();
    let domain = '';
    for (const attr of parts.slice(1)) {
      const index = attr.indexOf('=');
      const key = (index < 0 ? attr : attr.slice(0, index)).trim().toLowerCase();
      if (key === 'domain') domain = attr.slice(index + 1).trim().replace(/^\.+/, '').toLowerCase();
    }
    if (name && value && domain && (host === domain || host.endsWith('.' + domain))) result[name] = value;
  }
  return result;
}

/** 只跟随 ptlogin 给出的 check_sig 地址(qq.com 域名下)，不访问其他地址 */
export function checkSigUrlAllowed(url: string): boolean {
  let parts: URL;
  try {
    parts = new URL(url || '');
  } catch {
    return false;
  }
  if (!parts.pathname.endsWith('/check_sig')) return false;
  return redirectAllowed(url) || parts.host === new URL(ENDPOINTS.check_sig).host;
}

/** 一次请求的结果摘要(只有状态码和跳转的域名、路径，不含参数)，用于排查问题 */
function describe(resp: HttpResponse): string {
  let detail = `HTTP ${resp.status}`;
  const location = resp.headers.get('Location');
  if (location) {
    try {
      const target = new URL(location, resp.url);
      if (target.hostname) detail += `，跳转到 ${target.hostname}${target.pathname}`;
    } catch {
      // 忽略无法解析的地址
    }
  }
  return detail;
}

/**
 * 扫码确认后，换取 QQ 互联的授权 code。
 * 先自己拼参数请求 check_sig(不带 Cookie)拿 p_skey；拿不到时再按浏览器的方式重试一次：
 * 直接打开 ptlogin 给出的地址，带上登录成功时下发的、浏览器会带的 Cookie
 */
export async function qqAuthorizeCode(uin: string, sigx: string, checkUrl = '', loginSetCookies: string[] = []): Promise<string> {
  let resp = await rawRequest('GET', ENDPOINTS.check_sig, {
    params: {
      uin, pttype: '1', service: 'ptqrlogin', nodirect: '0', ptsigx: sigx,
      s_url: 'https://graph.qq.com/oauth2.0/login_jump', ptlang: '2052', ptredirect: '100',
      aid: QQ_APP_ID, daid: '383', j_later: '0', low_login_hour: '0', regmaster: '0',
      pt_login_type: '3', pt_aid: '0', pt_aaid: '16', pt_light: '0', pt_3rd_aid: QQ_CLIENT_ID,
    },
    headers: { Referer: PTLOGIN_REFERER },
  });
  let sigCookies = responseCookies(resp.setCookies);
  const attempts = [describe(resp)];
  if (!sigCookies.p_skey && checkSigUrlAllowed(checkUrl)) {
    logger.info('QQ 扫码登录：check_sig 没有返回 p_skey，改用浏览器的方式重试');
    resp = await rawRequest('GET', checkUrl, {
      headers: { Referer: PTLOGIN_REFERER },
      cookies: cookiesForHost(loginSetCookies, hostOf(checkUrl)),
    });
    sigCookies = responseCookies(resp.setCookies);
    attempts.push(describe(resp));
  }
  const pSkey = sigCookies.p_skey || '';
  if (!pSkey) {
    const detail = attempts.join('；重试：');
    logger.warning(`QQ 扫码登录 check_sig 没有返回 p_skey: ${detail}，返回的 Cookie: ${Object.keys(sigCookies).sort().join(', ') || '无'}`);
    throw new LoginError(`获取登录凭据失败: 没有拿到 p_skey(${detail})`);
  }

  const form: Record<string, string> = {
    response_type: 'code', client_id: QQ_CLIENT_ID, redirect_uri: QQ_REDIRECT_URI,
    scope: 'get_user_info,get_app_friends', state: 'state', switch: '', from_ptlogin: '1',
    src: '1', update_auth: '1', openapi: '1010_1030',
    g_tk: String(hash33(pSkey, 5381)), auth_time: String(Date.now()), ui: crypto.randomUUID(),
  };
  // 带上 check_sig 下发的全部 Cookie(p_skey、p_uin、pt4_token 等)，和浏览器的行为一致
  let method = 'POST';
  let url = ENDPOINTS.authorize;
  let data: Record<string, string> | undefined = form;
  // 手动跟随重定向：一拿到带 code 的地址就停止，不去请求最终的页面
  for (let i = 0; i < 5; i++) {
    resp = await rawRequest(method, url, { form: data, cookies: sigCookies });
    const location = resp.headers.get('Location');
    if (!location) break;
    url = new URL(location, url).toString();
    const code = new URL(url).searchParams.get('code');
    if (code) return code;
    if (!redirectAllowed(url)) throw new LoginError('授权过程被重定向到了未知的地址');
    method = 'GET';
    data = undefined;
  }
  const stop = new URL(url);
  logger.warning(`QQ 扫码登录没有拿到授权 code: HTTP ${resp.status}，停在 ${stop.hostname}${stop.pathname}`);
  throw new LoginError(`获取授权 code 失败(HTTP ${resp.status})`);
}

export async function qqExchange(ctx: AppContext, code: string): Promise<TxCredential> {
  // 和手机验证码登录一样按安卓客户端调用
  const [comm, userAgent] = await androidComm(ctx, { tmeLoginType: 2 });
  const [resultCode, data] = await cgiCall('QQConnectLogin.LoginServer', 'QQLogin', { code }, comm, userAgent);
  return credentialFromLogin(resultCode, data, 2);
}

// ---------------------------------------------------------------------------
// 微信扫码
// ---------------------------------------------------------------------------

export async function wxQrStart(): Promise<[string, Uint8Array, string]> {
  const resp = await rawRequest('GET', ENDPOINTS.wx_qrconnect, {
    params: {
      appid: WECHAT_APP_ID, redirect_uri: WX_REDIRECT_URI, response_type: 'code',
      scope: 'snsapi_login', state: 'STATE',
      href: 'https://y.qq.com/mediastyle/music_v17/src/css/popup_wechat.css#wechat_redirect',
    },
  });
  const uuid = extractBetween(resp.text(), 'uuid=', '"');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(uuid)) throw new LoginError('获取二维码失败: 没有拿到 uuid');
  const image = await rawRequest('GET', ENDPOINTS.wx_qrcode.replace('{uuid}', uuid), {
    headers: { Referer: ENDPOINTS.wx_qrconnect },
  });
  if (image.status !== 200 || !image.body.length) throw new LoginError('获取二维码失败');
  return [uuid, image.body, 'image/jpeg'];
}

/** 查询微信二维码状态(长轮询)；只有 done 时才有授权 code */
export async function wxQrCheck(uuid: string, timeout = 25): Promise<[string, string | null]> {
  let resp: HttpResponse;
  try {
    resp = await rawRequest('GET', ENDPOINTS.wx_poll, {
      params: { uuid, _: String(Date.now()) },
      headers: { Referer: 'https://open.weixin.qq.com/' },
      timeout,
    });
  } catch (e) {
    if (e instanceof LoginError && e.message === '请求超时') return ['scan', null]; // 长轮询到点没有结果，等同于还没扫码
    throw e;
  }
  const text = resp.text();
  const code = Number.parseInt(extractBetween(text, 'window.wx_errcode=', ';'), 10);
  if (Number.isNaN(code)) throw new LoginError('获取二维码状态失败: 无法解析响应');
  const event = QR_EVENTS[code];
  if (!event) throw new LoginError(`无法识别的二维码状态码: ${code}`);
  if (event !== 'done') return [event, null];
  const wxCode = extractBetween(text, "window.wx_code='", "'");
  if (!wxCode) throw new LoginError('获取授权 code 失败');
  return [event, wxCode];
}

export async function wxExchange(ctx: AppContext, code: string): Promise<TxCredential> {
  const [comm, userAgent] = await androidComm(ctx, { tmeLoginType: 1 });
  const [resultCode, data] = await cgiCall('music.login.LoginServer', 'Login', { code, strAppid: WECHAT_APP_ID }, comm, userAgent);
  return credentialFromLogin(resultCode, data, 1);
}

// ---------------------------------------------------------------------------
// 手机验证码登录
// ---------------------------------------------------------------------------

/** 构造“安卓客户端”风格的 comm(含设备信息和 QIMEI) */
export async function androidComm(ctx: AppContext, extra: Record<string, unknown>): Promise<[Record<string, unknown>, string]> {
  const device = await loadDevice(ctx.db);
  const qimei = await ensureQimei(ctx, device);
  const guid = device.open_udid;
  const comm: Record<string, unknown> = {
    ct: 11, cv: ANDROID_VERSION, v: ANDROID_VERSION, chid: '10003505',
    qq: '0', authst: '', tmeAppID: 'qqmusic', tmeLoginType: 0,
    QIMEI: qimei.q16 || '', QIMEI36: qimei.q36 || '',
    OpenUDID: guid, udid: guid, uid: '', OpenUDID2: guid, sid: '',
    aid: device.android_id, os_ver: device.version.release, phonetype: device.model,
    devicelevel: String(device.version.sdk), newdevicelevel: String(device.version.sdk),
    rom: device.fingerprint,
    ...extra,
  };
  return [comm, `QQMusic ${ANDROID_VERSION}(android ${device.version.release})`];
}

export function validatePhone(phone: unknown, countryCode: unknown = '86'): [string, string] {
  const p = String(phone ?? '').trim();
  const c = String(countryCode || '86').trim().replace(/^\++/, '');
  if (!/^\d{5,15}$/.test(p)) throw new LoginError('手机号格式不正确');
  if (!/^\d{1,4}$/.test(c)) throw new LoginError('国家/地区区号格式不正确');
  return [p, c];
}

export async function phoneSendCode(ctx: AppContext, phone: string, countryCode = '86'): Promise<{ state: string; url?: string }> {
  [phone, countryCode] = validatePhone(phone, countryCode);
  const [comm, userAgent] = await androidComm(ctx, { tmeLoginMethod: 3 });
  const [code, data] = await cgiCall('music.login.LoginServer', 'SendPhoneAuthCode',
    { tmeAppid: 'qqmusic', areaCode: countryCode, phoneNo: phone }, comm, userAgent);
  if (code === 0) return { state: 'sent' };
  if (code === 20276) return { state: 'captcha', url: data.securityURL || '' };
  if (code === 100001) return { state: 'frequency' };
  if (code === 104400) throw new LoginError('发送验证码失败：手机号无效或请求被拒绝', code);
  throw new LoginError('发送验证码失败', code);
}

export async function phoneLogin(ctx: AppContext, phone: string, authCode: string, countryCode = '86'): Promise<TxCredential> {
  [phone] = validatePhone(phone, countryCode);
  authCode = String(authCode ?? '').trim();
  if (!/^\d{4,8}$/.test(authCode)) throw new LoginError('验证码格式不正确');
  const [comm, userAgent] = await androidComm(ctx, { tmeLoginMethod: 3, tmeLoginType: 0 });
  const [code, data] = await cgiCall('music.login.LoginServer', 'Login', { code: authCode, loginMode: 1, phoneNo: phone },
    comm, userAgent);
  return credentialFromLogin(code, data, data.loginType || 0);
}

// ---------------------------------------------------------------------------
// 登录会话
// ---------------------------------------------------------------------------

/** 发起扫码登录，返回登录会话和二维码图片 */
export async function startQr(ctx: AppContext, kind: string, owner: string): Promise<[LoginSession, Uint8Array, string]> {
  if (kind !== 'qq' && kind !== 'wx') throw new LoginError('不支持的登录方式');
  await ensureCapacity(ctx.db);
  const [identifier, image, mimetype] = kind === 'qq' ? await qqQrStart() : await wxQrStart();
  const ls = new LoginSession(kind, owner);
  ls.data = { identifier };
  await saveSession(ctx.db, ls);
  return [ls, image, mimetype];
}

/** 查询一次二维码状态；扫码确认后换取凭证。只修改 ls，由调用方保存 */
export async function advance(ctx: AppContext, ls: LoginSession): Promise<void> {
  try {
    if (ls.kind === 'qq') {
      const [event, info] = await qqQrCheck(ls.data.identifier);
      if (event === 'done' && info) {
        logger.info('QQ 扫码登录：手机已确认，正在换取登录凭证');
        const code = await qqAuthorizeCode(info.uin, info.sigx, info.url, info.set_cookies);
        ls.credential = await qqExchange(ctx, code);
        ls.finish('done', '登录成功');
        return;
      }
      applyEvent(ls, event);
    } else {
      const [event, code] = await wxQrCheck(ls.data.identifier);
      if (event === 'done' && code) {
        ls.credential = await wxExchange(ctx, code);
        ls.finish('done', '登录成功');
        return;
      }
      applyEvent(ls, event);
    }
  } catch (e) {
    if (e instanceof LoginError) {
      ls.finish('error', e.message);
    } else {
      logger.warning(`扫码登录异常: ${e}`);
      ls.finish('error', '登录过程出错，请稍后重试');
    }
  }
}

function applyEvent(ls: LoginSession, event: string): void {
  if (event === 'timeout') ls.finish('timeout', '二维码已失效');
  else if (event === 'refuse') ls.finish('refuse', '你已在手机上拒绝了登录');
  else ls.state = event as 'scan' | 'conf';
}

/** 发送验证码；同一个手机号 SMS_COOLDOWN 秒内只发送一次 */
export async function phoneSend(ctx: AppContext, phone: unknown, countryCode: unknown = '86') {
  const [p, c] = validatePhone(phone, countryCode);
  const key = `sms:${c}:${p}`;
  const last = await ctx.db.prepare('SELECT ts FROM request_times WHERE key = ?').bind(key).first<{ ts: number }>();
  if (last && Date.now() / 1000 - last.ts < SMS_COOLDOWN) return { state: 'frequency' };
  const result = await phoneSendCode(ctx, p, c);
  if (result.state === 'sent') {
    await ctx.db.prepare('INSERT INTO request_times (key, ts) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET ts = excluded.ts')
      .bind(key, Date.now() / 1000).run();
  }
  return result;
}

export async function phoneVerify(ctx: AppContext, owner: string, phone: unknown, code: unknown, countryCode: unknown = '86') {
  const [p, c] = validatePhone(phone, countryCode);
  const credential = await phoneLogin(ctx, p, String(code ?? ''), c);
  const ls = new LoginSession('phone', owner);
  ls.credential = credential;
  ls.finish('done', '登录成功');
  await saveSession(ctx.db, ls);
  return ls;
}

// ---------------------------------------------------------------------------
// 保存到配置
// ---------------------------------------------------------------------------

const CONFIG_FIELDS = ['qqmusic_key', 'uin', 'refresh_key', 'refresh_token', 'openid', 'access_token', 'unionid', 'login_type'];

/**
 * 把登录得到的凭证写入配置
 * @param target main 写入 module.tx.user；pool 加入 module.cookiepool.tx(同一个 uin 会被更新)
 * @returns 给用户看的说明文字
 */
export async function applyCredential(ctx: AppContext, ls: LoginSession, target: string, enableRefresh: boolean): Promise<string> {
  if (ls.state !== 'done' || !ls.credential) throw new LoginError('这次登录没有可保存的凭证');
  const credential: Record<string, string> = Object.fromEntries(
    CONFIG_FIELDS.map((name) => [name, String(ls.credential![name] ?? '')]));
  let note: string;
  if (target === 'main') {
    await ctx.config.update((config) => {
      Object.assign(config.module.tx.user, credential);
      if (enableRefresh) {
        config.module.tx.user.refresh_login = { ...(config.module.tx.user.refresh_login || {}), enable: true };
        if (!config.module.tx.user.refresh_login.interval) config.module.tx.user.refresh_login.interval = DEFAULT_REFRESH_INTERVAL;
      }
    });
    note = '已保存为主账号 (module.tx.user)';
    if (ctx.config.cookiePool) note += '；当前启用了 cookie 池，主账号配置会被忽略，请改用“加入 cookie 池”';
  } else if (target === 'pool') {
    let size = 0;
    await ctx.config.update((config) => {
      // 丢掉默认配置里留空的占位账号
      const pool = (config.module.cookiepool.tx || []).filter((account: any) => account && account.qqmusic_key);
      const entry: Record<string, any> = {
        ...credential,
        refresh_login: { enable: enableRefresh, interval: DEFAULT_REFRESH_INTERVAL },
      };
      const index = pool.findIndex((account: any) => String(account.uin) === credential.uin);
      if (index >= 0) {
        entry.refresh_login = pool[index].refresh_login || entry.refresh_login;
        if (enableRefresh) entry.refresh_login = { ...entry.refresh_login, enable: true };
        pool[index] = entry;
      } else {
        pool.push(entry);
      }
      config.module.cookiepool.tx = pool;
      size = pool.length;
    });
    note = `已加入 cookie 池 (module.cookiepool.tx，共 ${size} 个账号)`;
    if (!ctx.config.cookiePool) note += '；当前没有启用 cookie 池，需要把 common.cookiepool 设为 true 才会使用';
  } else {
    throw new LoginError('不支持的保存位置');
  }
  ls.credential = null; // 凭证已写入配置，会话里不再保留
  ls.state = 'applied';
  ls.message = note;
  ls.finishedAt = ls.finishedAt ?? now();
  await saveSession(ctx.db, ls);
  return note;
}
