// 酷我音乐类型定义

export interface KWConfig {
  uid: string;
  token: string;
  device_id: string;
}

export const KW_QUALITY_MAP: Record<string, string> = {
  '128k': '128kmp3',
  '320k': '320kmp3',
  'flac': '2000kflac',
  'flac24bit': '4000kflac'
};

export const KW_EXT_MAP: Record<string, string> = {
  '128k': 'mp3',
  '320k': 'mp3',
  'flac': 'flac',
  'flac24bit': 'flac'
};

export const KW_QUALITY_MAP_REVERSE: Record<number, string> = {
  128: '128k',
  320: '320k',
  2000: 'flac',
  4000: 'flac24bit'
};
