// 一次请求(或一次定时任务)的上下文：数据库、配置、后台任务

import type { Env } from '../env';
import { Config } from '../config/config';
import { configureLogging } from './log';

export interface AppContext {
  env: Env;
  db: D1Database;
  config: Config;
  /** 响应返回后继续执行的任务(写统计、写缓存等) */
  waitUntil(promise: Promise<unknown>): void;
}

export function createContext(env: Env, config: Config, waitUntil: (promise: Promise<unknown>) => void): AppContext {
  configureLogging({ debug: config.get('common.debug_mode'), lengthLimit: config.get('common.log_length_limit') });
  return { env, db: env.DB, config, waitUntil };
}

export async function loadContext(env: Env, waitUntil: (promise: Promise<unknown>) => void): Promise<AppContext> {
  return createContext(env, await Config.load(env.DB), waitUntil);
}

/** 时区偏移(小时) */
export function tzOffset(ctx: AppContext): number {
  const value = Number(ctx.config.get('common.timezone'));
  return Number.isFinite(value) && value >= -12 && value <= 14 ? value : 8;
}
