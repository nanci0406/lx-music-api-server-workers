import { describe, expect, it } from 'vitest';
import { ensureAdminFromEnv } from '../src/services/admin-auth';
import { FIELDS, SECTIONS, convert, secretPreview } from '../src/webui/config-schema';
import { DEFAULT_CONFIG } from '../src/config/default-config';
import { getPath } from '../src/lib/utils';
import { isWebuiRequest } from '../src/app';
import { json, useHarness } from './helpers/harness';

const h = useHarness();

describe('管理员登录', () => {
  it('首次使用需要创建管理员，创建后不能再创建', async () => {
    const me = await h().api('GET', '/api/admin/me');
    expect(me.status).toBe(401);
    expect(me.body.data).toEqual({ setup_required: true });
    expect((await h().api('POST', '/api/admin/setup', { username: 'admin', password: 'short' })).status).toBe(400);
    expect((await h().api('POST', '/api/admin/setup', { username: 'bad name', password: 'password123' })).status).toBe(400);
    await h().loginAdmin();
    expect((await h().api('GET', '/api/admin/me')).body.data.username).toBe('admin');
    const again = await h().api('POST', '/api/admin/setup', { username: 'other', password: 'password123' });
    expect(again.status).toBe(409);
    h().cookies.clear();
    expect((await h().api('GET', '/api/admin/me')).body.data).toBeNull();
  });

  it('ADMIN_PASSWORD 只在还没有管理员时生效', async () => {
    const env = { ...h().env, ADMIN_USERNAME: 'root', ADMIN_PASSWORD: 'short' }; // 部署者设置的密码照原样使用
    await h().context();
    await ensureAdminFromEnv(h().db as any, env);
    await ensureAdminFromEnv(h().db as any, { ...env, ADMIN_USERNAME: 'second' });
    expect(h().db.rows('SELECT username FROM admins')).toEqual([{ username: 'root' }]);
    expect((await h().api('POST', '/api/admin/login', { username: 'root', password: 'short' })).status).toBe(200);
  });

  it('登录 Cookie 为 HttpOnly + SameSite=Strict，HTTPS 下带 Secure', async () => {
    await h().loginAdmin();
    h().cookies.clear();
    const response = await h().request('POST', '/api/admin/login', { json: { username: 'admin', password: 'password123' } });
    const cookie = response.headers.get('Set-Cookie') || '';
    expect(cookie).toMatch(/lx_admin_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Secure/);
  });

  it('登录需要 JSON 请求体，并校验来源', async () => {
    await h().loginAdmin();
    const form = await h().request('POST', '/api/admin/login', {
      body: 'username=admin&password=password123', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(form.status).toBe(400);
    const crossSite = await h().api('POST', '/api/admin/login', { username: 'admin', password: 'password123' }, { Origin: 'https://evil.example' });
    expect(crossSite.status).toBe(403);
    const sameSite = await h().api('POST', '/api/admin/login', { username: 'admin', password: 'password123' }, { Origin: 'https://lx.test' });
    expect(sameSite.status).toBe(200);
  });

  it('密码错误 5 次后暂时禁止登录，成功登录会清空计数', async () => {
    await h().loginAdmin();
    for (let i = 0; i < 4; i++) expect((await h().api('POST', '/api/admin/login', { username: 'admin', password: 'wrong-pass' })).status).toBe(401);
    expect((await h().api('POST', '/api/admin/login', { username: 'admin', password: 'password123' })).status).toBe(200);
    for (let i = 0; i < 5; i++) await h().api('POST', '/api/admin/login', { username: 'admin', password: 'wrong-pass' });
    expect((await h().api('POST', '/api/admin/login', { username: 'admin', password: 'password123' })).status).toBe(429);
  });

  it('所有后台接口都需要登录', async () => {
    const endpoints: [string, string][] = [
      ['GET', '/api/admin/overview'], ['GET', '/api/admin/config'], ['PUT', '/api/admin/config'], ['GET', '/api/admin/config/raw'],
      ['PUT', '/api/admin/config/raw'], ['GET', '/api/admin/users'], ['POST', '/api/admin/users'], ['PATCH', '/api/admin/users/1'],
      ['DELETE', '/api/admin/users/1'], ['POST', '/api/admin/users/1/reset-key'], ['GET', '/api/admin/stats'],
      ['GET', '/api/admin/stats/logs'], ['GET', '/api/admin/health'], ['POST', '/api/admin/health/refresh'],
      ['POST', '/api/admin/tasks/x/run'], ['POST', '/api/admin/account/password'], ['POST', '/api/admin/account/logout-others'],
      ['POST', '/api/admin/music-login/qr'], ['POST', '/api/admin/music-login/phone/send'], ['POST', '/api/admin/music-login/phone/verify'],
      ['GET', '/api/admin/music-login/x'], ['POST', '/api/admin/music-login/x/cancel'], ['POST', '/api/admin/music-login/x/apply'],
    ];
    for (const [method, path] of endpoints) {
      const result = await h().api(method, path, method === 'GET' ? undefined : {});
      expect(result.status, `${method} ${path}`).toBe(401);
    }
  });

  it('写操作校验来源，可以在配置里关闭', async () => {
    await h().loginAdmin();
    const evil = { Origin: 'https://evil.example' };
    expect((await h().api('POST', '/api/admin/users', { name: 'bob' }, evil)).status).toBe(403);
    await h().writeConfig({ 'security.admin_origin_check': false });
    expect((await h().api('POST', '/api/admin/users', { name: 'bob' }, evil)).status).toBe(201);
  });

  it('修改密码后其他会话失效；当前密码错误会被限制', async () => {
    await h().loginAdmin();
    const first = new Map(h().cookies);
    h().cookies.clear();
    await h().api('POST', '/api/admin/login', { username: 'admin', password: 'password123' });
    expect((await h().api('GET', '/api/admin/me')).body.data.other_sessions).toBe(1);
    expect((await h().api('POST', '/api/admin/account/password', { current: 'wrong', new: 'new-password-1' })).status).toBe(400);
    expect((await h().api('POST', '/api/admin/account/password', { current: 'password123', new: 'short' })).status).toBe(400);
    expect((await h().api('POST', '/api/admin/account/password', { current: 'password123', new: 'new-password-1' })).status).toBe(200);
    expect((await h().api('GET', '/api/admin/me')).body.data.other_sessions).toBe(0);
    const current = new Map(h().cookies);
    h().cookies = first;
    expect((await h().api('GET', '/api/admin/me')).status).toBe(401);
    h().cookies = current;
    expect((await h().api('POST', '/api/admin/logout', {})).status).toBe(200);
    expect((await h().api('GET', '/api/admin/me')).status).toBe(401);
  });
});

describe('配置', () => {
  it('每个表单项都在默认配置里，depends 指向同一分组里前面的开关', () => {
    for (const section of SECTIONS) {
      const seen = new Set<string>();
      for (const field of section.fields) {
        expect(getPath(DEFAULT_CONFIG, field.key), field.key).not.toBeUndefined();
        if (field.depends) {
          expect(seen.has(field.depends), field.key).toBe(true);
          expect(FIELDS[field.depends].type).toBe('bool');
        }
        seen.add(field.key);
      }
    }
  });

  it('值的校验与转换', () => {
    expect(convert(FIELDS['security.rate_limit.ip'], '1.5')).toBe(1.5);
    expect(() => convert(FIELDS['security.rate_limit.ip'], -1)).toThrow('不能小于 0');
    expect(() => convert(FIELDS['common.parse_log_retention_days'], 1.5)).toThrow('需要整数');
    expect(() => convert(FIELDS['module.tx.enable'], 'yes')).toThrow();
    expect(convert(FIELDS['common.download_config.quality.tx'], ['flac', '128k', 'flac'])).toEqual(['128k', 'flac']);
    expect(() => convert(FIELDS['common.download_config.quality.tx'], ['sky'])).toThrow('未知的选项');
    expect(convert(FIELDS['security.allowed_host.list'], [' a.com ', '', 'a.com'])).toEqual(['a.com']);
    expect(() => convert(FIELDS['common.download_config.name'], 'a\nb')).toThrow('不能包含换行');
    expect(() => convert(FIELDS['module.kg.client.appid'], '9999')).toThrow('不是可选的值');
    expect(secretPreview('short')).toEqual({ set: true, preview: '' });
    expect(secretPreview('0123456789abcdef')).toEqual({ set: true, preview: 'cdef' });
  });

  it('密钥只返回是否已设置；保存前先校验全部字段；null 保持、空串清空', async () => {
    await h().loginAdmin();
    await h().writeConfig({ 'module.tx.user.qqmusic_key': 'Q_H_L_SECRET_VALUE_1234' });
    const config = await h().api('GET', '/api/admin/config');
    const text = JSON.stringify(config.body);
    expect(text).not.toContain('SECRET_VALUE');
    const field = config.body.data.sections.flatMap((s: any) => s.fields).find((f: any) => f.key === 'module.tx.user.qqmusic_key');
    expect(field.value).toEqual({ set: true, preview: '1234' });

    const bad = await h().api('PUT', '/api/admin/config', { values: { 'common.cookiepool': true, 'security.rate_limit.ip': -5, 'x.y': 1 } });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.data.errors).sort()).toEqual(['security.rate_limit.ip', 'x.y']);
    expect((await h().config()).get('common.cookiepool')).toBe(false);

    const saved = await h().api('PUT', '/api/admin/config', { values: { 'module.tx.user.qqmusic_key': null, 'common.cookiepool': true } });
    expect(saved.body.data.saved).toEqual(['common.cookiepool']);
    expect((await h().config()).get('module.tx.user.qqmusic_key')).toBe('Q_H_L_SECRET_VALUE_1234');
    await h().api('PUT', '/api/admin/config', { values: { 'module.tx.user.qqmusic_key': '' } });
    expect((await h().config()).get('module.tx.user.qqmusic_key')).toBe('');
  });

  it('原始配置：读取、校验、保存前备份', async () => {
    await h().loginAdmin();
    await h().writeConfig({ 'common.fakeip': '1.2.3.4' });
    const raw = await h().api('GET', '/api/admin/config/raw');
    const content = JSON.parse(raw.body.data.content);
    expect(Object.keys(content)).toEqual(['common', 'security', 'module']);
    expect((await h().api('PUT', '/api/admin/config/raw', { content: '{oops' })).status).toBe(400);
    expect((await h().api('PUT', '/api/admin/config/raw', { content: '{"common":{}}' })).status).toBe(400);
    content.module.cookiepool.wy = [{ cookie: 'MUSIC_U=pool', refresh_login: { enable: true, interval: 3600 } }];
    const saved = await h().api('PUT', '/api/admin/config/raw', { content: JSON.stringify(content) });
    expect(saved.status).toBe(200);
    expect((await h().config()).get('module.cookiepool.wy')[0].cookie).toBe('MUSIC_U=pool');
    expect(h().db.rows("SELECT key FROM kv WHERE key = 'config_backup'")).toHaveLength(1);
  });

  it('并发写配置不会互相覆盖', async () => {
    const a = await h().context();
    const b = await h().context();
    await Promise.all([a.config.write('common.fakeip', '1.1.1.1'), b.config.write('common.timezone', 9)]);
    const config = await h().config();
    expect([config.get('common.fakeip'), config.get('common.timezone')]).toEqual(['1.1.1.1', 9]);
  });

  it('从旧版的 source_configs / system_settings 迁移', async () => {
    h().db.sqlite.exec(`CREATE TABLE source_configs (source TEXT, config_key TEXT, config_value TEXT, enabled INTEGER);
      CREATE TABLE system_settings (setting_key TEXT, setting_value TEXT);
      INSERT INTO source_configs VALUES ('tx','uin','123',1), ('tx','qm_keyst','Q_H_L_x',1), ('kg','token','t',1), ('wy','cookie','c',0), ('mg','by','x',1);
      INSERT INTO system_settings VALUES ('auth_enabled','false'), ('rate_limit_enabled','true'), ('rate_limit_requests','30'), ('log_level','debug');`);
    const config = await h().config();
    expect(config.get('module.tx.user')).toMatchObject({ uin: '123', qqmusic_key: 'Q_H_L_x' });
    expect(config.get('module.kg.user.token')).toBe('t');
    expect(config.get('module.wy.user.cookie')).toBe(''); // 已禁用的配置不迁移
    expect(config.get('security.key.enable')).toBe(false);
    expect(config.get('security.rate_limit.ip')).toBe(2);
    expect(config.get('common.debug_mode')).toBe(true);
  });
});

