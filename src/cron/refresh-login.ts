// 刷新登录和自动签到

import type { Env } from '../types/env';
import { createLogger } from '../lib/logger';
import { DatabaseQueries } from '../db/queries';

// 更新数据库配置
export async function updateSourceConfig(
  db: any,
  source: string,
  configs: Record<string, string>
): Promise<void> {
  for (const [key, value] of Object.entries(configs)) {
    await db
      .prepare(`
        INSERT INTO source_configs (source, config_key, config_value, enabled, updated_at)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(source, config_key)
        DO UPDATE SET config_value = ?, updated_at = ?
      `)
      .bind(source, key, value, Math.floor(Date.now() / 1000), value, Math.floor(Date.now() / 1000))
      .run();
  }
}

// 酷狗音乐自动签到
export async function signInKugou(env: Env): Promise<void> {
  const logger = await createLogger(env);
  const db = new DatabaseQueries(env.DB);

  logger.info('[Cron] 开始执行酷狗音乐自动签到...');

  try {
    // 从数据库读取配置
    const result = await env.DB
      .prepare(`
        SELECT config_key, config_value
        FROM source_configs
        WHERE source = 'kg' AND enabled = 1
      `)
      .all();

    const config: Record<string, string> = {};
    for (const row of result.results) {
      config[row.config_key as string] = row.config_value as string;
    }

    const userid = config.userid;
    const token = config.token;
    const mid = config.mid;

    if (!userid || !token || !mid) {
      logger.warn('[Cron] 酷狗音乐配置不完整，跳过签到');
      return;
    }

    // 使用固定的 mixsongid
    const mixsongid = 699188464;

    // 生成随机 UUID
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const uuid = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // 请求参数
    const params = {
      userid: userid,
      token: token,
      appid: '3116',
      clientver: '12080',
      clienttime: Math.floor(Date.now() / 1000).toString(),
      mid: mid,
      uuid: uuid,
      dfid: '-'
    };

    // 请求体
    const body = JSON.stringify({ mixsongid: mixsongid });

    // 导入签名函数
    const { sign } = await import('../sources/kg/encrypt');

    // 签名
    const signature = sign(params, body, 'OIlwieks28dk2k092lksi2UIkp');

    // 构建 URL
    const queryString = Object.entries({ ...params, signature })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    const signInUrl = `https://gateway.kugou.com/v2/report/listen_song?${queryString}`;

    // 请求头
    const headers = {
      'User-Agent': 'Android712-AndroidPhone-12080-18-0-NetMusic-wifi',
      'KG-THash': '3e5ec6b',
      'KG-Rec': '1',
      'KG-RC': '1',
      'x-router': 'youth.kugou.com',
      'Content-Type': 'application/json'
    };

    // 发送请求
    const response = await fetch(signInUrl, {
      method: 'POST',
      headers: headers,
      body: body
    });

    const responseBody = await response.json() as any;

    if (responseBody.status !== 1) {
      logger.warn(`[Cron] 酷狗音乐签到失败: ${responseBody.error_msg || '未知错误'}`);
      return;
    }

    logger.info(`[Cron] 酷狗音乐账号(UID_${userid})签到成功`);
  } catch (error) {
    logger.error('[Cron] 酷狗音乐签到失败', error);
    throw error;
  }
}

