import { getUrl } from './url';
import { HttpClient } from '../../lib/http';
import type { KWConfig } from './types';
import type { URLResult, Quality } from '../../types/music';

export class KuwoMusic {
  private http: HttpClient;
  private config: KWConfig;

  constructor(config: KWConfig, http: HttpClient) {
    this.config = config;
    this.http = http;
  }

  async getUrl(songId: string, quality: Quality): Promise<URLResult> {
    return getUrl(songId, quality, this.config, this.http);
  }
}

export function createKuwoMusic(config: KWConfig, http: HttpClient): KuwoMusic {
  return new KuwoMusic(config, http);
}
