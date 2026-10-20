// QQ 音乐：刷新登录。刷新时带上保存的全部凭证，成功后把响应里新的凭证写回配置，
// 否则下一轮刷新用的还是旧凭证，刷新能力会逐步退化。

import type { AppContext } from '../../lib/context';
import { request } from '../../lib/http';
import { log } from '../../lib/log';
import { sign } from './sign';
import { loginKind } from './utils';

const logger = log('qqmusic_refresh_login');

export const WX_LOGIN_URL = 'https://u.y.qq.com/cgi-bin/musics.fcg';
export const QQ_LOGIN_URL = 'https://u6.y.qq.com/cgi-bin/musics.fcg';

// 除 qqmusic_key / uin 之外需要随账号保存的登录凭证字段
export const EXTRA_FIELDS = ['refresh_key', 'refresh_token', 'openid', 'access_token', 'unionid'] as const;

const SECRET_FIELDS = new Set(['musickey', 'refresh_key', 'refresh_token', 'access_token', 'openid', 'unionid', 'authst',
  'sessionKey', 'token']);

/** 打码响应体里的敏感字段，用于日志输出 */
export function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => {
      if (!SECRET_FIELDS.has(k)) return [k, mask(v)];
      const text = String(v ?? '');
      return [k, text ? text.slice(0, 4) + '***' : text];
    }));
  }
  return value;
}

function label(user: Record<string, any>): string {
  return `QQ音乐账号(${user.uin ?? ''})`;
}

/**
 * 根据账号的登录类型构造刷新登录请求：优先用保存的 login_type(1 微信、2 QQ)，
 * 没有时按 qqmusic_key 的前缀判断，都不是则走通用接口
 * @returns [url, payload]；key 为空或 uin 无效时返回 null
 */
export function buildRequest(user: Record<string, any>): [string, Record<string, any>] | null {
  const key = String(user.qqmusic_key ?? '');
  const uin = String(user.uin ?? '');
  const extra = Object.fromEntries(EXTRA_FIELDS.map((name) => [name, String(user[name] ?? '')])) as Record<string, string>;
  if (!key) {
    logger.error(`${label(user)}刷新登录失败: qqmusic_key 为空`);
    return null;
  }
  const kind = loginKind(user);
  if (kind === 'wx') {
    return [WX_LOGIN_URL, {
      comm: {
        fPersonality: '0', tmeLoginType: '1', tmeLoginMethod: '1', qq: '', authst: '',
        ct: '11', cv: '12080008', v: '12080008', tmeAppID: 'qqmusic',
      },
      req1: {
        module: 'music.login.LoginServer',
        method: 'Login',
        param: {
          code: '',
          openid: extra.openid,
          refresh_token: extra.refresh_token,
          str_musicid: uin,
          musickey: key,
          unionid: extra.unionid,
          refresh_key: extra.refresh_key,
          loginMode: 2,
        },
      },
    }];
  }
  if (kind === 'qq') {
    if (!/^\d+$/.test(uin)) {
      logger.error(`${label(user)}刷新登录失败: uin 必须是数字`);
      return null;
    }
    const param: Record<string, unknown> = { expired_in: 7776000, musicid: Number(uin), musickey: key };
    // 只带上已有的值，避免用空串干扰服务端判断
    for (const name of ['openid', 'access_token', 'refresh_token', 'refresh_key']) {
      if (extra[name]) param[name] = extra[name];
    }
    return [QQ_LOGIN_URL, { req1: { module: 'QQConnectLogin.LoginServer', method: 'QQLogin', param } }];
  }
  if (/^\d+$/.test(uin)) {
    // 既没有 login_type、key 前缀也不认识(例如手机验证码登录得到的)：使用通用的刷新接口
    return [WX_LOGIN_URL, {
      comm: { ct: '11', cv: '12080008', v: '12080008', tmeAppID: 'qqmusic', tmeLoginType: String(user.login_type || '0') },
      req1: {
        module: 'music.login.LoginServer',
        method: 'Login',
        param: {
          openid: extra.openid,
          access_token: extra.access_token,
          refresh_token: extra.refresh_token,
          expired_in: 0,
          str_musicid: uin,
          musicid: Number(uin),
          musickey: key,
          unionid: extra.unionid,
          refresh_key: extra.refresh_key,
          loginMode: 2,
        },
      },
    }];
  }
  logger.error(`${label(user)}刷新登录失败: qqmusic_key 或 uin 无效`);
  return null;
}

