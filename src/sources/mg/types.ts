// 咪咕音乐类型定义

export interface MGConfig {
  by: string;
  session: string;
  useragent?: string;
}

export const MG_QUALITY_MAP: Record<string, string> = {
  '128k': '1',
  '320k': '2',
  'flac': '3',
  'flac24bit': '4',
  'master': '5'
};

export const MG_QUALITY_MAP_REVERSE: Record<string, string> = {
  '000009': '128k',
  '020010': '320k',
  '011002': 'flac',
  '011005': 'flac24bit'
};
