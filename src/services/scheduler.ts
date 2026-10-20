// 定时任务(对应 Python 版的 common/scheduler.py)。
//
// Cron Trigger 每分钟触发一次，按最新配置生成任务列表，执行到期的任务。任务状态保存在 D1 的 task_state 表里。
// 任务函数的约定与 Python 版相同：正常返回(含 undefined)视为成功；抛出异常或返回 false 视为失败。
// 失败后按 RETRY_DELAYS 退避重试(不超过任务自身的间隔)，成功后恢复正常周期。

import type { AppContext } from '../lib/context';
import { log } from '../lib/log';
import { errorMessage, now, timestampFormat } from '../lib/utils';
import { tzOffset } from '../lib/context';
import * as kgLite from '../sources/kg/lite-signin';
import * as kgRefresh from '../sources/kg/refresh-login';
import * as txRefresh from '../sources/tx/refresh-login';
import * as wyRefresh from '../sources/wy/refresh-login';
import { cleanupTask } from './stats';

const logger = log('scheduler');

// 连续失败后的重试间隔(秒)，超出长度后沿用最后一个值
export const RETRY_DELAYS = [60, 300, 1800, 7200];
// 任务执行超过这么久仍没有结束(例如 Worker 被中止)，视为已经结束，可以再次执行
const STALE_RUNNING_SECONDS = 15 * 60;

export interface TaskDef {
  name: string;
  interval: number;
  run: (ctx: AppContext) => Promise<boolean | void>;
}

interface StateRow {
  name: string;
  latest_execute: number;
  next_run: number;
  last_success_at: number | null;
  last_failure_at: number | null;
  last_error: string | null;
  consecutive_failures: number;
  running_since: number | null;
}