/**
 * 为一个账号发起刷新登录请求，不修改配置
 * @returns 需要写回的字段(配置键 → 值)；失败返回 null
 */
export async function refreshAccount(ctx: AppContext, user: Record<string, any>): Promise<Record<string, string> | null> {
  const built = buildRequest(user);
  if (!built) return null;
  const [url, payload] = built;
  const body = JSON.stringify(payload);
  const resp = await request(ctx, `${url}?sign=${sign(body)}`, { method: 'POST', body });
  const result = resp.jsonOrNull() || {};
  const req1 = result.req1 || {};
  if (req1.code !== 0) {
    logger.warning(`${label(user)}刷新登录失败, code: ${req1.code}，响应体: ${JSON.stringify(mask(result))}`);
    return null;
  }
  const data = req1.data || {};
  if (!data.musickey) {
    logger.warning(`${label(user)}刷新登录失败: 响应中没有新的 musickey，响应体: ${JSON.stringify(mask(result))}`);
    return null;
  }
  const updates: Record<string, string> = { qqmusic_key: String(data.musickey) };
  if (data.musicid) updates.uin = String(data.musicid);
  for (const name of EXTRA_FIELDS) {
    // 响应里为空的字段不覆盖已有值
    if (data[name]) updates[name] = String(data[name]);
  }
  return updates;
}

/** 单账号模式：刷新 module.tx.user */
export async function refresh(ctx: AppContext): Promise<boolean | void> {
  const user = ctx.config.get('module.tx.user') || {};
  if (!user.qqmusic_key || !user.refresh_login?.enable) return;
  const usedKey = String(user.qqmusic_key);
  const updates = await refreshAccount(ctx, user);
  if (!updates) return false;
  const written = await ctx.config.update((config) => {
    // 请求期间管理员可能已经改了 key，这时不能用旧 key 刷出来的结果覆盖
    if (config.module.tx.user.qqmusic_key !== usedKey) return false;
    Object.assign(config.module.tx.user, updates);
  });
  if (!written) {
    logger.warning(`${label(user)}的 qqmusic_key 在刷新期间已被修改，本次刷新结果已丢弃`);
    return;
  }
  logger.info(`${label(user)}刷新登录成功，已更新: ${Object.keys(updates).join(', ')}`);
}

/** 账号池模式：刷新 module.cookiepool.tx 中第 index 个账号 */
export async function refreshPool(ctx: AppContext, index: number): Promise<boolean | void> {
  const user = (ctx.config.get('module.cookiepool.tx') || [])[index];
  if (!user) {
    logger.warning(`QQ音乐账号池刷新登录失败: 账号索引不存在(${index})`);
    return false;
  }
  if (!user.qqmusic_key) return;
  const usedKey = String(user.qqmusic_key);
  const updates = await refreshAccount(ctx, user);
  if (!updates) return false;
  const written = await ctx.config.update((config) => {
    const current = config.module.cookiepool.tx?.[index];
    if (!current || current.qqmusic_key !== usedKey) return false;
    Object.assign(current, updates);
  });
  if (!written) {
    logger.warning(`${label(user)}的配置在刷新期间已被修改，本次刷新结果已丢弃`);
    return;
  }
  logger.info(`${label(user)}刷新登录成功，已更新: ${Object.keys(updates).join(', ')}`);
}
