import { describe, expect, it } from 'vitest';
import { aesEcbDecrypt, hexToBytes, utf8Decode } from '../src/lib/crypto';
import { kvSet } from '../src/lib/db';
import { newDevice } from '../src/sources/tx/device';
import {
  checkSigUrlAllowed, cookiesForHost, credentialFromLogin, ENDPOINTS, extractBetween, hash33, redirectAllowed, validatePhone,
} from '../src/sources/tx/login';
import { qrSvg } from '../src/sources/wy/login';
import { json, useHarness, type FetchCall } from './helpers/harness';

const h = useHarness();
const QRSIG = 'qr+sig/with=special-chars_0123456789abcdef*';
const LOGIN_DATA = { musickey: 'Q_H_L_NEWKEY', musicid: 123456, refresh_key: 'RK', refresh_token: 'RT', openid: 'OID', access_token: 'AT', unionid: 'UID', nick: 'tester', loginType: 2 };
const ptui = (code: number, url = '') => `ptuiCB('${code}','0','${url}','0','msg', 'nick');`;
const CHECK_URL = 'https://ssl.ptlogin2.graph.qq.com/check_sig?pttype=1&uin=123456&service=ptqrlogin&nodirect=0&ptsigx=SIGX&s_url=https%3A%2F%2Fgraph.qq.com';

/** 准备好设备和 QIMEI，避免访问真实的 QIMEI 接口 */
async function prepareDevice() {
  const device = newDevice();
  device.qimei = { q16: 'Q16', q36: 'Q36VALUE' };
  device.qimei_time = Math.floor(Date.now() / 1000);
  await h().context();
  await kvSet(h().db as any, 'tx_device', device);
}

function cgiRoute(results: Record<string, [number, Record<string, unknown>]>) {
  h().fetch.on(ENDPOINTS.cgi, (call: FetchCall) => {
    const body = JSON.parse(call.body);
    const key = `${body.req_0.module}.${body.req_0.method}`;
    const [code, data] = results[key] || [1000, {}];
    return json({ code: 0, req_0: { code, data } });
  });
}

function qqServer(states: string[], { pSkey = true, needCookie = false } = {}) {
  h().fetch.on(ENDPOINTS.ptqrshow, () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
    headers: [['Content-Type', 'image/png'], ['Set-Cookie', 'other=1; Path=/'], ['Set-Cookie', `qrsig=${QRSIG}; Path=/; Domain=ptlogin2.qq.com`]],
  }));
  h().fetch.on(ENDPOINTS.ptqrlogin, () => {
    const text = states.length > 1 ? states.shift()! : states[0];
    const headers: [string, string][] = [];
    if (text.startsWith("ptuiCB('0'")) {
      headers.push(['Set-Cookie', 'pt2gguin=o0123456; Path=/; Domain=qq.com'], ['Set-Cookie', 'ptcz=HOSTONLY; Path=/']);
    }
    return new Response(text, { headers });
  });
  h().fetch.on((call) => call.url.startsWith('https://ssl.ptlogin2.graph.qq.com/check_sig'), (call) => {
    const headers: [string, string][] = [['Location', 'https://graph.qq.com/oauth2.0/login_jump?x=1']];
    const hasCookie = (call.headers.get('Cookie') || '').includes('pt2gguin=o0123456');
    if (pSkey && call.headers.get('User-Agent')!.includes('Mozilla/5.0') && (hasCookie || !needCookie)) {
      headers.push(['Set-Cookie', 'p_skey=; Path=/; Domain=qq.com'], ['Set-Cookie', 'p_skey=PSKEY_VALUE; Path=/; Domain=graph.qq.com'],
        ['Set-Cookie', 'p_uin=o0123456; Path=/; Domain=graph.qq.com']);
    }
    return new Response(null, { status: 302, headers });
  });
  h().fetch.on(ENDPOINTS.authorize, () => new Response(null, {
    status: 302, headers: { Location: 'https://y.qq.com/portal/wx_redirect.html?login_type=1&code=AUTHCODE&state=state' },
  }));
}