function interval(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 按当前配置生成任务列表(对应 Python 版各模块里的 scheduler.append) */
export function registeredTasks(ctx: AppContext): TaskDef[] {
  const c = ctx.config;
  const pool = c.cookiePool;
  const tasks: TaskDef[] = [];

  // QQ 音乐刷新登录
  if (!pool) {
    if (c.get('module.tx.user.refresh_login.enable')) {
      tasks.push({ name: 'qqmusic_refresh_login', interval: interval(c.get('module.tx.user.refresh_login.interval'), 86000),
        run: txRefresh.refresh });
    }
  } else {
    (c.get('module.cookiepool.tx') || []).forEach((user: any, index: number) => {
      if (user?.refresh_login?.enable) {
        tasks.push({ name: `qqmusic_refresh_login_pooled_${index}`, interval: interval(user.refresh_login.interval, 86400),
          run: (app) => txRefresh.refreshPool(app, index) });
      }
    });
  }

  // 酷狗刷新登录
  if (!pool) {
    if (c.get('module.kg.user.refresh_login.enable')) {
      tasks.push({ name: 'kg_refresh_login', interval: interval(c.get('module.kg.user.refresh_login.interval'), 86000),
        run: kgRefresh.refresh });
    }
  } else {
    (c.get('module.cookiepool.kg') || []).forEach((user: any, index: number) => {
      if (user?.refresh_login?.enable) {
        tasks.push({ name: `kgmusic_refresh_login_pooled_${index}`, interval: interval(user.refresh_login.interval, 86400),
          run: (app) => kgRefresh.refreshPool(app, index) });
      }
    });
  }

  // 酷狗概念版签到(仅 appid 为 3116 时)
  if (String(c.get('module.kg.client.appid')) === '3116') {
    if (!pool) {
      const user = c.get('module.kg.user') || {};
      if (user.token && user.lite_sign_in?.enable) {
        tasks.push({ name: 'kugou_lite_sign_in', interval: interval(user.lite_sign_in.interval, 86400), run: kgLite.signinMain });
      }
    } else {
      (c.get('module.cookiepool.kg') || []).forEach((user: any, index: number) => {
        if (user?.token && user.lite_sign_in?.enable) {
          tasks.push({ name: `kugou_lite_sign_in_pooled_${index}`, interval: interval(user.lite_sign_in.interval, 86400),
            run: (app) => kgLite.signinPool(app, index) });
        }
      });
    }
  }

  // 网易云刷新登录
  if (!pool) {
    if (c.get('module.wy.user.refresh_login.enable')) {
      tasks.push({ name: 'wy_refresh_login', interval: interval(c.get('module.wy.user.refresh_login.interval'), 86400),
        run: wyRefresh.refresh });
    }
  } else {
    (c.get('module.cookiepool.wy') || []).forEach((account: any, index: number) => {
      if (account?.refresh_login?.enable) {
        tasks.push({ name: `wy_refresh_login_pooled_${index}`, interval: interval(account.refresh_login.interval, 86400),
          run: (app) => wyRefresh.refreshPool(app, index) });
      }
    });
  }

  // 解析记录定时清理(保留天数为 0 或负数表示不清理)
  if (Number(c.get('common.parse_log_retention_days')) > 0) {
    tasks.push({ name: 'parse_logs_cleanup', interval: 86400, run: cleanupTask });
  }
  return tasks;
}

/** 下次可以执行的时间：没有失败时按上次执行时间 + 间隔(间隔改了立即生效)，失败重试中按重试计划 */
function dueAt(state: StateRow | undefined, task: TaskDef): number {
  if (!state) return 0;
  if (state.consecutive_failures === 0 && state.latest_execute) return state.latest_execute + task.interval;
  return state.next_run;
}

function isRunning(state: StateRow | undefined, ts = now()): boolean {
  return Boolean(state?.running_since && ts - state.running_since < STALE_RUNNING_SECONDS);
}

async function loadStates(db: D1Database): Promise<Map<string, StateRow>> {
  const rows = await db.prepare('SELECT * FROM task_state').all<StateRow>();
  return new Map(rows.results.map((row) => [row.name, row]));
}

/** 当前已注册任务的运行状态，供后台展示 */
export async function getStatus(ctx: AppContext) {
  const states = await loadStates(ctx.db);
  const ts = now();
  return registeredTasks(ctx).map((task) => {
    const state = states.get(task.name);
    const next = dueAt(state, task);
    return {
      name: task.name,
      interval: task.interval,
      running: isRunning(state, ts),
      latest_execute: state?.latest_execute || null,
      next_run: next || null,
      last_success_at: state?.last_success_at ?? null,
      last_failure_at: state?.last_failure_at ?? null,
      last_error: state?.last_error ?? null,
      consecutive_failures: state?.consecutive_failures || 0,
    };
  });
}

/** 抢占任务；force 为 true 时不检查是否到期。返回抢占后的连续失败次数，没抢到返回 null */
async function claim(db: D1Database, task: TaskDef, force: boolean): Promise<number | null> {
  const ts = now();
  const [, claimed] = await db.batch([
    db.prepare('INSERT INTO task_state (name) VALUES (?) ON CONFLICT(name) DO NOTHING').bind(task.name),
    db.prepare(`UPDATE task_state SET running_since = ?1, latest_execute = ?1
                WHERE name = ?2 AND (running_since IS NULL OR running_since < ?3)
                  AND (?4 = 1 OR (CASE WHEN consecutive_failures = 0 AND latest_execute > 0
                                       THEN latest_execute + ?5 ELSE next_run END) <= ?1)
                RETURNING consecutive_failures`)
      .bind(ts, task.name, ts - STALE_RUNNING_SECONDS, force ? 1 : 0, task.interval),
  ]);
  const row = claimed.results[0] as { consecutive_failures: number } | undefined;
  return row ? row.consecutive_failures : null;
}

async function execute(ctx: AppContext, task: TaskDef, failures: number): Promise<void> {
  const started = now();
  let error: string | null = null;
  try {
    logger.info(`task ${task.name} run start`);
    if ((await task.run(ctx)) === false) error = '任务返回失败';
  } catch (e) {
    error = errorMessage(e) || '任务执行出错';
    logger.error(`task ${task.name} 出错: ${e instanceof Error && e.stack ? e.stack : e}`);
  }
  const ts = now();
  if (error === null) {
    await ctx.db.prepare(`UPDATE task_state SET running_since = NULL, consecutive_failures = 0, last_success_at = ?,
                            last_error = NULL, next_run = ? WHERE name = ?`)
      .bind(ts, started + task.interval, task.name).run();
    logger.info(`task ${task.name} run success, next execute: ${timestampFormat(started + task.interval, tzOffset(ctx))}`);
  } else {
    const count = failures + 1;
    const delay = RETRY_DELAYS[Math.min(count - 1, RETRY_DELAYS.length - 1)];
    const next = ts + Math.min(delay, task.interval);
    await ctx.db.prepare(`UPDATE task_state SET running_since = NULL, consecutive_failures = ?, last_failure_at = ?,
                            last_error = ?, next_run = ? WHERE name = ?`)
      .bind(count, ts, error.slice(0, 500), next, task.name).run();
    logger.error(`task ${task.name} run failed (${count} in a row), retry at: ${timestampFormat(next, tzOffset(ctx))}`);
  }
}

/** 执行所有到期的任务(由 Cron Trigger 调用) */
export async function runDueTasks(ctx: AppContext): Promise<string[]> {
  const ran: string[] = [];
  const states = await loadStates(ctx.db);
  const ts = now();
  for (const task of registeredTasks(ctx)) {
    const state = states.get(task.name);
    if (isRunning(state, ts) || dueAt(state, task) > ts) continue;
    const failures = await claim(ctx.db, task, false);
    if (failures === null) continue;
    await execute(ctx, task, failures);
    ran.push(task.name);
  }
  return ran;
}

/**
 * 立即执行一个任务(后台“立即执行”)
 * @returns 'missing' 任务不存在；'running' 正在执行；否则返回 { done: 执行任务的 Promise }
 */
export async function runNow(ctx: AppContext, name: string): Promise<'missing' | 'running' | { done: Promise<void> }> {
  const task = registeredTasks(ctx).find((t) => t.name === name);
  if (!task) return 'missing';
  const failures = await claim(ctx.db, task, true);
  if (failures === null) return 'running';
  // 包一层对象：async 函数直接返回 Promise 会等它执行完
  return { done: execute(ctx, task, failures) };
}

/**
 * 配置改了之后，让正在退避等待重试的失败任务在下一次 Cron(1 分钟内)就按新配置重试，
 * 不用等完退避间隔(失败多半就是配置引起的，改完配置马上就能看到结果)
 */
export async function retryFailedTasksSoon(db: D1Database): Promise<void> {
  await db.prepare('UPDATE task_state SET next_run = 0 WHERE consecutive_failures > 0').run();
}

/** 后台展示用的任务名称 */
export function taskLabel(name: string): string {
  const pooled = /^(.+)_pooled_(\d+)$/.exec(name);
  const base = pooled ? pooled[1] : name;
  const index = pooled ? Number(pooled[2]) + 1 : null;
  const labels: Record<string, string> = {
    qqmusic_refresh_login: 'QQ 音乐 · 刷新登录',
    kg_refresh_login: '酷狗 · 刷新登录',
    kgmusic_refresh_login: '酷狗 · 刷新登录',
    wy_refresh_login: '网易云 · 刷新登录',
    parse_logs_cleanup: '清理过期解析记录',
  };
  const label = base.startsWith('kugou_lite_sign_in') ? '酷狗概念版 · 签到' : labels[base] || name;
  return index ? `${label}(账号池 #${index})` : label;
}
