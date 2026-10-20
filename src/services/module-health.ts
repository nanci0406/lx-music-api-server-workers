// 各平台的可用性：模块开关、账号是否配置、接口能否访问、刷新登录任务是否连续失败、QQ 音乐凭证是否有效。
// detail 会展示在公开首页上，只写笼统描述；具体的账号信息放进 admin_detail，仅管理员可见。

import type { AppContext } from '../lib/context';
import { tzOffset } from '../lib/context';
import { request } from '../lib/http';
import { errorMessage, now, timestampFormat } from '../lib/utils';
import { SUPPORTED_SOURCES, type Source } from '../sources/common';
import * as txCredential from '../sources/tx/credential';
import { getStatus } from './scheduler';

export const MODULE_PROBES: Record<Source, string> = {
  kg: 'https://gateway.kugou.com',
  tx: 'https://u.y.qq.com',
  wy: 'https://interface.music.163.com',
};

const REQUIRED_FIELDS: Record<Source, [string, string][]> = {
  kg: [['token', 'token'], ['userid', 'userid']],
  tx: [['qqmusic_key', 'qqmusic_key'], ['uin', 'uin']],
  wy: [['cookie', 'cookie']],
};

// 各平台登录保活类定时任务的名称前缀，用于把任务失败反映到模块状态上
const SOURCE_TASK_PREFIXES: Record<Source, string[]> = {
  tx: ['qqmusic_refresh_login'],
  kg: ['kg_refresh_login', 'kgmusic_refresh_login', 'kugou_lite_sign_in'],
  wy: ['wy_refresh_login'],
};

// 检查结果超过这么久就在后台顺带重新检查一次(正常情况下由 Cron 每 5 分钟检查)
export const STALE_SECONDS = 600;

export interface HealthResult {
  source: Source;
  status: 'healthy' | 'degraded' | 'misconfigured' | 'disabled';
  detail: string;
  admin_detail?: string | null;
}

type TaskStatus = Awaited<ReturnType<typeof getStatus>>;

function taskIssues(ctx: AppContext, source: Source, tasks: TaskStatus): string[] {
  const prefixes = SOURCE_TASK_PREFIXES[source];
  const offset = tzOffset(ctx);
  const issues: string[] = [];
  for (const task of tasks) {
    if (!prefixes.some((prefix) => task.name.startsWith(prefix)) || !task.consecutive_failures) continue;
    let text = `${task.name} 已连续失败 ${task.consecutive_failures} 次`;
    if (task.last_failure_at) text += `，最近一次 ${timestampFormat(task.last_failure_at, offset)}`;
    if (task.next_run) text += `，下次重试 ${timestampFormat(task.next_run, offset)}`;
    if (task.last_error) text += `(${task.last_error})`;
    issues.push(text);
  }
  return issues;
}

/** 缺少的账号字段；账号池模式下检查账号池里是否有填写了凭证的账号 */
function missingFields(ctx: AppContext, source: Source): string[] {
  const fields = REQUIRED_FIELDS[source];
  const isEmpty = (value: unknown) => value === undefined || value === null || value === '' || value === '0';
  if (ctx.config.cookiePool) {
    const pool: Record<string, any>[] = ctx.config.get(`module.cookiepool.${source}`) || [];
    const usable = pool.some((account) => account && fields.every(([key]) => !isEmpty(account[key])));
    return usable ? [] : ['账号池中没有填写凭证的账号'];
  }
  const user = ctx.config.get(`module.${source}.user`) || {};
  return fields.filter(([key]) => isEmpty(user[key])).map(([, label]) => label);
}

export async function probeSource(ctx: AppContext, source: Source, tasks: TaskStatus, force = false): Promise<HealthResult> {
  if (!ctx.config.get(`module.${source}.enable`)) return { source, status: 'disabled', detail: '模块已关闭' };
  const missing = missingFields(ctx, source);
  if (missing.length) return { source, status: 'misconfigured', detail: '缺少: ' + missing.join(', ') };
  let status: number;
  try {
    const resp = await request(ctx, MODULE_PROBES[source], { timeout: 10000 });
    status = resp.status;
    if (status >= 500) throw new Error(`bad status ${status}`);
  } catch (e) {
    return { source, status: 'degraded', detail: errorMessage(e) };
  }
  const result: HealthResult = { source, status: 'healthy', detail: `探测成功(${status})` };
  // 域名可达不代表账号可用：登录保活任务失败、凭证失效时也要体现出来
  const adminIssues = taskIssues(ctx, source, tasks);
  const publicIssues = adminIssues.length ? ['账号刷新登录异常'] : [];
  if (source === 'tx') {
    try {
      const summary = await txCredential.checkAll(ctx, force);
      if (summary.invalid) {
        adminIssues.push(`${summary.invalid}/${summary.total} 个账号登录凭证已失效，需要重新获取 qqmusic_key`);
        publicIssues.push('账号登录状态异常');
      }
    } catch {
      // 凭证检查出错不影响模块状态
    }
  }
  if (adminIssues.length) {
    result.status = 'degraded';
    result.detail = publicIssues.join('；');
    result.admin_detail = adminIssues.join('；');
  }
  return result;
}

export async function refreshModuleHealth(ctx: AppContext, force = false): Promise<HealthResult[]> {
  const tasks = await getStatus(ctx);
  const results = await Promise.all(SUPPORTED_SOURCES.map((source) => probeSource(ctx, source, tasks, force)));
  const ts = now();
  const db = ctx.db;
  await db.batch([
    ...results.map((item) => db.prepare(
      `INSERT INTO module_health (source, status, detail, checked_at, admin_detail) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET status = excluded.status, detail = excluded.detail,
         checked_at = excluded.checked_at, admin_detail = excluded.admin_detail`)
      .bind(item.source, item.status, item.detail, ts, item.admin_detail ?? null)),
    // 已下线的平台(如咪咕、酷我)留下的旧记录不再展示
    db.prepare(`DELETE FROM module_health WHERE source NOT IN (${SUPPORTED_SOURCES.map(() => '?').join(',')})`)
      .bind(...SUPPORTED_SOURCES),
  ]);
  return results;
}

export interface HealthRow {
  source: Source;
  status: string;
  detail: string | null;
  checked_at: number;
  admin_detail: string | null;
}

export async function getCachedModuleHealth(db: D1Database): Promise<HealthRow[]> {
  const rows = await db.prepare('SELECT source, status, detail, checked_at, admin_detail FROM module_health ORDER BY source ASC')
    .all<HealthRow>();
  return rows.results;
}

let lastLazyRefresh = 0;

/** 检查结果太旧(或还没有)时在后台重新检查一次，例如刚部署、Cron 还没触发的时候 */
export function refreshIfStale(ctx: AppContext, rows: HealthRow[]): void {
  const latest = Math.max(0, ...rows.map((row) => row.checked_at || 0));
  const ts = now();
  if ((rows.length < SUPPORTED_SOURCES.length || ts - latest > STALE_SECONDS) && ts - lastLazyRefresh > 60) {
    lastLazyRefresh = ts;
    ctx.waitUntil(refreshModuleHealth(ctx).catch(() => undefined));
  }
}
