// 音源类型
export type MusicSource = 'kg' | 'kw' | 'wy' | 'tx' | 'mg';

// 音质类型
export type Quality = '128k' | '320k' | 'flac' | 'flac24bit' | 'master' | 'dolby' | 'sky';

// URL 响应
export interface URLResult {
  url: string;
  quality: Quality;
}

// 歌词响应
export interface LyricResult {
  lyric?: string;
  tlyric?: string;
  romalrc?: string;
}

// 搜索结果
export interface SearchResult {
  list: SongInfo[];
  total?: number;
}

// 歌曲信息
export interface SongInfo {
  name: string;
  singer: string;
  songmid: string;
  albumname?: string;
  interval?: number;
  [key: string]: any;
}

// 缓存过期时间配置（不使用 type，使用普通 export）
export const SOURCE_EXPIRATION_TIME: Record<MusicSource, { expire: boolean; time: number }> = {
  tx: { expire: true, time: 80400 },  // 22.3小时
  kg: { expire: true, time: 86400 },  // 24小时
  kw: { expire: true, time: 3600 },   // 1小时
  wy: { expire: true, time: 1200 },   // 20分钟
  mg: { expire: false, time: 0 },     // 不过期
};
