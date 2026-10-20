// Cron Trigger(每分钟)：执行到期的定时任务，定期检查各平台状态、清理过期数据

import type { Env } from './env';
import type { AppContext } from './lib/context';
import { loadContext } from './lib/context';
import { cleanupExpiredCache } from './lib/cache';
import { ensureSchema } from './lib/db';
import { log } from './lib/log';
import { now } from './lib/utils';
import { SESSION_IDLE_SECONDS, SESSION_MAX_SECONDS, LOGIN_WINDOW_SECONDS } from './services/admin-auth';
import { purge as purgeLoginSessions } from './services/login-session';
import { refreshModuleHealth } from './services/module-health';
import { runDueTasks } from './services/scheduler';
import { cleanupBans } from './services/security';

const logger = log('cron');

/** 清理过期的缓存、会话、限速记录、封禁记录 */
export async function maintenance(ctx: AppContext): Promise<void> {
  const ts = now();
  const db = ctx.db;
  await cleanupExpiredCache(db);
  await purgeLoginSessions(db, ts);
  await cleanupBans(db);
  await db.batch([
    db.prepare('DELETE FROM admin_sessions WHERE created_at < ? OR last_seen < ?').bind(ts - SESSION_MAX_SECONDS, ts - SESSION_IDLE_SECONDS),
    db.prepare('DELETE FROM login_failures WHERE ts <= ?').bind(ts - LOGIN_WINDOW_SECONDS),
    db.prepare('DELETE FROM request_times WHERE ts < ?').bind(ts - 86400),
  ]);
}

export async function handleScheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  await ensureSchema(env.DB);
  const app = await loadContext(env, (promise) => ctx.waitUntil(promise));
  const minute = new Date(controller.scheduledTime).getUTCMinutes();
  try {
    const ran = await runDueTasks(app);
    if (ran.length) logger.info(`本次执行的定时任务: ${ran.join(', ')}`);
  } catch (e) {
    logger.error(`执行定时任务失败: ${e}`);
  }
  if (minute % 5 === 0) {
    try {
      await refreshModuleHealth(app);
    } catch (e) {
      logger.warning(`检查模块状态失败: ${e}`);
    }
  }
  if (minute % 10 === 0) {
    try {
      await maintenance(app);
    } catch (e) {
      logger.warning(`清理过期数据失败: ${e}`);
    }
  }
}
