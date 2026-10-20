import { describe, expect, it } from 'vitest';
import { deflate, inflate, md5, utf8Decode, utf8Encode, bytesToHex } from '../src/lib/crypto';
import { pickAccount } from '../src/sources/common';
import { doAccountSignin } from '../src/sources/kg/lite-signin';
import { sign as kgSign } from '../src/sources/kg/utils';
import { pyJsonDumps } from '../src/routes/gcsp';
import { json, useHarness } from './helpers/harness';

const h = useHarness();
const KG_INFO = 'http://gateway.kugou.com/v3/album_audio/audio';
const TX_CGI = 'https://u.y.qq.com/cgi-bin/musics.fcg';

describe('酷狗', () => {
  it('播放链接：按音质取 hash、签名、自定义参数优先', async () => {
    await h().writeConfig({
      'module.kg.user': { token: 'TOK', userid: '42', mid: 'MID' },
      'module.kg.tracker.extra_params': { area_code: 2 },
    });
    h().fetch.on(KG_INFO, json({ data: [[{ audio_info: { hash_128: 'H128', hash_high: 'HHIGH' }, album_info: { album_id: 'A1' }, album_audio_id: 'AA1' }]] }));
    h().fetch.on('https://gateway.kugou.com/v5/url', json({ status: 1, url: ['http://kg/x.flac'] }));
    const ctx = await h().context();
    const { url } = await import('../src/sources/kg/player');
    expect(await url(ctx, 'ABCDEF', 'flac24bit')).toEqual({ url: 'http://kg/x.flac', quality: 'flac24bit' });
    const call = h().fetch.callsTo('https://gateway.kugou.com/v5/url')[0];
    const params = Object.fromEntries(new URL(call.url).searchParams);
    expect(params).toMatchObject({ hash: 'hhigh', quality: 'high', userid: '42', token: 'TOK', mid: 'MID', album_id: 'A1', album_audio_id: 'AA1', area_code: '2' });
    expect(params.key).toBe(md5('hhigh' + '57ae12eb6890223e355ccfcb74edf70d' + '1005' + 'MID' + '42'));
    const { signature, ...rest } = params;
    expect(signature).toBe(kgSign(rest, '', 'OIlwieks28dk2k092lksi2UIkp'));
    expect(call.headers.get('x-router')).toBe('tracker.kugou.com');
    // 歌曲信息用 hash 小写请求，并缓存起来
    expect(JSON.parse(h().fetch.callsTo(KG_INFO)[0].body).data).toEqual([{ hash: 'abcdef' }]);
    await url(ctx, 'abcdef', '128k').catch(() => null);
    expect(h().fetch.callsTo(KG_INFO)).toHaveLength(1);
  });

  it('播放链接失败的原因', async () => {
    h().fetch.on(KG_INFO, json({ data: [[{ audio_info: { hash_128: 'H' } }]] }));
    const statuses = [3, 2, 0];
    h().fetch.on('https://gateway.kugou.com/v5/url', () => json({ status: statuses.shift() }));
    const ctx = await h().context();
    const { url } = await import('../src/sources/kg/player');
    await expect(url(ctx, 'h', '128k')).rejects.toThrow('没有版权');
    await expect(url(ctx, 'h', '128k')).rejects.toThrow('会员');
    await expect(url(ctx, 'h', '128k')).rejects.toThrow('api失效');
    await expect(url(ctx, 'h', 'sky')).rejects.toThrow('不支持的音质');
  });

  it('概念版签到：自动选歌并签名请求体', async () => {
    h().fetch.on('http://mobilecdnbj.kugou.com/api/v3/rank/song', json({ status: 1, data: { info: [{ filename: '歌手 - 歌名' }] } }));
    h().fetch.on('https://songsearch.kugou.com/song_search_v2', json({ status: 1, data: { lists: [{ MixSongID: 777 }] } }));
    h().fetch.on('https://gateway.kugou.com/v2/report/listen_song', json({ status: 1 }));
    const ctx = await h().context();
    await doAccountSignin(ctx, { userid: '1', token: 'T', mid: 'M', lite_sign_in: { mixsongmid: { value: 'auto' } } });
    const call = h().fetch.callsTo('https://gateway.kugou.com/v2/report/listen_song')[0];
    expect(call.body).toBe('{"mixsongid":777}');
    expect(call.headers.get('x-router')).toBe('youth.kugou.com');
    const { signature, ...rest } = Object.fromEntries(new URL(call.url).searchParams);
    expect(rest.appid).toBe('3116');
    expect(signature).toBe(kgSign(rest, call.body, 'OIlwieks28dk2k092lksi2UIkp'));
    h().fetch.routes = [];
    h().fetch.on('https://gateway.kugou.com/v2/report/listen_song', json({ status: 0, error_msg: '已签到' }));
    await expect(doAccountSignin(ctx, { userid: '1', token: 'T', mid: 'M', lite_sign_in: { mixsongmid: { value: '123' } } })).rejects.toThrow('已签到');
  });
});

