import { describe, expect, it } from 'vitest';
import { aesEcbDecrypt, hexToBytes, utf8Decode } from '../src/lib/crypto';
import * as kgRefresh from '../src/sources/kg/refresh-login';
import * as txRefresh from '../src/sources/tx/refresh-login';
import { mergeCookies, parseSetCookie } from '../src/sources/wy/refresh-login';
import * as wyRefresh from '../src/sources/wy/refresh-login';
import { json, useHarness, type FetchCall } from './helpers/harness';

const h = useHarness();
const FUTURE = 'Expires=Fri, 01-Jan-2100 00:00:00 GMT';
const PAST = 'Expires=Thu, 01-Jan-1970 00:00:00 GMT';

function eapiParams(call: FetchCall): [string, any] {
  const form = new URLSearchParams(call.body);
  const text = utf8Decode(aesEcbDecrypt(hexToBytes(form.get('params')!), 'e82ckenh8dichen8'));
  const [path, body] = text.split('-36cd479b6b5-');
  return [path, JSON.parse(body)];
}

describe('QQ 音乐刷新登录', () => {
  it('优先按 login_type 选择请求，其次按 key 前缀，否则走通用接口', () => {
    const wx = txRefresh.buildRequest({ qqmusic_key: 'Q_H_L_x', uin: '1', login_type: '1', openid: 'O', refresh_token: 'R', unionid: 'U', refresh_key: 'K' })!;
    expect(wx[0]).toBe(txRefresh.WX_LOGIN_URL);
    expect(wx[1].req1.param).toMatchObject({ openid: 'O', refresh_token: 'R', unionid: 'U', refresh_key: 'K', str_musicid: '1', musickey: 'Q_H_L_x' });
    const qq = txRefresh.buildRequest({ qqmusic_key: 'W_X_x', uin: '123', login_type: '2', access_token: 'A' })!;
    expect(qq[0]).toBe(txRefresh.QQ_LOGIN_URL);
    expect(qq[1].req1.param).toEqual({ expired_in: 7776000, musicid: 123, musickey: 'W_X_x', access_token: 'A' });
    expect(txRefresh.buildRequest({ qqmusic_key: 'W_X_abc', uin: '9' })![1].req1.module).toBe('music.login.LoginServer');
    expect(txRefresh.buildRequest({ qqmusic_key: 'Q_H_L_abc', uin: '9' })![0]).toBe(txRefresh.QQ_LOGIN_URL);
    const generic = txRefresh.buildRequest({ qqmusic_key: 'other', uin: '77' })!;
    expect(generic[1].comm.tmeLoginType).toBe('0');
    expect(generic[1].req1.param.musicid).toBe(77);
    expect(txRefresh.buildRequest({ qqmusic_key: '', uin: '1' })).toBeNull();
    expect(txRefresh.buildRequest({ qqmusic_key: 'Q_H_L_x', uin: 'abc' })).toBeNull();
    expect(txRefresh.buildRequest({ qqmusic_key: 'other', uin: '' })).toBeNull();
  });

  it('日志里的敏感字段会被打码', () => {
    expect(txRefresh.mask({ req1: { data: { musickey: 'Q_H_L_SECRET', nick: 'n', list: [{ token: 'abcdef' }] } } }))
      .toEqual({ req1: { data: { musickey: 'Q_H_*' + '**', nick: 'n', list: [{ token: 'abcd***' }] } } });
  });

  it('成功后写回所有返回的凭证，下一次刷新使用新凭证', async () => {
    await h().writeConfig({
      'module.tx.user': { qqmusic_key: 'Q_H_L_OLD', uin: '123', refresh_key: 'RK1', refresh_token: 'RT1', login_type: '2', refresh_login: { enable: true, interval: 86000 } },
    });
    h().fetch.on(txRefresh.QQ_LOGIN_URL, json({ req1: { code: 0, data: { musickey: 'Q_H_L_NEW', musicid: 123, refresh_key: 'RK2', refresh_token: '', access_token: 'AT2' } } }));
    expect(await txRefresh.refresh(await h().context())).toBeUndefined();
    const user = (await h().config()).get('module.tx.user');
    expect(user).toMatchObject({ qqmusic_key: 'Q_H_L_NEW', uin: '123', refresh_key: 'RK2', refresh_token: 'RT1', access_token: 'AT2' });
    await txRefresh.refresh(await h().context());
    const body = JSON.parse(h().fetch.calls[1].body);
    expect(body.req1.param).toMatchObject({ musickey: 'Q_H_L_NEW', refresh_key: 'RK2', access_token: 'AT2' });
    expect(h().fetch.calls[1].url).toMatch(/\?sign=zzb/);
  });

  it('失败时返回 false 且不改配置；没有新 key 也算失败；未开启时跳过', async () => {
    await h().writeConfig({ 'module.tx.user': { qqmusic_key: 'Q_H_L_OLD', uin: '123', refresh_login: { enable: true } } });
    h().fetch.on(txRefresh.QQ_LOGIN_URL, json({ req1: { code: 1000 } }));
    expect(await txRefresh.refresh(await h().context())).toBe(false);
    h().fetch.routes = [];
    h().fetch.on(txRefresh.QQ_LOGIN_URL, json({ req1: { code: 0, data: {} } }));
    expect(await txRefresh.refresh(await h().context())).toBe(false);
    expect((await h().config()).get('module.tx.user.qqmusic_key')).toBe('Q_H_L_OLD');
    await h().writeConfig({ 'module.tx.user.refresh_login.enable': false });
    const calls = h().fetch.calls.length;
    expect(await txRefresh.refresh(await h().context())).toBeUndefined();
    expect(h().fetch.calls.length).toBe(calls);
  });

  it('刷新期间 key 被修改时丢弃结果', async () => {
    await h().writeConfig({ 'module.tx.user': { qqmusic_key: 'Q_H_L_OLD', uin: '123', refresh_login: { enable: true } } });
    h().fetch.on(txRefresh.QQ_LOGIN_URL, async () => {
      await h().writeConfig({ 'module.tx.user.qqmusic_key': 'Q_H_L_MANUAL' });
      return json({ req1: { code: 0, data: { musickey: 'Q_H_L_NEW' } } });
    });
    await txRefresh.refresh(await h().context());
    expect((await h().config()).get('module.tx.user.qqmusic_key')).toBe('Q_H_L_MANUAL');
  });

  it('账号池只更新对应的账号；索引不存在时失败', async () => {
    await h().writeConfig({
      'common.cookiepool': true,
      'module.cookiepool.tx': [{ qqmusic_key: 'Q_H_L_A', uin: '1' }, { qqmusic_key: 'Q_H_L_B', uin: '2' }],
    });
    h().fetch.on(txRefresh.QQ_LOGIN_URL, json({ req1: { code: 0, data: { musickey: 'Q_H_L_B2', refresh_key: 'R' } } }));
    await txRefresh.refreshPool(await h().context(), 1);
    expect((await h().config()).get('module.cookiepool.tx')).toEqual([
      { qqmusic_key: 'Q_H_L_A', uin: '1' }, { qqmusic_key: 'Q_H_L_B2', uin: '2', refresh_key: 'R' },
    ]);
    expect(await txRefresh.refreshPool(await h().context(), 5)).toBe(false);
  });
});

