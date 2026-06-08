// 网易云音乐类型定义

export interface WYConfig {
  cookie: string;
}

export const WY_QUALITY_MAP: Record<string, string> = {
  '128k': 'standard',
  '192k': 'higher',
  '320k': 'exhigh',
  'flac': 'lossless',
  'flac24bit': 'hires',
  'dolby': 'jyeffect',
  'sky': 'sky',
  'master': 'jymaster'
};

export const WY_QUALITY_MAP_REVERSE: Record<string, string> = {
  'standard': '128k',
  'higher': '192k',
  'exhigh': '320k',
  'lossless': 'flac',
  'hires': 'flac24bit',
  'jyeffect': 'dolby',
  'sky': 'sky',
  'jymaster': 'master'
};

// 加密常量
export const NONCE = '0CoJUm6Qyw8W8jud';
export const EAPI_KEY = 'e82ckenh8dichen8';
export const MODULUS = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
export const PUBKEY = '010001';