async function poll(id: string) {
  return (await h().api('GET', `/api/admin/music-login/${id}`)).body.data;
}

describe('QQ 登录工具函数', () => {
  it('hash33、extractBetween、手机号校验', () => {
    expect(hash33('placeholder-musickey', 5381)).toBe(1143673215);
    expect(hash33('')).toBe(0);
    expect(extractBetween('a=1&b=2', 'a=', '&')).toBe('1');
    expect(extractBetween('a=1', 'a=', '&')).toBe('');
    expect(validatePhone(' 13800138000 ', '+86')).toEqual(['13800138000', '86']);
    for (const [phone, country] of [['', '86'], ['abc', '86'], ['1234', '86'], ['1'.repeat(16), '86'], ['13800138000', 'cn']]) {
      expect(() => validatePhone(phone, country)).toThrow();
    }
  });

  it('登录接口的响应转换成凭证', () => {
    expect(credentialFromLogin(0, LOGIN_DATA, 2)).toMatchObject({ qqmusic_key: 'Q_H_L_NEWKEY', uin: '123456', login_type: '2', nick: 'tester' });
    expect(credentialFromLogin(0, { musicKey: 'K', uin: '99' }, 1)).toMatchObject({ qqmusic_key: 'K', uin: '99', refresh_key: '' });
    expect(() => credentialFromLogin(20271, {}, 0)).toThrow('验证码错误');
    expect(() => credentialFromLogin(12345, {}, 0)).toThrow('12345');
    expect(() => credentialFromLogin(0, { musicid: 1 }, 0)).toThrow();
  });

  it('只跟随 qq.com 的地址；只把浏览器会带的 Cookie 带给 check_sig', () => {
    expect(redirectAllowed('https://graph.qq.com/x')).toBe(true);
    expect(redirectAllowed('https://evil.com/?q=qq.com')).toBe(false);
    expect(redirectAllowed('https://qq.com.evil.com/')).toBe(false);
    expect(checkSigUrlAllowed(CHECK_URL)).toBe(true);
    expect(checkSigUrlAllowed('https://evil.com/check_sig')).toBe(false);
    expect(cookiesForHost(['a=1; Domain=qq.com', 'b=2; Path=/', 'c=3; Domain=.ptlogin2.graph.qq.com', 'd=; Domain=qq.com', 'e=5; Domain=weixin.qq.com'],
      'ssl.ptlogin2.graph.qq.com')).toEqual({ a: '1', c: '3' });
  });
});

