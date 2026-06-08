-- ============================================
-- LX Music API Server - D1 Database Schema V2
-- 新增配置管理功能
-- ============================================

-- 音源配置表
CREATE TABLE IF NOT EXISTS source_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,           -- 'tx', 'wy', 'kg', 'kw', 'mg'
    config_key TEXT NOT NULL,       -- 配置项名称，如 'cookie', 'token', 'userid'
    config_value TEXT NOT NULL,     -- 配置值
    enabled INTEGER NOT NULL DEFAULT 1,
    description TEXT,               -- 配置说明
    updated_at INTEGER NOT NULL,
    updated_by TEXT,                -- 更新者用户名
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

-- 插入默认系统设置
INSERT OR IGNORE INTO system_settings (setting_key, setting_value, description, updated_at) VALUES
('auth_enabled', 'false', '是否启用认证', strftime('%s', 'now')),
('log_level', 'info', '日志级别', strftime('%s', 'now')),
('rate_limit_enabled', 'true', '是否启用速率限制', strftime('%s', 'now')),
('rate_limit_requests', '100', '速率限制：每分钟请求数', strftime('%s', 'now'));

-- 网易云音乐配置示例（需要手动配置）
INSERT OR IGNORE INTO source_configs (source, config_key, config_value, enabled, description, updated_at) VALUES
('wy', 'cookie', '', 1, '网易云音乐 Cookie', strftime('%s', 'now'));

-- QQ音乐配置示例
INSERT OR IGNORE INTO source_configs (source, config_key, config_value, enabled, description, updated_at) VALUES
('tx', 'uin', '', 1, 'QQ音乐 UIN', strftime('%s', 'now')),
('tx', 'qm_keyst', '', 1, 'QQ音乐 qm_keyst', strftime('%s', 'now'));

-- 酷狗音乐配置示例
INSERT OR IGNORE INTO source_configs (source, config_key, config_value, enabled, description, updated_at) VALUES
('kg', 'token', '', 1, '酷狗音乐 Token', strftime('%s', 'now')),
('kg', 'userid', '', 1, '酷狗音乐 User ID', strftime('%s', 'now')),
('kg', 'mid', '', 1, '酷狗音乐 Mid', strftime('%s', 'now'));
