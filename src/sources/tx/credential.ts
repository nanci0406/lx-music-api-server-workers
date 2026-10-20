// QQ 音乐：检查登录凭证是否有效，供模块状态检查使用

import type { AppContext } from '../../lib/context';
import { getCache, setCache } from '../../lib/cache';
import { sha256Hex } from '../../lib/crypto';
import { request } from '../../lib/http';
import { log } from '../../lib/log';
import { sign } from './sign';
import { loginKind } from './utils';

const logger = log('qqmusic_credential');

// GetLoginUserInfo 返回这些业务码表示登录凭证已过期/无效
export const EXPIRED_CODES = [1000, 104400, 104401];
// 检查结果缓存时长(秒)，避免频繁请求官方接口
export const CACHE_SECONDS = 1800;

export type CredentialState = 'valid' | 'invalid' | 'unknown';

function accounts(ctx: AppContext): Record<string, any>[] {
  const users: Record<string, any>[] = ctx.config.cookiePool
    ? ctx.config.get('module.cookiepool.tx') || []
    : [ctx.config.get('module.tx.user') || {}];
  return users.filter((user) => user && user.qqmusic_key);
}

export async function checkAccount(ctx: AppContext, user: Record<string, any>): Promise<CredentialState> {
  const uin = String(user.uin ?? '');
  const kind = loginKind(user);
  const payload = {
    comm: {
      ct: '11', cv: '12080008', v: '12080008', tmeAppID: 'qqmusic', format: 'json',
      qq: uin,
      authst: String(user.qqmusic_key ?? ''),
      tmeLoginType: kind === 'wx' ? '1' : kind === 'qq' ? '2' : String(user.login_type || '0'),
    },
    req: { module: 'music.UserInfo.userInfoServer', method: 'GetLoginUserInfo', param: {} },
  };
  const body = JSON.stringify(payload);
  const resp = await request(ctx, `https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign(body)}`, { method: 'POST', body });
  const code = resp.jsonOrNull()?.req?.code;
  if (code === 0) return 'valid';
  if (EXPIRED_CODES.includes(code)) return 'invalid';
  logger.warning(`检查QQ音乐账号(${uin})登录状态得到未知业务码: ${code}`);
  return 'unknown';
}

/** 检查所有已配置的账号；force 为 true 时忽略缓存 */
export async function checkAll(ctx: AppContext, force = false) {
  const summary = { total: 0, valid: 0, invalid: 0, unknown: 0 };
  for (const user of accounts(ctx)) {
    // 缓存键包含 key：刷新登录换了新 key 之后会自动重新检查
    const cacheKey = 'txcred:' + sha256Hex(`${user.uin}|${user.qqmusic_key}`);
    let state = force ? null : await getCache<CredentialState>(ctx.db, cacheKey);
    if (!state) {
      try {
        state = await checkAccount(ctx, user);
      } catch (e) {
        logger.warning(`检查QQ音乐账号(${user.uin})登录状态失败: ${e}`);
        state = 'unknown';
      }
      // 网络异常等无法判断的结果不缓存，下次继续尝试
      if (state !== 'unknown') await setCache(ctx.db, cacheKey, state, CACHE_SECONDS);
    }
    summary.total += 1;
    summary[state] += 1;
  }
  return summary;
}