describe('QQ 扫码登录', () => {
  it('完整流程：扫码、确认、换取凭证、保存为主账号', async () => {
    await h().loginAdmin();
    await prepareDevice();
    qqServer([ptui(66), ptui(67), ptui(0, CHECK_URL)]);
    cgiRoute({ 'QQConnectLogin.LoginServer.QQLogin': [0, LOGIN_DATA] });
    const started = await h().api('POST', '/api/admin/music-login/qr', { kind: 'qq' });
    expect(started.body.data).toMatchObject({ kind: 'qq', platform: 'tx', state: 'scan', expires_in: 180 });
    expect(started.body.data.image).toMatch(/^data:image\/png;base64,/);
    const id = started.body.data.id;
    expect((await poll(id)).state).toBe('scan');
    expect((await poll(id)).state).toBe('conf');
    const done = await poll(id);
    expect(done).toMatchObject({ state: 'done', account: { uin: '123456', nick: 'tester', has_refresh: true } });
    expect(JSON.stringify(done)).not.toContain('NEWKEY'); // 状态接口不能带出凭证

    const loginCall = h().fetch.callsTo(ENDPOINTS.ptqrlogin)[0];
    expect(new URL(loginCall.url).searchParams.get('ptqrtoken')).toBe(String(hash33(QRSIG)));
    expect(loginCall.headers.get('Cookie')).toBe(`qrsig=${QRSIG}`);
    const authorize = h().fetch.callsTo(ENDPOINTS.authorize)[0];
    expect(new URLSearchParams(authorize.body).get('g_tk')).toBe(String(hash33('PSKEY_VALUE', 5381)));
    expect(authorize.headers.get('Cookie')).toContain('p_skey=PSKEY_VALUE');
    const cgi = JSON.parse(h().fetch.callsTo(ENDPOINTS.cgi)[0].body);
    expect(cgi.req_0.param).toEqual({ code: 'AUTHCODE' });
    expect(cgi.comm).toMatchObject({ tmeLoginType: 2, QIMEI36: 'Q36VALUE', ct: 11 });

    const applied = await h().api('POST', `/api/admin/music-login/${id}/apply`, { target: 'main', enable_refresh: true });
    expect(applied.body.data.note).toBe('已保存为主账号 (module.tx.user)');
    const user = (await h().config()).get('module.tx.user');
    expect(user).toMatchObject({ qqmusic_key: 'Q_H_L_NEWKEY', uin: '123456', refresh_key: 'RK', login_type: '2', refresh_login: { enable: true, interval: 86000 } });
    expect((await poll(id)).state).toBe('applied');
    expect((await h().api('POST', `/api/admin/music-login/${id}/apply`, { target: 'main' })).status).toBe(400);
  });

  it('第一次 check_sig 没有 p_skey 时，按浏览器的方式带 Cookie 重试', async () => {
    await h().loginAdmin();
    await prepareDevice();
    qqServer([ptui(0, CHECK_URL)], { needCookie: true });
    cgiRoute({ 'QQConnectLogin.LoginServer.QQLogin': [0, LOGIN_DATA] });
    const id = (await h().api('POST', '/api/admin/music-login/qr', { kind: 'qq' })).body.data.id;
    expect((await poll(id)).state).toBe('done');
    const checks = h().fetch.callsTo('https://ssl.ptlogin2.graph.qq.com/check_sig');
    expect(checks).toHaveLength(2);
    expect(checks[0].headers.get('Cookie')).toBeNull();
    expect(checks[1].url).toBe(CHECK_URL);
    expect(checks[1].headers.get('Cookie')).toBe('pt2gguin=o0123456'); // 没有 Domain 的 ptcz 不会被带过去
  });

  it('两次都拿不到 p_skey 时报告原因；拒绝、过期', async () => {
    await h().loginAdmin();
    await prepareDevice();
    qqServer([ptui(0, CHECK_URL)], { pSkey: false });
    let id = (await h().api('POST', '/api/admin/music-login/qr', { kind: 'qq' })).body.data.id;
    const failed = await poll(id);
    expect(failed.state).toBe('error');
    expect(failed.message).toContain('没有拿到 p_skey(HTTP 302，跳转到 graph.qq.com/oauth2.0/login_jump；重试：HTTP 302');
    h().fetch.routes = [];
    qqServer([ptui(68)]);
    id = (await h().api('POST', '/api/admin/music-login/qr', { kind: 'qq' })).body.data.id;
    expect(await poll(id)).toMatchObject({ state: 'refuse', message: '你已在手机上拒绝了登录' });
    h().fetch.routes = [];
    qqServer([ptui(65)]);
    id = (await h().api('POST', '/api/admin/music-login/qr', { kind: 'qq' })).body.data.id;
    expect(await poll(id)).toMatchObject({ state: 'timeout' });
  });

  it('授权被重定向到未知地址时停止', async () => {
    await h().loginAdmin();
    await prepareDevice();
    qqServer([ptui(0, CHECK_URL)]);
    h().fetch.routes.unshift((call) => call.url.startsWith(ENDPOINTS.authorize)
      ? new Response(null, { status: 302, headers: { Location: 'https://evil.example/next' } }) : null);
    const id = (await h().api('POST', '/api/admin/music-login/qr', { kind: 'qq' })).body.data.id;
    expect(await poll(id)).toMatchObject({ state: 'error', message: '授权过程被重定向到了未知的地址' });
    expect(h().fetch.callsTo('https://evil.example')).toHaveLength(0);
  });

  it('会话只属于发起的管理员；取消；获取二维码失败时不留下会话', async () => {
    await h().loginAdmin();
    qqServer([ptui(66)]);
    const id = (await h().api('POST', '/api/admin/music-login/qr', { kind: 'qq' })).body.data.id;
    const mine = new Map(h().cookies);
    await h().api('POST', '/api/admin/logout', {});
    h().db.sqlite.exec("UPDATE login_sessions SET owner = owner"); // 保持会话
    // 另一个管理员
    h().db.sqlite.exec("INSERT INTO admins (username, password_hash, created_at) SELECT 'other', password_hash, 0 FROM admins");
    await h().api('POST', '/api/admin/login', { username: 'other', password: 'password123' });
    expect((await h().api('GET', `/api/admin/music-login/${id}`)).status).toBe(404);
    h().cookies = mine;
    await h().api('POST', '/api/admin/login', { username: 'admin', password: 'password123' });
    await h().api('POST', `/api/admin/music-login/${id}/cancel`, {});
    expect((await poll(id)).state).toBe('cancelled');
    h().fetch.routes = [];
    h().fetch.on(ENDPOINTS.ptqrshow, new Response('', { status: 500 }));
    const failed = await h().api('POST', '/api/admin/music-login/qr', { kind: 'qq' });
    expect([failed.status, failed.body.msg]).toEqual([400, '获取二维码失败(HTTP 500)']);
    expect(h().db.rows("SELECT COUNT(*) AS n FROM login_sessions WHERE state = 'scan'")[0].n).toBe(0);
  });
});

