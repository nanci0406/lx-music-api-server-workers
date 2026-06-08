import type { Env } from './types/env';
import { DatabaseQueries } from './db/queries';

interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = new DatabaseQueries(env.DB);

    // 根据不同的 cron 时间执行不同的任务
    const hour = new Date(event.scheduledTime).getUTCHours();
    const minute = new Date(event.scheduledTime).getUTCMinutes();

    console.log(`Scheduled task triggered at ${hour}:${minute}`);

    // 健康检查 (每小时 :03 分)
    if (minute === 3) {
      await performHealthCheck(env, db);
    }

    // Token 刷新任务
    if (hour === 0) {
      if (minute === 7) {
        // 酷狗 Token 刷新
        await refreshKugouToken(env);
      } else if (minute === 13) {
        // QQ音乐 Token 刷新
        await refreshTencentToken(env);
      } else if (minute === 19) {
        // 网易云 Token 刷新
        await refreshNeteaseToken(env);
      } else if (minute === 27) {
        // 咪咕 Token 刷新
        await refreshMiguToken(env);
      }
    }
  }
};

// 健康检查
async function performHealthCheck(env: Env, db: DatabaseQueries) {
  const sources = ['kg', 'tx', 'wy', 'mg', 'kw'];
  const probes: Record<string, string> = {
    'kg': 'https://gateway.kugou.com',
    'tx': 'https://u.y.qq.com',
    'wy': 'https://interface.music.163.com',
    'mg': 'https://m.music.migu.cn',
    'kw': 'https://bd-api.kuwo.cn'
  };

  console.log('Starting health check...');

  for (const source of sources) {
    try {
      const response = await fetch(probes[source], {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      const status = response.status >= 500 ? 'degraded' : 'healthy';
      const detail = `HTTP ${response.status}`;

      await db.updateModuleHealth(source, status, detail);
      console.log(`Health check ${source}: ${status}`);
    } catch (error: any) {
      await db.updateModuleHealth(source, 'degraded', error.message);
      console.error(`Health check ${source} failed:`, error.message);
    }
  }

  console.log('Health check completed');
}

// 酷狗 Token 刷新
async function refreshKugouToken(env: Env) {
  console.log('Refreshing Kugou token...');
  // TODO: 实现酷狗 Token 刷新逻辑
  console.log('Kugou token refresh completed');
}

// QQ音乐 Token 刷新
async function refreshTencentToken(env: Env) {
  console.log('Refreshing Tencent Music token...');
  // TODO: 实现 QQ音乐 Token 刷新逻辑
  console.log('Tencent Music token refresh completed');
}

// 网易云 Token 刷新
async function refreshNeteaseToken(env: Env) {
  console.log('Refreshing Netease Music token...');
  // TODO: 实现网易云 Token 刷新逻辑
  console.log('Netease Music token refresh completed');
}

// 咪咕 Token 刷新
async function refreshMiguToken(env: Env) {
  console.log('Refreshing Migu Music token...');
  // TODO: 实现咪咕 Token 刷新逻辑
  console.log('Migu Music token refresh completed');
}