describe('网易云刷新登录', () => {
  it('解析 Set-Cookie：忽略已删除、为空、已过期的 Cookie', () => {
    expect(parseSetCookie([
      `MUSIC_U=0034abc==;Version=1;Max-Age=15552000;${FUTURE};Path=/;HTTPOnly`,
      `__csrf=csrf123; Max-Age=1296010; ${FUTURE}; Path=/`,
      'NMTID=00O; Path=/',
    ])).toEqual({ MUSIC_U: '0034abc==', __csrf: 'csrf123', NMTID: '00O' });
    expect(parseSetCookie([
      `MUSIC_SNS=; Max-Age=0; ${PAST}; Path=/`, 'MUSIC_R_T=zzz; Max-Age=0; Path=/', `MUSIC_A_T=old; ${PAST}; Path=/`,
      'EMPTY=; Path=/', 'garbage line without equals', '', `KEEP=1; ${FUTURE}`,
    ])).toEqual({ KEEP: '1' });
    expect(parseSetCookie(['A=1; Expires=Sun, 06 Nov 2095 08:49:37 GMT'])).toEqual({ A: '1' });
    expect(parseSetCookie(['A=1; Expires=Sun, 06 Nov 1994 08:49:37 GMT'])).toEqual({});
    expect(parseSetCookie(null)).toEqual({});
    expect(parseSetCookie(['A=1; Expires=not a date'])).toEqual({ A: '1' });
  });

  it('合并 Cookie 时保留其他字段和顺序', () => {
    expect(mergeCookies('os=pc; MUSIC_U=old; appver=2.10; __csrf=c1', { MUSIC_U: 'new', NMTID: 'x' }))
      .toBe('os=pc; MUSIC_U=new; appver=2.10; __csrf=c1; NMTID=x');
    expect(mergeCookies('a=b=c', {})).toBe('a=b=c');
  });

  it('新 Cookie 写回配置，下一次用新的 MUSIC_U；请求按 PC 客户端填写设备信息', async () => {
    await h().writeConfig({ 'module.wy.user.cookie': 'MUSIC_U=OLD; __csrf=c1; other=keep' });
    h().fetch.on('https://interface.music.163.com/eapi/login/token/refresh', json({ code: 200 }, {
      headers: { 'Set-Cookie': `MUSIC_U=NEW; Max-Age=15552000; ${FUTURE}; Path=/` },
    }));
    await wyRefresh.refresh(await h().context());
    expect((await h().config()).get('module.wy.user.cookie')).toBe('MUSIC_U=NEW; __csrf=c1; other=keep');
    await wyRefresh.refresh(await h().context());
    const [path, params] = eapiParams(h().fetch.calls[1]);
    expect(path).toBe('/api/login/token/refresh');
    expect(params.header).toMatchObject({ MUSIC_U: 'NEW', os: 'pc', __csrf: 'c1' });
    expect(params.header.deviceId).toMatch(/^[0-9A-F]{52}$/);
    expect(h().fetch.calls[1].headers.get('Cookie')).toContain('MUSIC_U=NEW');
  });

  it('301 提示需要重新登录；没有 MUSIC_U 时不发请求；没有新 Cookie 不改配置', async () => {
    await h().writeConfig({ 'module.wy.user.cookie': 'MUSIC_U=OLD' });
    h().fetch.on('https://interface.music.163.com/eapi/login/token/refresh', json({ code: 301 }));
    await expect(wyRefresh.refresh(await h().context())).rejects.toThrow('请重新登录');
    h().fetch.routes = [];
    h().fetch.on('https://interface.music.163.com/eapi/login/token/refresh', json({ code: '200' }));
    await wyRefresh.refresh(await h().context());
    expect((await h().config()).get('module.wy.user.cookie')).toBe('MUSIC_U=OLD');
    await h().writeConfig({ 'module.wy.user.cookie': 'os=pc' });
    const calls = h().fetch.calls.length;
    await expect(wyRefresh.refresh(await h().context())).rejects.toThrow('没有 MUSIC_U');
    expect(h().fetch.calls.length).toBe(calls);
  });

  it('账号池', async () => {
    await h().writeConfig({ 'common.cookiepool': true, 'module.cookiepool.wy': [{ cookie: 'MUSIC_U=A' }, { cookie: 'MUSIC_U=B; x=1' }] });
    h().fetch.on('https://interface.music.163.com/eapi/login/token/refresh', json({ code: 200 }, { headers: { 'Set-Cookie': 'MUSIC_U=B2; Path=/' } }));
    await wyRefresh.refreshPool(await h().context(), 1);
    expect((await h().config()).get('module.cookiepool.wy').map((a: any) => a.cookie)).toEqual(['MUSIC_U=A', 'MUSIC_U=B2; x=1']);
  });
});