describe('微信扫码登录', () => {
  it('完整流程', async () => {
    await h().loginAdmin();
    await prepareDevice();
    h().fetch.on(ENDPOINTS.wx_qrconnect, new Response('<a href="?uuid=UUID123456">x</a><script>var s="uuid=UUID123456"</script>'));
    h().fetch.on('https://open.weixin.qq.com/connect/qrcode/UUID123456', new Response(new Uint8Array([0xff, 0xd8, 0xff])));
    const states = ['window.wx_errcode=408;', 'window.wx_errcode=404;', "window.wx_errcode=405;window.wx_code='WXCODE';"];
    h().fetch.on(ENDPOINTS.wx_poll, () => new Response(states.length > 1 ? states.shift()! : states[0]));
    cgiRoute({ 'music.login.LoginServer.Login': [0, { ...LOGIN_DATA, musickey: 'W_X_KEY' }] });
    const started = (await h().api('POST', '/api/admin/music-login/qr', { kind: 'wx' })).body.data;
    expect(started.image).toMatch(/^data:image\/jpeg;base64,/);
    expect((await poll(started.id)).state).toBe('scan');
    expect((await poll(started.id)).state).toBe('conf');
    expect((await poll(started.id)).state).toBe('done');
    const cgi = JSON.parse(h().fetch.callsTo(ENDPOINTS.cgi)[0].body);
    expect(cgi.req_0.param).toEqual({ code: 'WXCODE', strAppid: 'wx48db31d50e334801' });
    expect(cgi.comm.tmeLoginType).toBe(1);
  });

  it('uuid 格式不对时报错', async () => {
    await h().loginAdmin();
    h().fetch.on(ENDPOINTS.wx_qrconnect, new Response('uuid=<script>"'));
    expect((await h().api('POST', '/api/admin/music-login/qr', { kind: 'wx' })).body.msg).toBe('获取二维码失败: 没有拿到 uuid');
  });
});

