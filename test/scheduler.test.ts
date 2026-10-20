import { describe, expect, it, vi } from 'vitest';
import { getStatus, registeredTasks, runDueTasks, RETRY_DELAYS, taskLabel } from '../src/services/scheduler';
import * as stats from '../src/services/stats';
import { useHarness } from './helpers/harness';

const h = useHarness();

function state(name: string) {
  return h().db.rows('SELECT * FROM task_state WHERE name = ?', name)[0];
}

describe('定时任务', () => {
  it('按配置注册任务，账号池模式按账号注册', async () => {
    await h().writeConfig({
      'module.tx.user.refresh_login.enable': true,
      'module.kg.user.refresh_login.enable': true,
      'module.wy.user.refresh_login.enable': true,
      'module.kg.client.appid': '3116',
      'module.kg.user.token': 't',
      'module.kg.user.lite_sign_in.enable': true,
    });
    let names = registeredTasks(await h().context()).map((t) => t.name);
    expect(names).toEqual(['qqmusic_refresh_login', 'kg_refresh_login', 'kugou_lite_sign_in', 'wy_refresh_login', 'parse_logs_cleanup']);
    await h().writeConfig({
      'common.cookiepool': true,
      'common.parse_log_retention_days': 0,
      'module.cookiepool.tx': [{ qqmusic_key: 'a', refresh_login: { enable: true, interval: 3600 } }, { qqmusic_key: 'b' }],
      'module.cookiepool.wy': [{ cookie: 'x', refresh_login: { enable: false } }, { cookie: 'y', refresh_login: { enable: true } }],
      'module.cookiepool.kg': [{ token: 'k', lite_sign_in: { enable: true, interval: 7200 }, refresh_login: { enable: true } }],
    });
    const tasks = registeredTasks(await h().context());
    names = tasks.map((t) => t.name);
    expect(names).toEqual(['qqmusic_refresh_login_pooled_0', 'kgmusic_refresh_login_pooled_0', 'kugou_lite_sign_in_pooled_0', 'wy_refresh_login_pooled_1']);
    expect(tasks.find((t) => t.name === 'qqmusic_refresh_login_pooled_0')!.interval).toBe(3600);
  });

  it('首次立即执行，成功后等满一个间隔', async () => {
    const ctx = await h().context();
    expect(await runDueTasks(ctx)).toEqual(['parse_logs_cleanup']);
    expect(await runDueTasks(ctx)).toEqual([]);
    const s = state('parse_logs_cleanup');
    expect(s.consecutive_failures).toBe(0);
    expect(s.next_run - s.latest_execute).toBe(86400);
    // 一天后再次执行
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 86401 * 1000);
    try {
      expect(await runDueTasks(ctx)).toEqual(['parse_logs_cleanup']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('失败后按 1 分钟、5 分钟……退避重试，不超过任务自身的间隔；返回 false 也算失败', async () => {
    const ctx = await h().context();
    const spy = vi.spyOn(stats, 'cleanupTask').mockRejectedValue(new Error('boom'));
    try {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now());
      for (let i = 0; i < RETRY_DELAYS.length + 1; i++) {
        await runDueTasks(ctx);
        const s = state('parse_logs_cleanup');
        expect(s.consecutive_failures).toBe(i + 1);
        expect(s.last_error).toBe('boom');
        const delay = RETRY_DELAYS[Math.min(i, RETRY_DELAYS.length - 1)];
        expect(s.next_run - s.last_failure_at).toBe(delay);
        expect(await runDueTasks(ctx)).toEqual([]); // 还没到重试时间
        vi.setSystemTime(Date.now() + delay * 1000);
      }
      spy.mockResolvedValue(false as any);
      await runDueTasks(ctx);
      expect(state('parse_logs_cleanup').last_error).toBe('任务返回失败');
      spy.mockResolvedValue(undefined);
      vi.setSystemTime(Date.now() + 7200 * 1000);
      await runDueTasks(ctx);
      expect(state('parse_logs_cleanup')).toMatchObject({ consecutive_failures: 0, last_error: null });
    } finally {
      vi.useRealTimers();
      spy.mockRestore();
    }
  });

  it('间隔改了立即按新间隔计算；正在执行的任务不会重复执行', async () => {
    await h().writeConfig({ 'module.wy.user.refresh_login.enable': true, 'module.wy.user.refresh_login.interval': 86400 });
    const ctx = await h().context();
    h().db.sqlite.exec(`INSERT INTO task_state (name, latest_execute, next_run) VALUES ('wy_refresh_login', ${Math.floor(Date.now() / 1000) - 7200}, 0)`);
    let status = (await getStatus(ctx)).find((t) => t.name === 'wy_refresh_login')!;
    expect(status.next_run! - Math.floor(Date.now() / 1000)).toBeGreaterThan(3600);
    await h().writeConfig({ 'module.wy.user.refresh_login.interval': 3600 });
    const updated = await h().context();
    status = (await getStatus(updated)).find((t) => t.name === 'wy_refresh_login')!;
    expect(status.next_run!).toBeLessThan(Math.floor(Date.now() / 1000));
    h().db.sqlite.exec(`UPDATE task_state SET running_since = ${Math.floor(Date.now() / 1000)} WHERE name = 'wy_refresh_login'`);
    expect((await getStatus(updated)).find((t) => t.name === 'wy_refresh_login')!.running).toBe(true);
    expect(await runDueTasks(updated)).not.toContain('wy_refresh_login');
  });

  it('任务名称', () => {
    expect(taskLabel('qqmusic_refresh_login')).toBe('QQ 音乐 · 刷新登录');
    expect(taskLabel('wy_refresh_login_pooled_2')).toBe('网易云 · 刷新登录(账号池 #3)');
    expect(taskLabel('kugou_lite_sign_in_pooled_0')).toBe('酷狗概念版 · 签到(账号池 #1)');
    expect(taskLabel('something_else')).toBe('something_else');
  });
});

describe('改配置后重试', () => {
  it('保存配置后，退避中的失败任务在下一次 Cron 就重试', async () => {
    await h().loginAdmin();
    await h().writeConfig({ 'module.wy.user.refresh_login.enable': true, 'module.wy.user.cookie': 'MUSIC_U=x' });
    const later = Math.floor(Date.now() / 1000) + 7200;
    h().db.sqlite.exec(`INSERT INTO task_state (name, latest_execute, next_run, consecutive_failures, last_error)
      VALUES ('wy_refresh_login', ${later - 7300}, ${later}, 5, 'old error')`);
    expect(await runDueTasks(await h().context())).not.toContain('wy_refresh_login');
    await h().api('PUT', '/api/admin/config', { values: { 'module.wy.user.refresh_login.interval': 7200 } });
    expect(state('wy_refresh_login').next_run).toBe(0);
    h().fetch.on('https://interface.music.163.com/eapi/login/token/refresh', new Response('{"code":200}'));
    expect(await runDueTasks(await h().context())).toContain('wy_refresh_login');
    expect(state('wy_refresh_login').consecutive_failures).toBe(0);
  });
});
