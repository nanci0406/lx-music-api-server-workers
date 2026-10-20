-- ============================================
-- LX Music API Server (Workers) - D1 表结构
-- Worker 第一次处理请求时会自动执行这里的语句(都是幂等的)，
-- 也可以手动执行：npm run db:init
-- ============================================

-- API 用户
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
);

-- 管理员
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
);

-- 解析记录
CREATE TABLE IF NOT EXISTS parse_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    source TEXT,
    method TEXT,
    song_id TEXT,
    quality TEXT,
    success INTEGER NOT NULL,
    error_message TEXT,
    client_ip TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_parse_logs_user_time ON parse_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parse_logs_source_time ON parse_logs(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parse_logs_created ON parse_logs(created_at DESC);

-- 各平台的状态(detail 会展示在公开首页，admin_detail 只有管理员可见)
CREATE TABLE IF NOT EXISTS module_health (
    source TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    detail TEXT,
    checked_at INTEGER NOT NULL,
    admin_detail TEXT
);

-- IP 封禁(expire_time 为到期时间戳，NULL 表示永久)
CREATE TABLE IF NOT EXISTS banned_ips (
    ip TEXT PRIMARY KEY,
    expire_time INTEGER,
    reason TEXT,
    created_at INTEGER NOT NULL
);

-- 键值存储：配置(config)、QQ 音乐设备信息等
CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
);

-- 管理后台会话(只保存令牌的哈希)
CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(username);

-- 登录失败记录(用于限制暴力破解)
CREATE TABLE IF NOT EXISTS login_failures (
    key TEXT NOT NULL,
    ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_failures_key ON login_failures(key, ts);

-- 限速：最近一次请求的时间
CREATE TABLE IF NOT EXISTS request_times (
    key TEXT PRIMARY KEY,
    ts REAL NOT NULL
);

-- 解析结果、歌词、平台接口响应的缓存
CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expire_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cache_expire ON cache(expire_at);

-- 定时任务的执行状态
CREATE TABLE IF NOT EXISTS task_state (
    name TEXT PRIMARY KEY,
    latest_execute INTEGER NOT NULL DEFAULT 0,
    next_run INTEGER NOT NULL DEFAULT 0,
    last_success_at INTEGER,
    last_failure_at INTEGER,
    last_error TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    running_since INTEGER
);

-- 后台扫码 / 验证码登录的会话(凭证保存前最多保留 10 分钟)
CREATE TABLE IF NOT EXISTS login_sessions (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    data TEXT,
    credential TEXT,
    created_at INTEGER NOT NULL,
    finished_at INTEGER,
    checking_until INTEGER NOT NULL DEFAULT 0
);