describe('手机验证码登录', () => {
  it('发送：成功、需要人机验证(只放行腾讯域名)、过于频繁、冷却', async () => {
    await h().loginAdmin();
    await prepareDevice();
    const results: [number, Record<string, unknown>][] = [
      [20276, { securityURL: 'https://evil.example/captcha' }],
      [20276, { securityURL: 'https://t.captcha.qq.com/x' }],
      [100001, {}],
      [0, {}],
    ];
    h().fetch.on(ENDPOINTS.cgi, () => {
      const [code, data] = results.shift()!;
      return json({ code: 0, req_0: { code, data } });
    });
    const send = () => h().api('POST', '/api/admin/music-login/phone/send', { phone: '13800138000', country_code: '86' });
    expect((await send()).body.data).toEqual({ state: 'captcha', url: '', cooldown: 60 });
    expect((await send()).body.data).toEqual({ state: 'captcha', url: 'https://t.captcha.qq.com/x', cooldown: 60 });
    expect((await send()).body.data.state).toBe('frequency');
    expect((await send()).body.data.state).toBe('sent');
    const calls = h().fetch.calls.length;
    expect((await send()).body.data.state).toBe('frequency'); // 60 秒内不再发送
    expect(h().fetch.calls.length).toBe(calls);
    const body = JSON.parse(h().fetch.calls[0].body);
    expect(body.req_0).toMatchObject({ method: 'SendPhoneAuthCode', param: { phoneNo: '13800138000', areaCode: '86' } });
    expect((await h().api('POST', '/api/admin/music-login/phone/send', { phone: 'abc' })).body.msg).toBe('手机号格式不正确');
  });

  it('验证码登录成功后可以加入账号池(替换占位账号，同一个 uin 会被更新)', async () => {
    await h().loginAdmin();
    await prepareDevice();
    cgiRoute({ 'music.login.LoginServer.Login': [0, { ...LOGIN_DATA, musickey: 'PHONEKEY', loginType: 0 }] });
    expect((await h().api('POST', '/api/admin/music-login/phone/verify', { phone: '13800138000', code: '12' })).body.msg).toBe('验证码格式不正确');
    const ls = (await h().api('POST', '/api/admin/music-login/phone/verify', { phone: '13800138000', code: '123456' })).body.data;
    expect(ls).toMatchObject({ kind: 'phone', state: 'done', account: { uin: '123456' } });
    const note = (await h().api('POST', `/api/admin/music-login/${ls.id}/apply`, { target: 'pool', enable_refresh: false })).body.data.note;
    expect(note).toBe('已加入 cookie 池 (module.cookiepool.tx，共 1 个账号)；当前没有启用 cookie 池，需要把 common.cookiepool 设为 true 才会使用');
    let pool = (await h().config()).get('module.cookiepool.tx');
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ qqmusic_key: 'PHONEKEY', uin: '123456', login_type: '0', refresh_login: { enable: false } });
    const again = (await h().api('POST', '/api/admin/music-login/phone/verify', { phone: '13800138000', code: '123456' })).body.data;
    await h().api('POST', `/api/admin/music-login/${again.id}/apply`, { target: 'pool', enable_refresh: true });
    pool = (await h().config()).get('module.cookiepool.tx');
    expect(pool).toHaveLength(1);
    expect(pool[0].refresh_login.enable).toBe(true);
    expect((await h().api('POST', `/api/admin/music-login/${again.id}/apply`, { target: 'pool' })).status).toBe(400);
  });

  it('登录失败的原因', async () => {
    await h().loginAdmin();
    await prepareDevice();
    cgiRoute({ 'music.login.LoginServer.Login': [20271, {}] });
    expect((await h().api('POST', '/api/admin/music-login/phone/verify', { phone: '13800138000', code: '123456' })).body.msg).toBe('验证码错误');
  });
});

function eapiPath(call: FetchCall): [string, any] {
  const form = new URLSearchParams(call.body);
  const text = utf8Decode(aesEcbDecrypt(hexToBytes(form.get('params')!), 'e82ckenh8dichen8'));
  const [path, body] = text.split('-36cd479b6b5-');
  return [path, JSON.parse(body)];
}

