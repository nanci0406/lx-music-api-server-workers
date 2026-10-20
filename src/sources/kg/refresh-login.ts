// 酷狗：token 保活(刷新登录)。30 天不刷新 token 会失效。

import type { AppContext } from '../../lib/context';
import { log } from '../../lib/log';
import { aesSign, signRequest } from './utils';

const logger = log('kg_refresh_login');

// 概念版(appid=3116)使用的 aes 参数
const LITE_AES = { key: 'c24f74ca2820225badc01946dba4fdf7', iv: 'adc01946dba4fdf7' };

/**
 * 发起一次 token 保活请求
 * @returns 成功时返回响应里的 data(含新的 userid/token)；失败返回 null
 */
export async function requestRefresh(
  ctx: AppContext, userId: string, token: string, mid: string, loginUrl: string,
): Promise<{ userid: string | number; token: string } | null> {
  const appid = String(ctx.config.get('module.kg.client.appid'));
  let aes: { key?: string; iv?: string } = {};
  if (appid === '3116') aes = LITE_AES;
  else if (appid !== '1005') {
    logger.warning(`酷狗音乐账号(UID_${userId})刷新登录失败: 不支持的 appid(${appid})，仅支持 1005 和 3116`);
    return null;
  }
  const ts = Date.now();
  const clienttime = Math.floor(ts / 1000);
  const p3 = aesSign(JSON.stringify({ clienttime, token }), aes.key, aes.iv);
  const body = JSON.stringify({ p3, clienttime_ms: ts, t1: 0, t2: 0, userid: userId });
  const params = {
    dfid: '-',
    appid,
    mid,
    clientver: String(ctx.config.get('module.kg.client.clientver')),
    clienttime,
  };
  const resp = await signRequest(ctx, loginUrl, params, {
    method: 'POST',
    body,
    headers: {
      'User-Agent': 'Android712-AndroidPhone-8983-18-0-NetMusic-wifi',
      'KG-THash': '3e5ec6b',
      'KG-Rec': '1',
      'KG-RC': '1',
      'Content-Type': 'application/json',
    },
  }, String(ctx.config.get('module.kg.client.signatureKey')));
  const result = resp.jsonOrNull();
  if (!result || result.error_code !== 0 || !result.data?.token) {
    logger.warning(`酷狗音乐账号(UID_${userId})刷新登录失败, code: ${result ? result.error_code : `HTTP ${resp.status}`}`);
    return null;
  }
  return result.data;
}

/** 单账号模式：刷新 module.kg.user */
export async function refresh(ctx: AppContext): Promise<boolean | void> {
  const user = ctx.config.get('module.kg.user') || {};
  if (!user.token || !user.refresh_login?.enable) return;
  const userId = String(user.userid);
  const usedToken = String(user.token);
  const data = await requestRefresh(ctx, userId, usedToken, String(user.mid || ''),
    String(user.refresh_login.login_url || 'http://login.user.kugou.com/v4/login_by_token'));
  if (!data) return false;
  const written = await ctx.config.update((config) => {
    // 请求期间 token 被管理员改掉了：不能用旧 token 刷出来的结果覆盖
    if (config.module.kg.user.token !== usedToken) return false;
    config.module.kg.user.userid = String(data.userid);
    config.module.kg.user.token = data.token;
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
  const data = await requestRefresh(ctx, userId, usedToken, String(user.mid || ctx.config.get('module.kg.user.mid') || ''),
    String(user.refresh_login?.login_url || 'http://login.user.kugou.com/v4/login_by_token'));
  if (!data) return false;
  const written = await ctx.config.update((config) => {
    const current = config.module.cookiepool.kg?.[index];
    if (!current || current.token !== usedToken) return false;
    current.token = data.token;
    current.userid = String(data.userid);
  });
  if (!written) {
    logger.warning(`酷狗音乐账号(UID_${userId})的配置在刷新期间已被修改，本次刷新结果已丢弃`);
    return;
  }
  logger.info(`酷狗音乐账号(UID_${userId})刷新登录成功，数据已更新`);
}
