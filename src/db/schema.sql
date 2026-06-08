-- ============================================
-- LX Music API Server - D1 Database Schema
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    CONSTRAINT chk_enabled CHECK (enabled IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_users_credentials
ON users(name, api_key) WHERE enabled = 1;

-- 管理员表
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
);

-- 解析日志表
CREATE TABLE IF NOT EXISTS parse_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    source TEXT NOT NULL,
    method TEXT NOT NULL,
    song_id TEXT,
    quality TEXT,
    success INTEGER NOT NULL,
    error_message TEXT,
    client_ip TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_parse_logs_user_time
ON parse_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parse_logs_source_time
ON parse_logs(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parse_logs_created
ON parse_logs(created_at DESC);

-- 模块健康状态表
CREATE TABLE IF NOT EXISTS module_health (
    source TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    detail TEXT,
    checked_at INTEGER NOT NULL,
    CONSTRAINT chk_status CHECK (
        status IN ('healthy', 'degraded', 'misconfigured', 'disabled')
    )
);

-- IP封禁表
CREATE TABLE IF NOT EXISTS banned_ips (
    ip TEXT PRIMARY KEY,
    expire_time INTEGER,
    reason TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_banned_ips_expire
ON banned_ips(expire_time);

-- 音源配置表
CREATE TABLE IF NOT EXISTS source_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,           -- 'tx', 'wy', 'kg', 'kw', 'mg'
    config_key TEXT NOT NULL,       -- 配置项名称
    config_value TEXT NOT NULL,     -- 配置值
    enabled INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    updated_at INTEGER NOT NULL,
    updated_by TEXT,
    UNIQUE(source, config_key),
    CONSTRAINT chk_enabled CHECK (enabled IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_source_configs_source
ON source_configs(source, enabled);

-- 系统设置表
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
);

-- 初始化默认模块状态
INSERT OR IGNORE INTO module_health (source, status, detail, checked_at) VALUES
('kg', 'disabled', '未配置', 0),
('kw', 'disabled', '未配置', 0),
('wy', 'disabled', '未配置', 0),
('tx', 'disabled', '未配置', 0),
('mg', 'disabled', '未配置', 0);

-- 插入默认系统设置
INSERT OR IGNORE INTO system_settings (setting_key, setting_value, description, updated_at) VALUES
('auth_enabled', 'false', '是否启用认证', strftime('%s', 'now')),
('log_level', 'info', '日志级别', strftime('%s', 'now')),
('rate_limit_enabled', 'true', '是否启用速率限制', strftime('%s', 'now')),
('rate_limit_requests', '100', '速率限制：每分钟请求数', strftime('%s', 'now'));
