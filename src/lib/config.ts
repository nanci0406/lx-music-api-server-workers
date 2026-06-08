import type { D1Database } from '@cloudflare/workers-types';

// 配置缓存（减少数据库查询）
let configCache: Record<string, Record<string, string>> = {};
let cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 60秒缓存

/**
 * 从数据库读取指定音源的所有配置
 */
export async function getSourceConfig(
  db: D1Database,
  source: string
): Promise<Record<string, string>> {
  // 检查缓存
  const now = Date.now();
  if (configCache[source] && now - cacheTime < CACHE_TTL) {
    return configCache[source];
  }

  // 从数据库读取
  const result = await db
    .prepare(`
      SELECT config_key, config_value
      FROM source_configs
      WHERE source = ? AND enabled = 1
    `)
    .bind(source)
    .all();

  const config: Record<string, string> = {};
  for (const row of result.results) {
    config[row.config_key as string] = row.config_value as string;
  }

  // 更新缓存
  configCache[source] = config;
  cacheTime = now;

  return config;
}

/**
 * 从数据库读取系统设置
 */
export async function getSystemSetting(
  db: D1Database,
  key: string
): Promise<string | null> {
  const result = await db
    .prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?')
    .bind(key)
    .first();

  return result ? (result.setting_value as string) : null;
}

/**
 * 清除配置缓存（配置更新后调用）
 */
export function clearConfigCache(): void {
  configCache = {};
  cacheTime = 0;
}
