import { Hono } from 'hono';
import type { Env } from './types/env';
import type { MusicSource, Quality } from './types/music';
import { SOURCE_EXPIRATION_TIME } from './types/music';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { HttpClient } from './lib/http';
import { CacheManager } from './lib/cache';
import { DatabaseQueries } from './db/queries';
import { getSourceConfig } from './lib/config';
import { createLogger } from './lib/logger';
import { createKugouMusic } from './sources/kg';
import { createTencentMusic } from './sources/tx';
import { createNeteaseMusic } from './sources/wy';
import { createMiguMusic } from './sources/mg';
import { createKuwoMusic } from './sources/kw';

type Variables = {
  user?: any;
  admin?: any;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ==================== API 路由 ====================

// URL 获取
app.get(
  '/url/:source/:songId/:quality?',
  authMiddleware,
  rateLimitMiddleware,
  async (c) => {
    const { source, songId, quality = '320k' } = c.req.param();
    const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';
    const user = c.get('user');

    const logger = await createLogger(c.env);
    const cache = new CacheManager(c.env.KV);
    const db = new DatabaseQueries(c.env.DB);
    const http = new HttpClient(c.env.KV);

    logger.info(`URL 请求: source=${source}, songId=${songId}, quality=${quality}, user=${user?.name || 'anonymous'}, ip=${clientIP}`);

    try {
      // 检查缓存
      const cached = await cache.getUrl(source as MusicSource, songId, quality as Quality);
      if (cached) {
        logger.debug(`缓存命中: source=${source}, songId=${songId}`);
        const expireConfig = SOURCE_EXPIRATION_TIME[source as MusicSource];
        const expireTime = expireConfig.expire
          ? cached.time + Math.floor(expireConfig.time * 0.25)
          : null;

        await db.logParse({
          userId: user?.id,
          username: user?.name,
          source,
          method: 'url',
          songId,
          quality,
          success: true,
          clientIp: clientIP
        });

        return c.json({
          code: 0,
          msg: 'success',
          data: cached.url,
          extra: {
            cache: true,
            quality: {
              target: quality,
              result: cached.quality
            },
            expire: {
              time: expireTime,
              canExpire: expireConfig.expire
            }
          }
        });
      }

      // 调用音源适配器
      let result;
      switch (source) {
        case 'kg': {
          // 从数据库读取配置，环境变量作为备用
          const config = await getSourceConfig(c.env.DB, 'kg');
          const kg = createKugouMusic({
            token: config.token || c.env.KG_TOKEN || '',
            userid: config.userid || c.env.KG_USERID || '',
            mid: config.mid || c.env.KG_MID || ''
          }, http);
          result = await kg.getUrl(songId, quality as Quality);
          break;
        }
        case 'tx': {
          // 从数据库读取配置，环境变量作为备用
          const config = await getSourceConfig(c.env.DB, 'tx');
          const tx = createTencentMusic({
            uin: config.uin || c.env.TX_UIN || '',
            key: config.qm_keyst || c.env.TX_KEY || ''
          }, http);
          result = await tx.getUrl(songId, quality as Quality);
          break;
        }
        case 'wy': {
          // 从数据库读取配置，环境变量作为备用
          const config = await getSourceConfig(c.env.DB, 'wy');
          const wy = createNeteaseMusic({
            cookie: config.cookie || c.env.WY_COOKIE || ''
          }, http);
          result = await wy.getUrl(songId, quality as Quality);
          break;
        }
        case 'mg': {
          // 从数据库读取配置，环境变量作为备用
          const config = await getSourceConfig(c.env.DB, 'mg');
          const mg = createMiguMusic({
            by: config.by || c.env.MG_BY || '',
            session: config.session || c.env.MG_SESSION || '',
            useragent: config.useragent || c.env.MG_USERAGENT
          }, http);
          result = await mg.getUrl(songId, quality as Quality);
          break;
        }
        case 'kw': {
          // 从数据库读取配置，环境变量作为备用
          const config = await getSourceConfig(c.env.DB, 'kw');
          const kw = createKuwoMusic({
            uid: config.uid || c.env.KW_UID || '',
            token: config.token || c.env.KW_TOKEN || '',
            device_id: config.device_id || c.env.KW_DEVICE_ID || ''
          }, http);
          result = await kw.getUrl(songId, quality as Quality);
          break;
        }
        default:
          throw new Error('未知的音源');
      }

      // 存入缓存
      await cache.setUrl(source as MusicSource, songId, quality as Quality, result);

      // 记录日志
      await db.logParse({
        userId: user?.id,
        username: user?.name,
        source,
        method: 'url',
        songId,
        quality,
        success: true,
        clientIp: clientIP
      });

      const expireConfig = SOURCE_EXPIRATION_TIME[source as MusicSource];
      const expireTime = expireConfig.expire
        ? Math.floor(Date.now() / 1000) + expireConfig.time
        : null;

      return c.json({
        code: 0,
        msg: 'success',
        data: result.url,
        extra: {
          cache: false,
          quality: {
            target: quality,
            result: result.quality
          },
          expire: {
            time: expireTime,
            canExpire: expireConfig.expire
          }
        }
      });

    } catch (error: any) {
      // 详细错误日志
      console.error('❌ Error in /url endpoint:', {
        source,
        songId,
        quality,
        error: error.message,
        stack: error.stack
      });

      await db.logParse({
        userId: user?.id,
        username: user?.name,
        source,
        method: 'url',
        songId: songId,
        quality: quality,
        success: false,
        errorMessage: error.message,
        clientIp: clientIP
      });

      return c.json({
        code: 2,
        msg: error.message || '获取失败',
        data: null
      }, 500);
    }
  }
);

// 歌词获取
app.get(
  '/lyric/:source/:songId',
  authMiddleware,
  rateLimitMiddleware,
  async (c) => {
    const { source, songId } = c.req.param();
    const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';
    const user = c.get('user');

    const cache = new CacheManager(c.env.KV);
    const db = new DatabaseQueries(c.env.DB);
    const http = new HttpClient(c.env.KV);

    try {
      // 检查缓存
      const cached = await cache.getLyric(source as MusicSource, songId);
      if (cached) {
        return c.json({
          code: 0,
          msg: 'success',
          data: cached
        });
      }

      // 调用音源适配器
      let result;
      switch (source) {
        case 'kg': {
          const kg = createKugouMusic({
            token: c.env.KG_TOKEN || '',
            userid: c.env.KG_USERID || '',
            mid: c.env.KG_MID || ''
          }, http);
          result = await kg.getLyric(songId);
          break;
        }
        case 'tx': {
          const tx = createTencentMusic({
            uin: c.env.TX_UIN || '',
            key: c.env.TX_KEY || ''
          }, http);
          result = await tx.getLyric(songId);
          break;
        }
        default:
          throw new Error('该音源不支持歌词功能');
      }

      // 存入缓存
      await cache.setLyric(source as MusicSource, songId, result);

      // 记录日志
      await db.logParse({
        userId: user?.id,
        username: user?.name,
        source,
        method: 'lyric',
        songId,
        success: true,
        clientIp: clientIP
      });

      return c.json({
        code: 0,
        msg: 'success',
        data: result
      });

    } catch (error: any) {
      // 详细错误日志
      console.error('❌ Error in /url endpoint:', {
        source,
        songId,
        quality,
        error: error.message,
        stack: error.stack
      });

      await db.logParse({
        userId: user?.id,
        username: user?.name,
        source,
        method: 'lyric',
        songId,
        success: false,
        errorMessage: error.message,
        clientIp: clientIP
      });

      return c.json({
        code: 2,
        msg: error.message || '获取失败',
        data: null
      }, 500);
    }
  }
);

// 搜索
app.get(
  '/search/:source',
  authMiddleware,
  rateLimitMiddleware,
  async (c) => {
    const { source } = c.req.param();
    const keyword = c.req.query('keyword') || '';
    const page = parseInt(c.req.query('page') || '1');
    const pageSize = parseInt(c.req.query('pagesize') || '30');
    const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';
    const user = c.get('user');

    if (!keyword) {
      return c.json({
        code: 2,
        msg: '缺少搜索关键词',
        data: null
      }, 400);
    }

    const http = new HttpClient(c.env.KV);
    const db = new DatabaseQueries(c.env.DB);

    try {
      let result;
      switch (source) {
        case 'kg': {
          const kg = createKugouMusic({
            token: c.env.KG_TOKEN || '',
            userid: c.env.KG_USERID || '',
            mid: c.env.KG_MID || ''
          }, http);
          result = await kg.search(keyword, page, pageSize);
          break;
        }
        default:
          throw new Error('该音源不支持搜索功能');
      }

      await db.logParse({
        userId: user?.id,
        username: user?.name,
        source,
        method: 'search',
        success: true,
        clientIp: clientIP
      });

      return c.json({
        code: 0,
        msg: 'success',
        data: result
      });

    } catch (error: any) {
      // 详细错误日志
      console.error('❌ Error in /url endpoint:', {
        source,
        songId,
        quality,
        error: error.message,
        stack: error.stack
      });

      await db.logParse({
        userId: user?.id,
        username: user?.name,
        source,
        method: 'search',
        success: false,
        errorMessage: error.message,
        clientIp: clientIP
      });

      return c.json({
        code: 2,
        msg: error.message || '搜索失败',
        data: null
      }, 500);
    }
  }
);

export default app;