describe('网易云扫码登录', () => {
  function netease(states: Response[], account = json({ code: 200, account: { id: 42 }, profile: { userId: 42, nickname: 'Neo' } })) {
    h().fetch.on('https://interface.music.163.com/eapi/', (call) => {
      const [path] = eapiPath(call);
      if (path === '/api/login/qrcode/unikey') return json({ code: 200, unikey: 'UNIKEY-1' });
      if (path === '/api/login/qrcode/client/login') return (states.length > 1 ? states.shift()! : states[0]).clone();
      if (path === '/api/nuser/account/get') return account.clone();
      return json({ code: 404 });
    });
  }

  it('完整流程：扫码人的昵称、Set-Cookie 里的凭证、保存为主账号', async () => {
    await h().loginAdmin();
    netease([
      json({ code: 801 }),
      json({ code: 802, nickname: 'Scanner' }),
      json({ code: 803 }, { headers: [['Set-Cookie', 'MUSIC_U=NEW_U; Max-Age=15552000; Path=/'], ['Set-Cookie', '__csrf=CSRF1; Path=/'], ['Set-Cookie', 'MUSIC_SNS=; Max-Age=0; Path=/']] as any }),
    ]);
    const started = (await h().api('POST', '/api/admin/music-login/qr', { kind: 'wy' })).body.data;
    expect(started.image).toMatch(/^data:image\/svg\+xml;base64,/);
    expect((await poll(started.id)).state).toBe('scan');
    expect(await poll(started.id)).toMatchObject({ state: 'conf', message: 'Scanner' });
    const done = await poll(started.id);
    expect(done).toMatchObject({ state: 'done', account: { uin: '42', nick: 'Neo', has_refresh: true } });
    expect(JSON.stringify(done)).not.toContain('NEW_U');
    // 整个登录用同一台“设备”
    const devices = new Set(h().fetch.calls.map((call) => eapiPath(call)[1].header.deviceId));
    expect(devices.size).toBe(1);
    const applied = await h().api('POST', `/api/admin/music-login/${started.id}/apply`, { target: 'main', enable_refresh: true });
    expect(applied.body.data.note).toBe('已保存为主账号 (module.wy.user)');
    const config = await h().config();
    const cookie = config.get('module.wy.user.cookie');
    expect(cookie).toMatch(/^MUSIC_U=NEW_U; __csrf=CSRF1; os=pc; /);
    expect(cookie).not.toContain('MUSIC_SNS');
    expect(cookie).toContain(`deviceId=${[...devices][0]}`);
    expect(config.get('module.wy.user.refresh_login.enable')).toBe(true);
  });

  it('二维码过期、风控、查不到账号', async () => {
    await h().loginAdmin();
    netease([json({ code: 800 })]);
    let id = (await h().api('POST', '/api/admin/music-login/qr', { kind: 'wy' })).body.data.id;
    expect((await poll(id)).state).toBe('timeout');
    h().fetch.routes = [];
    netease([json({ code: 8821, message: '需要行为验证码验证' })]);
    id = (await h().api('POST', '/api/admin/music-login/qr', { kind: 'wy' })).body.data.id;
    expect((await poll(id)).message).toContain('安全验证');
    h().fetch.routes = [];
    netease([json({ code: 803 }, { headers: { 'Set-Cookie': 'MUSIC_U=X; Path=/' } })], json({ code: 301 }));
    id = (await h().api('POST', '/api/admin/music-login/qr', { kind: 'wy' })).body.data.id;
    expect((await poll(id)).message).toBe('登录成功，但没能用新的凭证查到账号信息，请重试');
  });

  it('加入账号池时去掉占位账号，同一个账号会被更新', async () => {
    await h().loginAdmin();
    const run = async () => {
      h().fetch.routes = [];
      netease([json({ code: 803 }, { headers: { 'Set-Cookie': 'MUSIC_U=X; Path=/' } })]);
      const id = (await h().api('POST', '/api/admin/music-login/qr', { kind: 'wy' })).body.data.id;
      await poll(id);
      return (await h().api('POST', `/api/admin/music-login/${id}/apply`, { target: 'pool', enable_refresh: true })).body.data.note;
    };
    expect(await run()).toContain('共 1 个账号');
    expect(await run()).toContain('共 1 个账号');
    const pool = (await h().config()).get('module.cookiepool.wy');
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ uid: '42', refresh_login: { enable: true, interval: 86400 } });
  });

  it('二维码 SVG 是白底的', () => {
    const svg = qrSvg('https://music.163.com/login?codekey=abc');
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('fill="#ffffff"');
  });
});
