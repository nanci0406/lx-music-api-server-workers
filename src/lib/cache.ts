import type { KVNamespace } from '@cloudflare/workers-types';
import type { MusicSource, Quality } from '../types/music';
import { SOURCE_EXPIRATION_TIME } from '../types/music';

export class CacheManager {
  constructor(private kv: KVNamespace) {}

  // ==================== URL 缓存 ====================

  async getUrl(source: MusicSource, songId: string, quality: Quality) {
    const key = `url:${source}:${songId}:${quality}`;
    const cached = await this.kv.get(key, 'json');
    if (!cached) return null;

    return cached as {
      url: string;
      quality: Quality;
      time: number;
      expire: boolean;
    };
  }

  async setUrl(
    source: MusicSource,
    songId: string,
    quality: Quality,
    data: { url: string; quality: Quality }
  ) {
    const key = `url:${source}:${songId}:${quality}`;
    const config = SOURCE_EXPIRATION_TIME[source];

    const cacheData = {
      ...data,
      time: Math.floor(Date.now() / 1000),
      expire: config.expire
    };

    const options: any = {};
    if (config.expire) {
      // 取有效期的75%作为缓存时长
      options.expirationTtl = Math.floor(config.time * 0.75);
    }

    await this.kv.put(key, JSON.stringify(cacheData), options);
  }

  // ==================== 歌词缓存 ====================

  async getLyric(source: MusicSource, songId: string) {
    const key = `lyric:${source}:${songId}`;
    return this.kv.get(key, 'json');
  }

  async setLyric(source: MusicSource, songId: string, data: any) {
    const key = `lyric:${source}:${songId}`;
    await this.kv.put(key, JSON.stringify(data), {
      expirationTtl: 259200 // 3天
    });
  }

  // ==================== HTTP 响应缓存 ====================

  async getHttpCache(cacheKey: string) {
    return this.kv.get(cacheKey, 'json');
  }

  async setHttpCache(cacheKey: string, data: any, ttl: number) {
    await this.kv.put(cacheKey, JSON.stringify(data), {
      expirationTtl: ttl
    });
  }

  // ==================== 限速记录 ====================

  async getRateLimitTime(key: string): Promise<number | null> {
    const value = await this.kv.get(key);
    return value ? parseInt(value) : null;
  }

  async setRateLimitTime(key: string, timestamp: number, ttl: number = 60) {
    await this.kv.put(key, timestamp.toString(), { expirationTtl: ttl });
  }

  // ==================== 会话存储 ====================

  async getSession(token: string) {
    const key = `session:${token}`;
    return this.kv.get(key, 'json');
  }

  async setSession(token: string, data: any, ttl: number = 86400) {
    const key = `session:${token}`;
    await this.kv.put(key, JSON.stringify(data), { expirationTtl: ttl });
  }

  async deleteSession(token: string) {
    const key = `session:${token}`;
    await this.kv.delete(key);
  }
}
