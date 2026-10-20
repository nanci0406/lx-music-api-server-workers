// LX Music API Server · Cloudflare Workers 版

import app from './app';
import { handleScheduled } from './cron';
import type { Env } from './env';

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleScheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;
