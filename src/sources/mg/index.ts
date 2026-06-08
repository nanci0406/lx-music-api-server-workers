import { getUrl } from './url';
import { HttpClient } from '../../lib/http';
import type { MGConfig } from './types';
import type { URLResult, Quality } from '../../types/music';

export class MiguMusic {
  private http: HttpClient;
  private config: MGConfig;

  constructor(config: MGConfig, http: HttpClient) {
    this.config = config;
    this.http = http;
  }

  async getUrl(songId: string, quality: Quality): Promise<URLResult> {
    return getUrl(songId, quality, this.config, this.http);
  }
}

export function createMiguMusic(config: MGConfig, http: HttpClient): MiguMusic {
  return new MiguMusic(config, http);
}