describe('QQ 音乐', () => {
  const info = { code: 0, req: { code: 0, data: { track_info: { id: 1, file: { media_mid: 'MEDIA' }, vs: ['', '', '', 'MASTER', 'DOLBY'] } } } };

  it('播放链接：按音质拼文件名、带上账号，返回实际音质', async () => {
    await h().writeConfig({ 'module.tx.user': { uin: '10001', qqmusic_key: 'Q_H_L_K' } });
    h().fetch.on((call) => call.url.startsWith(TX_CGI) && call.body.includes('get_song_detail_yqq'), json(info));
    h().fetch.on((call) => call.url.startsWith(TX_CGI) && call.body.includes('CgiGetVkey'),
      json({ req_0: { data: { midurlinfo: [{ purl: 'M800MEDIA.mp3?vkey=1', filename: 'M800MEDIA.mp3' }] } } }));
    const { url } = await import('../src/sources/tx/player');
    const result = await url(await h().context(), 'SONGMID', '320k');
    expect(result).toEqual({ url: 'http://ws.stream.qqmusic.qq.com/M800MEDIA.mp3?vkey=1', quality: '320k' });
    const vkey = JSON.parse(h().fetch.calls.find((c) => c.body.includes('CgiGetVkey'))!.body);
    expect(vkey.req_0.param).toMatchObject({ filename: ['M800MEDIA.mp3'], songmid: ['SONGMID'], uin: '10001', guid: '114514' });
    expect(vkey.comm).toMatchObject({ qq: '10001', authst: 'Q_H_L_K' });
  });

  it('第三方 vkey 接口：母带用 vs 里的 media_mid', async () => {
    await h().writeConfig({ 'module.tx.vkey_api': { use_vkey_api: true, vkey_api_url: 'https://vkey.test/api' } });
    h().fetch.on(TX_CGI, json(info));
    h().fetch.on('https://vkey.test/api', json({ data: [{ purl: 'AI00MASTER.flac?x' }] }));
    const { url } = await import('../src/sources/tx/player');
    expect(await url(await h().context(), 'SONGMID', 'master')).toEqual({ url: 'http://ws.stream.qqmusic.qq.com/AI00MASTER.flac?x', quality: 'master' });
    const query = new URL(h().fetch.callsTo('https://vkey.test/api')[0].url).searchParams;
    expect([query.get('filename'), query.get('src')]).toEqual(['AI00MASTER.flac', 'AI00SONGMID.flac']);
  });
});

describe('账号池', () => {
  it('单账号模式用 user；账号池模式随机选，优先选填写了凭证的账号', async () => {
    await h().writeConfig({ 'module.tx.user.uin': 'main' });
    expect(pickAccount(await h().context(), 'tx').uin).toBe('main');
    await h().writeConfig({ 'common.cookiepool': true, 'module.cookiepool.tx': [{ uin: 'empty', qqmusic_key: '' }, { uin: 'a', qqmusic_key: 'k' }] });
    const ctx = await h().context();
    for (let i = 0; i < 10; i++) expect(pickAccount(ctx, 'tx').uin).toBe('a');
    await h().writeConfig({ 'module.cookiepool.wy': [] });
    expect(pickAccount(await h().context(), 'wy')).toEqual({});
  });
});

describe('歌词适配后端(gcsp)', () => {
  it('请求体解压、校验签名、返回压缩的结果', async () => {
    await h().writeConfig({ 'module.gcsp': { enable: true, path: '/client/api', enable_verify: true, package_md5: 'PKG', salt_1: 'S1', salt_2: 'S2' } });
    h().fetch.on('https://interface.music.163.com/', json({ data: [{ url: 'http://m/gcsp.mp3', level: 'exhigh' }] }));
    const time = String(Math.floor(Date.now() / 1000));
    const text1 = JSON.stringify({ platform: 'wyy', t1: '123', t2: 'hq' });
    const text2 = '附加/信息';
    const sign1 = md5('PKG' + time + 'S2');
    const sign2 = md5((pyJsonDumps(text1) + pyJsonDumps(text2) + sign1 + time + 'S1').replace(/\\/g, '').replace(/}"/g, '}').replace(/"\{/g, '{'));
    const pack = (data: unknown) => deflate(utf8Encode(bytesToHex(utf8Encode(JSON.stringify(data)))));
    const send = async (data: unknown) => {
      const response = await h().request('POST', '/client/api', { body: pack(data) as any });
      return JSON.parse(utf8Decode(inflate(new Uint8Array(await response.arrayBuffer()))));
    };
    expect(await send({ time, text_1: text1, text_2: text2, sign_1: sign1, sign_2: sign2 })).toEqual({ code: '200', error_msg: 'success', data: 'http://m/gcsp.mp3' });
    expect((await send({ time, text_1: text1, text_2: text2, sign_1: sign1, sign_2: 'bad' })).code).toBe('403');
    expect((await h().request('GET', '/client/api')).status).toBe(405);
  });
});