describe('酷狗刷新登录', () => {
  it('成功后写回新的 userid 和 token；签名覆盖实际发送的请求体', async () => {
    await h().writeConfig({ 'module.kg.user': { token: 'OLD', userid: '42', mid: 'm1', refresh_login: { enable: true, login_url: 'http://login.user.kugou.com/v4/login_by_token' } } });
    h().fetch.on('http://login.user.kugou.com/v4/login_by_token', json({ error_code: 0, data: { userid: 43, token: 'NEW' } }));
    await kgRefresh.refresh(await h().context());
    expect((await h().config()).get('module.kg.user')).toMatchObject({ userid: '43', token: 'NEW' });
    const call = h().fetch.calls[0];
    const url = new URL(call.url);
    expect(url.searchParams.get('appid')).toBe('1005');
    const body = JSON.parse(call.body);
    expect(body).toMatchObject({ userid: '42', t1: 0, t2: 0 });
    expect(body.p3).toMatch(/^[0-9a-f]+$/);
    const { sign } = await import('../src/sources/kg/utils');
    const params = Object.fromEntries(url.searchParams);
    const { signature, ...rest } = params;
    expect(signature).toBe(sign(rest, call.body, 'OIlwieks28dk2k092lksi2UIkp'));
  });

  it('概念版使用自己的 AES 参数；不支持的 appid 和失败都返回 false', async () => {
    await h().writeConfig({ 'module.kg.user': { token: 'T', userid: '1', mid: 'm', refresh_login: { enable: true, login_url: 'http://kg.test/login' } } });
    h().fetch.on('http://kg.test/login', json({ error_code: 0, data: { userid: 1, token: 'T2' } }));
    await kgRefresh.refresh(await h().context());
    const normalP3 = JSON.parse(h().fetch.calls[0].body).p3;
    await h().writeConfig({ 'module.kg.client.appid': '3116', 'module.kg.user.token': 'T' });
    await kgRefresh.refresh(await h().context());
    expect(JSON.parse(h().fetch.calls[1].body).p3).not.toBe(normalP3);
    await h().writeConfig({ 'module.kg.client.appid': '1001' });
    expect(await kgRefresh.refresh(await h().context())).toBe(false);
    await h().writeConfig({ 'module.kg.client.appid': '1005' });
    h().fetch.routes = [];
    h().fetch.on('http://kg.test/login', json({ error_code: 20018 }));
    expect(await kgRefresh.refresh(await h().context())).toBe(false);
  });
});
