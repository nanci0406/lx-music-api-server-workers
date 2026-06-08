// 酷狗音乐类型定义

export interface KGConfig {
  token: string;
  userid: string;
  mid: string;
  device_id?: string;
}

export interface KGMusicInfo {
  songname: string;
  ori_audio_name: string;
  author_name: string;
  audio_id: string;
  audio_info: {
    hash: string;
    timelength: number;
    filesize: number;
    hash_128: string;
    filesize_128: number;
    hash_320: string;
    filesize_320: number;
    hash_flac: string;
    filesize_flac: number;
    hash_hires?: string;
    filesize_hires?: number;
  };
  album_info: {
    album_id: string;
    album_name: string;
    sizable_cover: string;
  };
  bpm?: number;
  language?: string;
  publish_date?: string;
}

export interface KGLyricSearchResult {
  id: string;
  accesskey: string;
}

export interface KGLyricData {
  content: string;
  info: string;
}

export const KG_QUALITY_HASH_MAP: Record<string, string> = {
  '128k': 'hash_128',
  '320k': 'hash_320',
  'flac': 'hash_flac',
  'flac24bit': 'hash_hires'
};

export const KG_CLIENT_CONFIG = {
  appid: 3116,
  signatureKey: 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA',
  clientver: 12029,
  pidversionsecret: '185672dd44712f60bb1736df5a377e82',
  pid: 411,
  tracker: {
    host: 'https://gateway.kugou.com',
    path: '/v5/url',
    version: 'v5',
    xRouter: {
      enable: true,
      value: 'tracker.kugou.com'
    }
  }
};