describe('酷狗客户端参数', () => {
  it('appid 为 3116 时自动使用概念版的签名参数，自己填写的值照原样使用', async () => {
    const { kgTools } = await import('../src/sources/kg/utils');
    expect(kgTools(await h().context())).toMatchObject({ appid: '1005', signkey: 'OIlwieks28dk2k092lksi2UIkp', pid: '2' });
    await h().writeConfig({ 'module.kg.client.appid': '3116' });
    expect(kgTools(await h().context())).toMatchObject({
      appid: '3116', signkey: 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA', pidversec: '185672dd44712f60bb1736df5a377e82', pid: '411',
    });
    await h().writeConfig({ 'module.kg.client.signatureKey': 'CUSTOM', 'module.kg.client.pid': '' });
    expect(kgTools(await h().context())).toMatchObject({ signkey: 'CUSTOM', pid: '411' });
  });

  it('概念版取链接和刷新登录都用概念版的签名', async () => {
    await h().writeConfig({
      'module.kg.client.appid': '3116',
      'module.kg.user': { token: 'T', userid: '42', mid: 'M', refresh_login: { enable: true, login_url: 'http://kg.test/login' } },
    });
    h().fetch.on(KG_INFO, json({ data: [[{ audio_info: { hash_128: 'H' } }]] }));
    h().fetch.on('https://gateway.kugou.com/v5/url', json({ status: 1, url: ['http://kg/lite.mp3'] }));
    h().fetch.on('http://kg.test/login', json({ status: 1, data: { userid: 42, token: 'T2' } }));
    const ctx = await h().context();
    const { url } = await import('../src/sources/kg/player');
    await url(ctx, 'h', '128k');
    const { refresh } = await import('../src/sources/kg/refresh-login');
    await refresh(ctx);
    const urlCall = h().fetch.callsTo('https://gateway.kugou.com/v5/url')[0];
    const urlParams = Object.fromEntries(new URL(urlCall.url).searchParams);
    expect(urlParams).toMatchObject({ appid: '3116', pid: '411', key: md5('h' + '185672dd44712f60bb1736df5a377e82' + '3116' + 'M' + '42') });
    const { signature: urlSignature, ...urlRest } = urlParams;
    expect(urlSignature).toBe(kgSign(urlRest, '', 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA'));
    const loginCall = h().fetch.callsTo('http://kg.test/login')[0];
    const { signature, ...rest } = Object.fromEntries(new URL(loginCall.url).searchParams);
    expect(signature).toBe(kgSign(rest, loginCall.body, 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA'));
  });

  it('错误码说明原因：需要验证、签名错误、token 失效', async () => {
    h().fetch.on(KG_INFO, json({ data: [[{ audio_info: { hash_128: 'H' } }]] }));
    const answers = [{ errcode: 20028, status: 2, error: '本次请求需要验证' }, { errcode: '20006', status: 0, errmsg: 'err signature' }];
    h().fetch.on('https://gateway.kugou.com/v5/url', () => json(answers.shift()));
    const ctx = await h().context();
    const { url } = await import('../src/sources/kg/player');
    await expect(url(ctx, 'h', '128k')).rejects.toThrow('链接获取失败(20028)：酷狗要求验证这次请求');
    await expect(url(ctx, 'h', '128k')).rejects.toThrow('链接获取失败(20006)：签名错误');
    await h().writeConfig({ 'module.kg.user': { token: 'T', userid: '1', refresh_login: { enable: true, login_url: 'http://kg.test/login' } } });
    h().fetch.on('http://kg.test/login', json({ error_code: 20017, data: null }));
    const { refresh } = await import('../src/sources/kg/refresh-login');
    await expect(refresh(await h().context())).rejects.toThrow('刷新登录失败(code: 20017；appid 1005，签名 key OIlwie…，接口 kg.test/login)：token 无效或已过期');
  });
});

describe('旧的默认值', () => {
  it('已保存的旧伪装 IP(1.0.1.114)按新的默认值处理，自己改过的值不变', async () => {
    await h().writeConfig({ 'common.fakeip': '1.0.1.114' });
    expect((await h().config()).get('common.fakeip')).toBe('116.25.146.177');
    await h().writeConfig({ 'common.fakeip': '220.181.1.1' });
    expect((await h().config()).get('common.fakeip')).toBe('220.181.1.1');
  });
});
