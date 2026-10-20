// 网易云：刷新登录。刷新接口通过 Set-Cookie 返回新的登录凭证(MUSIC_U 等)，必须写回配置，
// 否则服务一直在用旧凭证，到旧凭证自己过期时登录就失效了。

import type { AppContext } from '../../lib/context';
import { FailedException } from '../../lib/errors';
import { log } from '../../lib/log';
import { eapiRequest, parseCookie, responseCode } from './client';

const logger = log('wy_refresh_login');

// 刷新登录接口常见的失败业务码
const REFRESH_ERRORS: Record<number, string> = {
  301: '登录已失效(MUSIC_U 无效或已过期)，刷新救不回来，请重新登录(后台“音乐账号”页可以扫码登录网易云)',
  [-462]: '触发了网易云的安全验证，请稍后再试，或重新扫码登录',
  8821: '触发了网易云的安全验证，请稍后再试，或重新扫码登录',
};

function parseExpires(value: string): number | null {
  // 网易云下发的是 "Fri, 01-Jan-2100 00:00:00 GMT" 这种写法
  const normalized = (value.match(/-/g) || []).length === 2 ? value.replace(/-/g, ' ') : value;
  const ts = Date.parse(normalized);
  return Number.isNaN(ts) ? null : ts;
}

/**
 * 解析响应里的 Set-Cookie，返回 {名称: 值}。
 * 已被服务端删除(值为空、Max-Age<=0)或已经过期的 Cookie 会被忽略，否则会把还能用的凭证替换成无效值。
 */
export function parseSetCookie(setCookies: string[] | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of setCookies || []) {
    const parts = line.split(';').map((part) => part.trim());
    const eq = parts[0].indexOf('=');
    if (eq < 0) continue;
    const name = parts[0].slice(0, eq).trim();
    const value = parts[0].slice(eq + 1);
    if (!name || !value) continue;
    const attrs: Record<string, string> = {};
    for (const part of parts.slice(1)) {
      const index = part.indexOf('=');
      if (index >= 0) attrs[part.slice(0, index).trim().toLowerCase()] = part.slice(index + 1).trim();
    }
    if ('max-age' in attrs) {
      const maxAge = Number.parseInt(attrs['max-age'], 10);
      if (!Number.isNaN(maxAge) && maxAge <= 0) continue;
    } else if ('expires' in attrs) {
      const expires = parseExpires(attrs.expires);
      if (expires !== null && expires <= Date.now()) continue;
    }
    result[name] = value;
  }
  return result;
}

/** 把新的 Cookie 合并进原来的 Cookie 字符串：同名的替换，原来没有的追加，其余保持不变 */
export function mergeCookies(cookie: string, updates: Record<string, string>): string {
  const merged = { ...parseCookie(cookie), ...updates };
  return Object.entries(merged).map(([name, value]) => `${name}=${value}`).join('; ');
}

/** 用一个 Cookie 刷新登录，返回需要合并的新 Cookie(没有新 Cookie 时为空对象) */
async function refreshCookie(ctx: AppContext, cookie: string): Promise<Record<string, string>> {
  const parsed = parseCookie(cookie);
  if (!parsed.MUSIC_U) throw new FailedException('网易云刷新登录失败：cookie 里没有 MUSIC_U，请重新登录');
  const resp = await eapiRequest(ctx, '/api/login/token/refresh', {}, parsed);
  const [code] = responseCode(resp);
  if (code !== 200) {
    const hint = code !== null ? REFRESH_ERRORS[code] : undefined;
    throw new FailedException(`网易云刷新登录失败(code: ${code})${hint ? '：' + hint : ''}`);
  }
  return parseSetCookie(resp.setCookies);
}

/** 单账号模式：刷新 module.wy.user */
export async function refresh(ctx: AppContext): Promise<void> {
  const used = String(ctx.config.get('module.wy.user.cookie') || '');
  if (!used) return;
  const updates = await refreshCookie(ctx, used);
  if (!Object.keys(updates).length) {
    logger.warning('网易云刷新登录成功，但服务端没有返回新的 cookie，未更新配置');
    return;
  }
  const written = await ctx.config.update((config) => {
    // 请求期间 cookie 可能被管理员修改，这时不能用旧 cookie 刷出来的结果覆盖
    if (config.module.wy.user.cookie !== used) return false;
    config.module.wy.user.cookie = mergeCookies(used, updates);
  });
  if (!written) {
    logger.warning('网易云账号的 cookie 在刷新期间已被修改，本次刷新结果已丢弃');
    return;
  }
  logger.info('网易云刷新登录成功，已更新 cookie: ' + Object.keys(updates).join(', '));
}

/** 账号池模式：刷新 module.cookiepool.wy 中第 index 个账号 */
export async function refreshPool(ctx: AppContext, index: number): Promise<boolean | void> {
  const account = (ctx.config.get('module.cookiepool.wy') || [])[index];
  if (!account) {
    logger.warning(`网易云账号池刷新登录失败: 账号索引不存在(${index})`);
    return false;
  }
  const used = String(account.cookie || '');
  if (!used) return;
  const updates = await refreshCookie(ctx, used);
  if (!Object.keys(updates).length) {
    logger.warning('网易云刷新登录成功，但服务端没有返回新的 cookie，未更新配置');
    return;
  }
  const written = await ctx.config.update((config) => {
    const current = config.module.cookiepool.wy?.[index];
    if (!current || current.cookie !== used) return false;
    current.cookie = mergeCookies(used, updates);
  });
  if (!written) {
    logger.warning('网易云账号的 cookie 在刷新期间已被修改，本次刷新结果已丢弃');
    return;
  }
  logger.info('网易云刷新登录成功，已更新 cookie: ' + Object.keys(updates).join(', '));
}
