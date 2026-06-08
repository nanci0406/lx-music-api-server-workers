import { getUrl } from './url';
import { getLyric } from './lyric';
import { HttpClient } from '../../lib/http';
import type { TXConfig } from './types';
import type { URLResult, LyricResult, Quality } from '../../types/music';

export class TencentMusic {
  private http: HttpClient;
  private config: TXConfig;

  constructor(config: TXConfig, http: HttpClient) {
    this.config = config;
    this.http = http;
  }

  async getUrl(songId: string, quality: Quality): Promise<URLResult> {
    return getUrl(songId, quality, this.config, this.http);
  }

  async getLyric(songId: string): Promise<LyricResult> {
    return getLyric(songId, this.config, this.http);
  }
}

export function createTencentMusic(config: TXConfig, http: HttpClient): TencentMusic {
  return new TencentMusic(config, http);
}
