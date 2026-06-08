// Cloudflare Workers 环境变量类型定义
export interface Env {
  // Cloudflare Bindings
  DB: D1Database;
  KV: KVNamespace;

  // 基础配置
  AUTH_ENABLED?: string;
  ENVIRONMENT?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;

  // 酷狗音乐配置
  KG_ENABLE?: string;
  KG_TOKEN?: string;
  KG_USERID?: string;
  KG_MID?: string;
  KG_DEVICE_ID?: string;

  // QQ音乐配置
  TX_ENABLE?: string;
  TX_UIN?: string;
  TX_KEY?: string;

  // 网易云音乐配置
  WY_ENABLE?: string;
  WY_COOKIE?: string;

  // 咪咕音乐配置
  MG_ENABLE?: string;
  MG_BY?: string;
  MG_SESSION?: string;
  MG_USERAGENT?: string;

  // 酷我音乐配置
  KW_ENABLE?: string;
  KW_UID?: string;
  KW_TOKEN?: string;
  KW_DEVICE_ID?: string;
}

// API 响应类型
export interface APIResponse<T = any> {
  code: number;
  msg: string;
  data: T | null;
  extra?: Record<string, any>;
}

// 用户类型
export interface User {
  id: number;
  name: string;
  api_key: string;
  enabled: number;
  created_at: number;
  last_used_at: number | null;
}

// 管理员类型
export interface Admin {
  id: number;
  username: string;
  password_hash: string;
  created_at: number;
  last_login_at: number | null;
}
