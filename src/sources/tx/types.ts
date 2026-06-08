// QQ音乐类型定义

export interface TXConfig {
  uin: string;
  key: string;
}

export interface TXMusicInfo {
  track_info: {
    title: string;
    subtitle: string;
    singer: Array<{
      id: number;
      mid: string;
      name: string;
    }>;
    album: {
      id: number;
      mid: string;
      pmid: string;
      title: string;
      subtitle: string;
    };
    file: {
      media_mid: string;
      size_128mp3: number;
      size_320mp3: number;
      size_flac: number;
      size_hires: number;
      size_dolby: number;
      size_new: number[];
    };
    interval: number;
    time_public: string;
    mid: string;
    bpm?: number;
    mv?: {
      vid: string;
    };
    ksong?: {
      id: string;
      mid: string;
    };
  };
  info?: {
    lan?: {
      content: Array<{ value: string }>;
    };
    genre?: {
      content: Array<{ value: string }>;
    };
  };
}

export const TX_QUALITY_MAP: Record<string, string> = {
  '128k': 'M500',
  '320k': 'M800',
  'flac': 'F000',
  'flac24bit': 'RS01',
  'dolby': 'Q000',
  'master': 'AI00'
};

export const TX_FILE_EXT: Record<string, string> = {
  '128k': '.mp3',
  '320k': '.mp3',
  'flac': '.flac',
  'flac24bit': '.flac',
  'dolby': '.flac',
  'master': '.flac'
};

export const TX_QUALITY_MAP_REVERSE: Record<string, string> = {
  'M500': '128k',
  'M800': '320k',
  'F000': 'flac',
  'RS01': 'flac24bit',
  'Q000': 'dolby',
  'AI00': 'master'
};
