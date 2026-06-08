import { getUrl } from './url';
import { getLyric } from './lyric';
import { search } from './search';
import { HttpClient } from '../../lib/http';
import type { KGConfig } from './types';
import type { URLResult, LyricResult, SearchResult, Quality } from '../../types/music';

export class KugouMusic {
  private http: HttpClient;
  private config: KGConfig;

  constructor(config: KGConfig, http: HttpClient) {
    this.config = config;
    this.http = http;
  }

  async getUrl(songId: string, quality: Quality): Promise<URLResult> {
    return getUrl(songId, quality, this.config, this.http);
  }

  async getLyric(songId: string, songName: string = ''): Promise<LyricResult> {
    return getLyric(songId, songName, this.http);
  }

  async search(keyword: string, page: number = 1, pageSize: number = 30): Promise<SearchResult> {
    return search(keyword, page, pageSize, this.http);
  }
}

// 导出工厂函数
export function createKugouMusic(config: KGConfig, http: HttpClient): KugouMusic {
  return new KugouMusic(config, http);
}
