import { Hono } from 'hono';
import type { Env } from '../types/env';
import { signInKugou, refreshKugou, refreshTencent, refreshNetease } from '../cron/refresh-login';

const testApp = new Hono<{ Bindings: Env }>();

// 测试酷狗签到
testApp.get('/test/signin/kg', async (c) => {
  try {
    await signInKugou(c.env);
    return c.json({ code: 0, msg: '酷狗签到测试成功' });
  } catch (error: any) {
    return c.json({ code: 1, msg: '酷狗签到测试失败', error: error.message }, 500);
  }
});

// 测试酷狗刷新登录
testApp.get('/test/refresh/kg', async (c) => {
  try {
    await refreshKugou(c.env);
    return c.json({ code: 0, msg: '酷狗刷新登录测试成功' });
  } catch (error: any) {
    return c.json({ code: 1, msg: '酷狗刷新登录测试失败', error: error.message }, 500);
  }
});

// 测试QQ音乐刷新登录
testApp.get('/test/refresh/tx', async (c) => {
  try {
    await refreshTencent(c.env);
    return c.json({ code: 0, msg: 'QQ音乐刷新登录测试成功' });
  } catch (error: any) {
    return c.json({ code: 1, msg: 'QQ音乐刷新登录测试失败', error: error.message }, 500);
  }
});

// 测试网易云刷新登录
testApp.get('/test/refresh/wy', async (c) => {
  try {
    await refreshNetease(c.env);
    return c.json({ code: 0, msg: '网易云刷新登录测试成功' });
  } catch (error: any) {
    return c.json({ code: 1, msg: '网易云刷新登录测试失败', error: error.message }, 500);
  }
});

// 测试所有音源
testApp.get('/test/refresh/all', async (c) => {
  const results = await Promise.allSettled([
    refreshKugou(c.env),
    refreshTencent(c.env),
    refreshNetease(c.env)
  ]);

  return c.json({
    code: 0,
    msg: '所有音源刷新测试完成',
    data: {
      kg: results[0].status === 'fulfilled' ? 'success' : `failed: ${(results[0] as any).reason}`,
      tx: results[1].status === 'fulfilled' ? 'success' : `failed: ${(results[1] as any).reason}`,
      wy: results[2].status === 'fulfilled' ? 'success' : `failed: ${(results[2] as any).reason}`
    }
  });
});

export default testApp;