// 酷狗音乐刷新登录
export async function refreshKugou(env: Env): Promise<void> {
  const logger = await createLogger(env);
  const db = new DatabaseQueries(env.DB);

  logger.info('[Cron] 开始执行酷狗音乐刷新登录...');

  try {
    // 从数据库读取配置
    const result = await env.DB
      .prepare(`
        SELECT config_key, config_value
        FROM source_configs
        WHERE source = 'kg' AND enabled = 1
      `)
      .all();

    const config: Record<string, string> = {};
    for (const row of result.results) {
      config[row.config_key as string] = row.config_value as string;
    }

    const userid = config.userid;
    const token = config.token;
    const mid = config.mid;

    if (!userid || !token || !mid) {
      logger.warn('[Cron] 酷狗音乐配置不完整，跳过刷新');
      return;
    }

    // 概念版参数
    const ts = Date.now();
    const clienttime = Math.floor(ts / 1000);

    // 导入加密函数
    const { conceptAesEncrypt } = await import('../sources/kg/encrypt');
    const { sign } = await import('../sources/kg/encrypt');

    // 加密 p3 参数
    const p3Data = JSON.stringify({
      clienttime: clienttime,
      token: token
    });
    const p3 = conceptAesEncrypt(p3Data);

    // 请求体
    const data = {
      p3: p3,
      clienttime_ms: ts,
      t1: 0,
      t2: 0,
      userid: userid
    };

    // URL 参数
    const params = {
      dfid: '-',
      appid: '3116',
      mid: mid,
      clientver: '12080',
      clienttime: clienttime
    };

    // 签名
    const signature = sign(params, JSON.stringify(data), 'OIlwieks28dk2k092lksi2UIkp');

    // 构建 URL
    const queryString = Object.entries({ ...params, signature })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    const loginUrl = `https://gateway.kugou.com/iphonemac.service.ilogin/v1/extend_refresh_login?${queryString}`;

    // 请求头
    const headers = {
      'User-Agent': 'Android712-AndroidPhone-8983-18-0-NetMusic-wifi',
      'KG-THash': '3e5ec6b',
      'KG-Rec': '1',
      'KG-RC': '1',
      'Content-Type': 'application/json'
    };

    // 发送请求
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data)
    });

    // 检查响应状态
    if (!response.ok) {
      logger.warn(`[Cron] 酷狗音乐刷新登录 HTTP 错误: ${response.status} ${response.statusText}`);
      const text = await response.text();
      logger.warn(`[Cron] 响应内容: ${text.substring(0, 200)}`);
      return;
    }

    const body = await response.json() as any;

    if (body.error_code !== 0) {
      logger.warn(`[Cron] 酷狗音乐账号(UID_${userid})刷新登录失败, code: ${body.error_code}, 响应: ${JSON.stringify(body)}`);
      return;
    }

    // 更新数据库配置
    await updateSourceConfig(env.DB, 'kg', {
      userid: String(body.data.userid),
      token: body.data.token
    });

    logger.info(`[Cron] 酷狗音乐账号(UID_${userid})刷新登录成功，数据已更新`);
  } catch (error) {
    logger.error('[Cron] 酷狗音乐刷新登录失败', error);
    throw error;
  }
}

// QQ音乐刷新登录
export async function refreshTencent(env: Env): Promise<void> {
  const logger = await createLogger(env);
  const db = new DatabaseQueries(env.DB);

  logger.info('[Cron] 开始执行QQ音乐刷新登录...');

  try {
    // 从数据库读取配置
    const result = await env.DB
      .prepare(`
        SELECT config_key, config_value
        FROM source_configs
        WHERE source = 'tx' AND enabled = 1
      `)
      .all();

    const config: Record<string, string> = {};
    for (const row of result.results) {
      config[row.config_key as string] = row.config_value as string;
    }

    const uin = config.uin;
    const qm_keyst = config.qm_keyst;

    if (!uin || !qm_keyst) {
      logger.warn('[Cron] QQ音乐配置不完整，跳过刷新');
      return;
    }

    // 导入签名函数
    const { sign } = await import('../sources/tx/sign');

    let requestBody: any;
    let apiUrl: string;

    // 根据 key 的前缀判断登录类型
    if (qm_keyst.startsWith('W_X')) {
      // 微信登录
      requestBody = {
        comm: {
          fPersonality: '0',
          tmeLoginType: '1',
          tmeLoginMethod: '1',
          qq: '',
          authst: '',
          ct: '11',
          cv: '12080008',
          v: '12080008',
          tmeAppID: 'qqmusic'
        },
        req1: {
          module: 'music.login.LoginServer',
          method: 'Login',
          param: {
            code: '',
            openid: '',
            refresh_token: '',
            str_musicid: uin,
            musickey: qm_keyst,
            unionid: '',
            refresh_key: '',
            loginMode: 2
          }
        }
      };
      const signature = sign(JSON.stringify(requestBody));
      apiUrl = `https://u.y.qq.com/cgi-bin/musics.fcg?format=json&sign=${signature}`;
    } else if (qm_keyst.startsWith('Q_H_L')) {
      // QQ 登录
      requestBody = {
        req1: {
          module: 'QQConnectLogin.LoginServer',
          method: 'QQLogin',
          param: {
            expired_in: 7776000,
            musicid: parseInt(uin),
            musickey: qm_keyst
          }
        }
      };
      const signature = sign(JSON.stringify(requestBody));
      apiUrl = `https://u6.y.qq.com/cgi-bin/musics.fcg?sign=${signature}`;
    } else {
      logger.warn('[Cron] QQ音乐 key 格式不支持，跳过刷新');
      return;
    }

    // 发送请求
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://y.qq.com/'
      },
      body: JSON.stringify(requestBody)
    });

    const body = await response.json() as any;

    if (body.req1?.code !== 0) {
      logger.warn(`[Cron] QQ音乐刷新登录失败, code: ${body.req1?.code}, 响应: ${JSON.stringify(body)}`);
      return;
    }

    // 更新数据库配置
    await updateSourceConfig(env.DB, 'tx', {
      uin: String(body.req1.data.musicid),
      qm_keyst: body.req1.data.musickey
    });

    logger.info(`[Cron] QQ音乐刷新登录成功，数据已更新`);
  } catch (error) {
    logger.error('[Cron] QQ音乐刷新登录失败', error);
    throw error;
  }
}

