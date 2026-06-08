import { getUrl } from './url';
import { HttpClient } from '../../lib/http';
import type { WYConfig } from './types';
import type { URLResult, Quality } from '../../types/music';

export class NeteaseMusic {
  private http: HttpClient;
  private config: WYConfig;

  constructor(config: WYConfig, http: HttpClient) {
    this.config = config;
    this.http = http;
  }

  async getUrl(songId: string, quality: Quality): Promise<URLResult> {
    return getUrl(songId, quality, this.config, this.http);
  }
}

export function createNeteaseMusic(config: WYConfig, http: HttpClient): NeteaseMusic {
  return new NeteaseMusic(config, http);
}