describe('用户', () => {
  it('创建时校验并拒绝重复', async () => {
    await h().loginAdmin();
    const created = await h().createUser('alice', 'alice-key-123');
    expect(created).toMatchObject({ name: 'alice', api_key: 'alice-key-123', enabled: 1, total: 0 });
    expect((await h().api('POST', '/api/admin/users', { name: 'alice' })).status).toBe(409);
    expect((await h().api('POST', '/api/admin/users', { name: 'bob', api_key: 'alice-key-123' })).status).toBe(409);
    expect((await h().api('POST', '/api/admin/users', { name: 'a b' })).status).toBe(400);
    expect((await h().api('POST', '/api/admin/users', { name: 'bob', api_key: 'short' })).status).toBe(400);
    const generated = await h().api('POST', '/api/admin/users', { name: 'bob' });
    expect(generated.body.data.api_key).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it('停用、重置 Key、删除', async () => {
    await h().loginAdmin();
    const user = await h().createUser();
    const headers = { 'X-Request-User': 'alice', 'X-Request-Key': 'alice-key-123' };
    h().fetch.on('https://interface.music.163.com/eapi/song/enhance/player/url/v1', json({ data: [{ url: 'http://m.music/x.mp3?a=1', level: 'standard' }] }));
    expect((await h().api('GET', '/url/wy/1/128k', undefined, headers)).body.code).toBe(0);
    await h().api('PATCH', `/api/admin/users/${user.id}`, { enabled: false });
    expect((await h().api('GET', '/url/wy/1/128k', undefined, headers)).status).toBe(403);
    expect((await h().api('PATCH', `/api/admin/users/${user.id}`, { enabled: 'no' })).status).toBe(400);
    await h().api('PATCH', `/api/admin/users/${user.id}`, { enabled: true });
    const reset = await h().api('POST', `/api/admin/users/${user.id}/reset-key`, {});
    expect(reset.body.data.api_key).not.toBe('alice-key-123');
    expect((await h().api('GET', '/url/wy/1/128k', undefined, headers)).status).toBe(403);
    expect((await h().api('DELETE', `/api/admin/users/${user.id}`)).body.data).toEqual({ id: user.id });
    expect((await h().api('DELETE', `/api/admin/users/${user.id}`)).status).toBe(404);
    // 鉴权失败的请求不记录；删除用户后历史解析记录保留
    expect(h().db.rows('SELECT username, user_id FROM parse_logs')).toEqual([{ username: 'alice', user_id: null }]);
  });
});

describe('解析接口', () => {
  const headers = { 'X-Request-User': 'alice', 'X-Request-Key': 'alice-key-123' };

  it('未知或已下线的平台在鉴权前就被拒绝', async () => {
    for (const source of ['kw', 'mg', 'xx']) {
      const result = await h().api('GET', `/url/${source}/1/128k`);
      expect(result.body).toEqual({ code: 1, msg: '未知的源或不支持的方法', data: null });
    }
  });

  it('缺少或错误的 Key 返回 403', async () => {
    await h().loginAdmin();
    await h().createUser();
    expect((await h().api('GET', '/url/tx/1/128k')).body.msg).toBe('缺少用户名或 key');
    const wrong = await h().api('GET', '/url/tx/1/128k', undefined, { ...headers, 'X-Request-Key': 'wrong' });
    expect([wrong.status, wrong.body.msg]).toEqual([403, 'key验证失败']);
  });

  it('关闭的平台对所有方法都不提供服务，并记录到统计里', async () => {
    await h().loginAdmin();
    await h().createUser();
    await h().writeConfig({ 'module.kg.enable': false });
    for (const path of ['/url/kg/abc/128k', '/info/kg/abc', '/lyric/kg/abc', '/search/kg/song?query=x']) {
      const result = await h().api('GET', path, undefined, headers);
      expect([result.status, result.body.code], path).toEqual([404, 4]);
    }
    expect(h().db.rows('SELECT COUNT(*) AS n FROM parse_logs WHERE success = 0')[0].n).toBe(4);
  });

  it('成功的解析会缓存，平台返回失败记为失败', async () => {
    await h().loginAdmin();
    await h().createUser();
    let calls = 0;
    h().fetch.on('https://interface.music.163.com/eapi/song/enhance/player/url/v1', () => {
      calls += 1;
      return json({ data: [{ url: 'http://m.music/x.mp3?auth=1', level: 'exhigh' }] });
    });
    const first = await h().api('GET', '/url/wy/5/320k', undefined, headers);
    expect(first.body).toMatchObject({ code: 0, data: 'http://m.music/x.mp3', extra: { cache: false, quality: { target: '320k', result: '320k' } } });
    const second = await h().api('GET', '/url/wy/5/320k', undefined, headers);
    expect(second.body.extra.cache).toBe(true);
    expect(second.body.extra.expire.time).toBe(first.body.extra.expire.time);
    expect(calls).toBe(1);
    // 音质不符(没有会员时返回低音质)会被拒绝
    const flac = await h().api('GET', '/url/wy/5/flac', undefined, headers);
    expect(flac.body).toMatchObject({ code: 2, msg: 'reject unmatched quality' });
    expect(h().db.rows('SELECT method, success, error_message FROM parse_logs ORDER BY id')).toEqual([
      { method: 'url', success: 1, error_message: null },
      { method: 'url', success: 1, error_message: null },
      { method: 'url', success: 0, error_message: 'reject unmatched quality' },
    ]);
    expect(h().db.rows('SELECT last_used_at IS NOT NULL AS used FROM users')).toEqual([{ used: 1 }]);
  });

  it('关闭 Key 鉴权后不需要用户名', async () => {
    await h().writeConfig({ 'security.key.enable': false });
    h().fetch.on('https://interface.music.163.com/', json({ data: [{ url: 'http://m/x.mp3', level: 'standard' }] }));
    expect((await h().api('GET', '/url/wy/9/128k')).body.code).toBe(0);
  });

  it('不支持的方法', async () => {
    await h().writeConfig({ 'security.key.enable': false });
    expect((await h().api('GET', '/lyric/wy/1')).body.code).toBe(1);
    expect((await h().api('GET', '/config/tx/1')).body.code).toBe(1);
    expect((await h().api('GET', '/search/tx/song?query=a')).body.code).toBe(1);
  });

  it('解析接口按配置限速，后台不限速', async () => {
    await h().loginAdmin();
    await h().writeConfig({ 'security.key.enable': false, 'security.rate_limit.ip': 60 });
    h().fetch.on('https://interface.music.163.com/', json({ data: [{ url: 'http://m/x.mp3', level: 'standard' }] }));
    expect((await h().api('GET', '/url/wy/1/128k')).body.code).toBe(0);
    const limited = await h().api('GET', '/url/wy/1/128k');
    expect([limited.status, limited.body]).toEqual([429, { code: 5, msg: 'IP限速', data: null }]);
    h().ip = '198.51.100.7';
    expect((await h().api('GET', '/url/wy/1/128k')).body.code).toBe(0);
    for (let i = 0; i < 3; i++) expect((await h().api('GET', '/api/admin/me')).status).toBe(200);
    expect(isWebuiRequest('/api/public/resolve')).toBe(false);
    expect(isWebuiRequest('/api/public/status')).toBe(true);
  });

  it('Host 白名单：不匹配时返回 404 并可封禁 IP', async () => {
    await h().writeConfig({
      'security.allowed_host.enable': true, 'security.allowed_host.list': ['music.example.com'],
      'security.allowed_host.blacklist.enable': true, 'security.allowed_host.blacklist.length': 0,
    });
    expect((await h().api('GET', '/api/public/status')).status).toBe(404);
    h().host = 'music.example.com';
    const banned = await h().api('GET', '/api/public/status');
    expect([banned.status, banned.body.msg]).toEqual([403, '您的IP已被封禁']);
    h().ip = '198.51.100.9';
    expect((await h().api('GET', '/api/public/status')).status).toBe(200);
  });

  it('音源脚本：填好地址、用户名、Key 和音质，检查更新', async () => {
    await h().loginAdmin();
    await h().createUser();
    await h().writeConfig({ 'common.download_config.quality': { tx: ['128k', '320k'], kw: ['128k'] }, 'common.download_config.name': '我的 */ 音源' });
    const response = await h().request('GET', '/script?key=alice-key-123');
    const script = await response.text();
    expect(response.headers.get('Content-Type')).toContain('javascript');
    expect(script).toContain('const API_URL = "https://lx.test"');
    expect(script).toContain('const USER_NAME = "alice"');
    expect(script).toContain('const API_KEY = "alice-key-123"');
    expect(script).toContain(' * @name 我的 * / 音源');
    const quality = JSON.parse(JSON.parse(/const MUSIC_QUALITY = JSON\.parse\((".*")\)/.exec(script)![1]));
    expect(quality).toEqual({ kg: ['128k'], tx: ['128k', '320k'], wy: ['128k'] }); // 已下线的平台(kw)不会写进脚本
    expect(script).not.toContain("MUSIC_SOURCE.push('local')");
    const md5 = /const SCRIPT_MD5 = '([0-9a-f]{32})'/.exec(script)![1];
    expect((await h().api('GET', `/script?key=alice-key-123&checkUpdate=${md5}`)).body.data).toBeNull();
    const update = await h().api('GET', '/script?key=alice-key-123&checkUpdate=old');
    expect(update.body.data.updateMsg).toBe('源脚本有更新啦，更新地址:\nhttps://lx.test/script?key=alice-key-123');
    expect((await h().api('GET', '/script?key=wrong')).status).toBe(403);
    await h().writeConfig({ 'common.allow_download_script': false });
    expect((await h().api('GET', '/script?key=alice-key-123')).status).toBe(404);
  });
});

describe('统计、模块状态、首页', () => {
  it('统计概览和解析记录筛选', async () => {
    await h().loginAdmin();
    const db = h().db;
    const now = Math.floor(Date.now() / 1000);
    db.sqlite.exec(`INSERT INTO parse_logs (username, source, method, success, error_message, created_at) VALUES
      ('alice','tx','url',1,NULL,${now}), ('alice','kg','url',0,'失败了',${now}), ('bob','wy','url',1,NULL,${now - 3 * 86400}),
      ('bob','wy','url',1,NULL,${now - 40 * 86400})`);
    const week = await h().api('GET', '/api/admin/stats?days=7');
    expect(week.body.data.totals).toEqual({ total: 3, success: 2, users: 2, failure: 1 });
    expect(week.body.data.daily).toHaveLength(7);
    expect(week.body.data.daily.at(-1)).toMatchObject({ total: 2, success: 1 });
    expect(week.body.data.by_source.map((r: any) => r.name)).toContain('网易云音乐');
    expect((await h().api('GET', '/api/admin/stats?days=1')).body.data.totals.total).toBe(2);
    expect((await h().api('GET', '/api/admin/stats?days=999')).body.data.days).toBe(7);
    const logs = await h().api('GET', '/api/admin/stats/logs?result=failure');
    expect(logs.body.data.total).toBe(1);
    expect(logs.body.data.logs[0].error_message).toBe('失败了');
    expect((await h().api('GET', '/api/admin/stats/logs?username=bob&limit=1')).body.data).toMatchObject({ total: 2, limit: 1 });
  });

  it('模块状态：只有管理员能看到 admin_detail', async () => {
    await h().loginAdmin();
    await h().writeConfig({
      'module.tx.enable': false, 'module.wy.user.cookie': 'MUSIC_U=x', 'module.wy.user.refresh_login.enable': true,
    });
    h().fetch.on('https://interface.music.163.com/eapi/login/token/refresh', json({ code: 301 }));
    h().fetch.on('https://interface.music.163.com', new Response('ok'));
    await h().cron(new Date(Date.UTC(2026, 0, 1, 0, 5))); // 每 5 分钟检查一次平台状态
    const health = await h().api('GET', '/api/admin/health');
    const wy = health.body.data.modules.find((m: any) => m.source === 'wy');
    expect(wy.status).toBe('degraded');
    expect(wy.detail).toBe('账号刷新登录异常');
    expect(wy.admin_detail).toContain('wy_refresh_login 已连续失败 1 次');
    expect(health.body.data.modules.find((m: any) => m.source === 'tx').status).toBe('disabled');
    expect(health.body.data.modules.find((m: any) => m.source === 'kg')).toMatchObject({ status: 'misconfigured', detail: '缺少: token, userid' });
    const task = health.body.data.tasks.find((t: any) => t.name === 'wy_refresh_login');
    expect(task).toMatchObject({ label: '网易云 · 刷新登录', consecutive_failures: 1 });

    const status = await h().api('GET', '/api/public/status');
    expect(JSON.stringify(status.body)).not.toContain('admin_detail');
    expect(status.body.data.modules.map((m: any) => m.source)).toEqual(['kg', 'wy']);
    expect(status.body.data.sources.map((s: any) => s.id)).toEqual(['kg', 'wy']);
  });

  it('立即执行任务', async () => {
    await h().loginAdmin();
    expect((await h().api('POST', '/api/admin/tasks/parse_logs_cleanup/run', {})).status).toBe(200);
    const task = (await h().api('GET', '/api/admin/health')).body.data.tasks.find((t: any) => t.name === 'parse_logs_cleanup');
    expect(task.last_success_at).not.toBeNull();
    expect((await h().api('POST', '/api/admin/tasks/wy_refresh_login/run', {})).status).toBe(404);
  });

  it('首页在线解析：校验参数、失败次数过多时限制', async () => {
    await h().loginAdmin();
    await h().createUser();
    const resolve = (body: Record<string, unknown>) => h().api('POST', '/api/public/resolve', body);
    expect((await resolve({ source: 'kw', song_id: '1', quality: '128k' })).body.msg).toBe('不支持的平台');
    expect((await resolve({ source: 'wy', song_id: '1', quality: '999k' })).body.msg).toBe('不支持的音质');
    expect((await resolve({ source: 'wy', song_id: '../1', quality: '128k' })).body.msg).toBe('歌曲 ID 格式不正确');
    expect((await resolve({ source: 'wy', song_id: '1', quality: '128k' })).body.msg).toBe('请输入用户名和 Key');
    h().fetch.on('https://interface.music.163.com/', json({ data: [{ url: 'http://m/ok.mp3', level: 'standard' }] }));
    const ok = await resolve({ source: 'wy', song_id: '1', quality: '128k', username: 'alice', key: 'alice-key-123' });
    expect(ok.body.data).toMatchObject({ url: 'http://m/ok.mp3', quality: '128k', cached: false });
    for (let i = 0; i < 5; i++) await resolve({ source: 'wy', song_id: '1', quality: '128k', username: 'alice', key: 'bad-key-000' });
    expect((await resolve({ source: 'wy', song_id: '1', quality: '128k', username: 'alice', key: 'alice-key-123' })).status).toBe(429);
  });

  it('页面是单页应用外壳，带安全响应头；接口不缓存', async () => {
    for (const path of ['/', '/admin', '/admin/config', '/admin/anything/else']) {
      const response = await h().request('GET', path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(await response.text()).toContain(path === '/' ? '/static/js/public.js' : '/static/js/admin.js');
    }
    const api = await h().request('GET', '/api/public/status');
    expect(api.headers.get('Cache-Control')).toBe('no-store');
    expect(api.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect((await h().request('GET', '/static/js/missing.js')).status).toBe(404);
    expect((await h().api('GET', '/no/such/path/here/at/all')).body.code).toBe(6);
  });
});

describe('ADMIN_PASSWORD', () => {
  const env = useHarness({ ADMIN_PASSWORD: 'env-password' });

  it('部署时设置的密码直接可用；删除管理员后会用它重新创建，不会出现创建页面', async () => {
    expect((await env().api('GET', '/api/admin/me')).body.data).toBeNull(); // 需要登录，而不是创建管理员
    expect((await env().api('POST', '/api/admin/setup', { username: 'x', password: 'password123' })).status).toBe(409);
    expect((await env().api('POST', '/api/admin/login', { username: 'admin', password: 'env-password' })).status).toBe(200);
    env().db.sqlite.exec('DELETE FROM admins');
    env().cookies.clear();
    expect((await env().api('GET', '/api/admin/me')).body.data).toBeNull();
    expect((await env().api('POST', '/api/admin/login', { username: 'admin', password: 'env-password' })).status).toBe(200);
  });
});