// 网易云音乐刷新登录
export async function refreshNetease(env: Env): Promise<void> {
  const logger = await createLogger(env);
  const db = new DatabaseQueries(env.DB);

  logger.info('[Cron] 开始执行网易云音乐刷新登录...');

  try {
    // 从数据库读取配置
    const result = await env.DB
      .prepare(`
        SELECT config_key, config_value
        FROM source_configs
        WHERE source = 'wy' AND enabled = 1
      `)
      .all();

    const config: Record<string, string> = {};
    for (const row of result.results) {
      config[row.config_key as string] = row.config_value as string;
    }

    const cookie = config.cookie;

    if (!cookie) {
      logger.warn('[Cron] 网易云音乐配置不完整，跳过刷新');
      return;
    }

    // 解析 Cookie
    const cookieDict: Record<string, string> = {};
    for (const line of cookie.split(';')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        cookieDict[parts[0]] = parts.slice(1).join('=');
      }
    }

    // 构建请求头
    const ts = Date.now();
    const header = {
      osver: cookieDict.osver || '17.4.1',
      deviceId: cookieDict.deviceId || '',
      os: cookieDict.os || 'ios',
      appver: cookieDict.appver || (cookieDict.os !== 'pc' ? '9.0.65' : ''),
      versioncode: cookieDict.versioncode || '140',
      mobilename: cookieDict.mobilename || '',
      buildver: cookieDict.buildver || String(Math.floor(ts / 1000)),
      resolution: cookieDict.resolution || '1920x1080',
      __csrf: cookieDict.__csrf || '',
      channel: cookieDict.channel || '',
      requestId: `${String(ts).substring(0, 13)}_${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
    };

    if (cookieDict.MUSIC_U) {
      (header as any).MUSIC_U = cookieDict.MUSIC_U;
    }
    if (cookieDict.MUSIC_A) {
      (header as any).MUSIC_A = cookieDict.MUSIC_A;
    }

    // 构建 Cookie 字符串
    const cookieStr = Object.entries(header)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    // 导入加密函数
    const { eapiEncrypt } = await import('../sources/wy/encrypt');

    const path = '/api/login/token/refresh';
    const requestData = JSON.stringify({ header, e_r: false });
    const encrypted = eapiEncrypt(path, requestData);

    // 发送请求
    const response = await fetch('http://interface.music.163.com/eapi/login/token/refresh', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
        'Cookie': cookieStr,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(encrypted).toString()
    });

    const body = await response.json() as any;

    if (body.code !== 200) {
      logger.warn(`[Cron] 网易云音乐刷新登录失败, code: ${body.code}, 响应: ${JSON.stringify(body)}`);
      return;
    }

    logger.info('[Cron] 网易云音乐刷新登录成功');
    // 注意：网易云刷新登录不返回新的 cookie，原 cookie 自动续期
  } catch (error) {
    logger.error('[Cron] 网易云音乐刷新登录失败', error);
    throw error;
  }
}

// Cron 处理器
export async function handleScheduled(event: ScheduledEvent, env: Env): Promise<void> {
  const logger = await createLogger(env);
  const cron = event.cron;

  logger.info(`[Cron] 定时任务触发: ${cron}`);

  try {
    // 根据不同的 cron 表达式执行不同的任务
    // 7 0 * * *      - 每天 00:07 - 酷狗签到
    // 7 0 */7 * *    - 每7天 00:07 - 酷狗刷新登录
    // 13 0 */3 * *   - 每3天 00:13 - QQ音乐刷新登录
    // 19 0 */7 * *   - 每7天 00:19 - 网易云刷新登录

    switch (cron) {
      case '7 0 * * *':
        // 每天：酷狗签到
        await signInKugou(env);
        break;

      case '7 0 */7 * *':
        // 每7天：酷狗刷新登录
        await refreshKugou(env);
        break;

      case '13 0 */3 * *':
        // 每3天：QQ音乐刷新登录
        await refreshTencent(env);
        break;

      case '19 0 */7 * *':
        // 每7天：网易云刷新登录
        await refreshNetease(env);
        break;

      default:
        logger.warn(`[Cron] 未知的 cron 表达式: ${cron}`);
    }

    logger.info('[Cron] 定时任务执行完成');
  } catch (error) {
    logger.error('[Cron] 定时任务执行失败', error);
  }
}
