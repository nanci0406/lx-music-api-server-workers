import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types/env';
import router from './router';
import adminRoutes from './admin/routes';
import { handleScheduled } from './cron/refresh-login';
import testRoutes from './test/refresh';
import scriptRoutes from './routes/script';
import { homePage } from './pages/home';

const app = new Hono<{ Bindings: Env }>();

// 全局中间件
app.use('*', cors());
app.use('*', logger());

// 健康检查
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    version: '1.0.0'
  });
});

// 首页
app.get('/', (c) => {
  return c.html(homePage());
});

// API 路由
app.route('/', router);

// 管理后台路由
app.route('/', adminRoutes);

// 音源脚本路由
app.route('/', scriptRoutes);

// 测试路由（仅开发环境）
app.route('/', testRoutes);

// 404 处理
app.notFound((c) => {
  return c.json({
    code: 6,
    msg: '未找到您所请求的资源',
    data: null
  }, 404);
});

// 错误处理
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({
    code: 4,
    msg: '内部服务器错误',
    data: null
  }, 500);
});

// 导出 fetch handler 和 scheduled handler
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(event, env));
  }
};
