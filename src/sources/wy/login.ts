// 网易云音乐扫码登录(给后台“音乐账号”页使用)。流程参考 NeteaseCloudMusicApi：
//   1. /api/login/qrcode/unikey 拿到 unikey，二维码内容是 https://music.163.com/login?codekey=<unikey>
//   2. 查询 /api/login/qrcode/client/login：800 已过期、801 等待扫码、802 已扫码待确认、803 登录成功
//   3. 登录成功时服务端通过 Set-Cookie 下发 MUSIC_U、__csrf 等登录凭证

import qrcode from 'qrcode-generator';
import type { AppContext } from '../../lib/context';
import { LoginError } from '../../lib/errors';
import { log } from '../../lib/log';
import { utf8Encode } from '../../lib/crypto';
import { now } from '../../lib/utils';
import { ensureCapacity, LoginSession, saveSession } from '../../services/login-session';
import { deviceFields, eapiRequest, responseCode } from './client';
import { parseSetCookie } from './refresh-login';

const logger = log('wy_login');

export const QR_CONTENT = 'https://music.163.com/login?codekey={key}';
export const DEFAULT_REFRESH_INTERVAL = 86400;

const QR_EVENTS: Record<number, 'timeout' | 'scan' | 'conf' | 'done'> = { 800: 'timeout', 801: 'scan', 802: 'conf', 803: 'done' };
const RISK_CODES = [8821, -462]; // 网易云要求做行为验证(风控)

/** 生成白底的二维码 SVG(深色模式下也能扫) */
export function qrSvg(content: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(content);
  qr.make();
  const count = qr.getModuleCount();
  const border = 2;
  const size = count + border * 2;
  let path = '';
  for (let row = 0; row < count; row++) {
    // 同一行里连续的深色模块合并成一个矩形
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue;
      let run = 1;
      while (col + run < count && qr.isDark(row, col + run)) run++;
      path += `M${col + border} ${row + border}h${run}v1h-${run}z`;
      col += run - 1;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 8}" height="${size * 8}" ` +
    `shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
}

function checkCode(code: number | null, body: Record<string, any>, action: string): never {
  if (code !== null && RISK_CODES.includes(code)) {
    throw new LoginError('网易云要求进行安全验证(风控)，暂时无法扫码登录，请稍后再试', code);
  }
  if (code === null) throw new LoginError(`${action}失败：网易云返回了无法识别的内容`);
  const message = body.message || body.msg || '';
  throw new LoginError(`${action}失败(code: ${code}${message ? '，' + message : ''})`, code);
}

export async function qrStart(ctx: AppContext, device: Record<string, string>): Promise<[string, string]> {
  const resp = await eapiRequest(ctx, '/api/login/qrcode/unikey', { type: 3 }, device);
  const [code, body] = responseCode(resp);
  const unikey = String(body.unikey || '');
  if (code !== 200 || !unikey) checkCode(code, body, '获取二维码');
  return [unikey, qrSvg(QR_CONTENT.replace('{key}', unikey))];
}

export async function qrCheck(ctx: AppContext, unikey: string, device: Record<string, string>): Promise<[string, Record<string, any>, string[]]> {
  const resp = await eapiRequest(ctx, '/api/login/qrcode/client/login', { key: unikey, type: 3 }, device);
  const [code, body] = responseCode(resp);
  const event = code !== null ? QR_EVENTS[code] : undefined;
  if (!event) checkCode(code, body, '查询二维码状态');
  return [event, body, resp.setCookies];
}

/** 用新拿到的凭证查询账号信息，同时确认凭证可用；返回 [用户 ID, 昵称] */
export async function fetchAccount(ctx: AppContext, cookie: Record<string, string>): Promise<[string, string]> {
  const resp = await eapiRequest(ctx, '/api/nuser/account/get', {}, cookie);
  const [code, body] = responseCode(resp);
  const uid = body.account?.id || body.profile?.userId;
  if (code !== 200 || !uid) throw new LoginError('登录成功，但没能用新的凭证查到账号信息，请重试');
  return [String(uid), String(body.profile?.nickname || '')];
}

/** 把登录成功时下发的 Cookie 和设备信息合成要保存的 Cookie */
export function buildCredential(setCookies: string[], device: Record<string, string>): Record<string, string> {
  const cookies = parseSetCookie(setCookies);
  if (!cookies.MUSIC_U) throw new LoginError('登录成功，但网易云没有下发 MUSIC_U');
  const merged = { ...cookies };
  for (const [name, value] of Object.entries(device)) if (!(name in merged)) merged[name] = value;
  return merged;
}

export async function startQr(ctx: AppContext, owner: string): Promise<[LoginSession, Uint8Array, string]> {
  await ensureCapacity(ctx.db);
  const device = deviceFields('pc');
  const [unikey, svg] = await qrStart(ctx, device);
  const ls = new LoginSession('wy', owner);
  ls.data = { unikey, device };
  await saveSession(ctx.db, ls);
  return [ls, utf8Encode(svg), 'image/svg+xml'];
}

/** 查询一次二维码状态；登录成功时整理好凭证。只修改 ls，由调用方保存 */
export async function advance(ctx: AppContext, ls: LoginSession): Promise<void> {
  try {
    const [event, body, setCookies] = await qrCheck(ctx, ls.data.unikey, ls.data.device);
    if (event === 'done') {
      const cookie = buildCredential(setCookies, ls.data.device);
      const [uid, nick] = await fetchAccount(ctx, cookie);
      ls.credential = {
        cookie: Object.entries(cookie).map(([name, value]) => `${name}=${value}`).join('; '),
        uin: uid,
        nick: nick || ls.message,
        has_refresh: true, // 网易云用 MUSIC_U 本身刷新，不需要额外的 refresh 凭证
      };
      ls.finish('done', '登录成功');
      return;
    }
    if (event === 'timeout') {
      ls.finish('timeout', '二维码已失效');
      return;
    }
    ls.state = event as 'scan' | 'conf';
    if (event === 'conf' && body.nickname) ls.message = String(body.nickname); // 扫码后先显示扫码人的昵称
  } catch (e) {
    if (e instanceof LoginError) {
      ls.finish('error', e.message);
    } else {
      logger.warning(`网易云扫码登录异常: ${e}`);
      ls.finish('error', '登录过程出错，请稍后重试');
    }
  }
}

/**
 * 把登录得到的 Cookie 写入配置
 * @param target main 写入 module.wy.user；pool 加入 module.cookiepool.wy(同一个账号会被更新)
 */
export async function applyCredential(ctx: AppContext, ls: LoginSession, target: string, enableRefresh: boolean): Promise<string> {
  if (ls.state !== 'done' || !ls.credential) throw new LoginError('这次登录没有可保存的凭证');
  const cookie = String(ls.credential.cookie);
  const uid = String(ls.credential.uin);
  let note: string;
  if (target === 'main') {
    await ctx.config.update((config) => {
      config.module.wy.user.cookie = cookie;
      if (enableRefresh) {
        config.module.wy.user.refresh_login = { ...(config.module.wy.user.refresh_login || {}), enable: true };
        if (!config.module.wy.user.refresh_login.interval) config.module.wy.user.refresh_login.interval = DEFAULT_REFRESH_INTERVAL;
      }
    });
    note = '已保存为主账号 (module.wy.user)';
    if (ctx.config.cookiePool) note += '；当前启用了 cookie 池，主账号配置会被忽略，请改用“加入 cookie 池”';
  } else if (target === 'pool') {
    let size = 0;
    await ctx.config.update((config) => {
      const pool = (config.module.cookiepool.wy || []).filter((account: any) => account && account.cookie);
      const entry: Record<string, any> = {
        cookie, uid, refresh_login: { enable: enableRefresh, interval: DEFAULT_REFRESH_INTERVAL },
      };
      const index = pool.findIndex((account: any) => String(account.uid || '') === uid);
      if (index >= 0) {
        entry.refresh_login = pool[index].refresh_login || entry.refresh_login;
        if (enableRefresh) entry.refresh_login = { ...entry.refresh_login, enable: true };
        pool[index] = entry;
      } else {
        pool.push(entry);
      }
      config.module.cookiepool.wy = pool;
      size = pool.length;
    });
    note = `已加入 cookie 池 (module.cookiepool.wy，共 ${size} 个账号)`;
    if (!ctx.config.cookiePool) note += '；当前没有启用 cookie 池，需要把 common.cookiepool 设为 true 才会使用';
  } else {
    throw new LoginError('不支持的保存位置');
  }
  ls.credential = null;
  ls.state = 'applied';
  ls.message = note;
  ls.finishedAt = ls.finishedAt ?? now();
  await saveSession(ctx.db, ls);
  return note;
}
