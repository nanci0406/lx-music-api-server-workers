// 配置的读写。配置是一份 JSON 文档，保存在 D1 的 kv 表(key = 'config')里，读取时与默认配置深度合并。
//
// 写入使用乐观锁(version 列)：定时任务刷新登录写回凭证、管理员在后台保存配置可能同时发生，
// 冲突时重新读取最新配置再应用修改，不会互相覆盖。修改函数可以检查最新配置，返回 false 放弃写入
// (例如刷新期间 key 已被管理员换掉，就不能再用旧 key 刷出来的结果覆盖)。

import { deepClone, deepMerge, getPath, isPlainObject, now, setPath } from '../lib/utils';
import { log } from '../lib/log';
import { DEFAULT_CONFIG } from './default-config';

const logger = log('config');
const CONFIG_KEY = 'config';
const BACKUP_KEY = 'config_backup';
const MAX_ATTEMPTS = 6;

export interface ConfigRow {
  value: string;
  version: number;
}

function parseStored(text: string | null | undefined): Record<string, any> {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    logger.error('D1 中保存的配置不是有效的 JSON，已使用默认配置');
    return {};
  }
}

export class Config {
  data: Record<string, any>;
  version: number;

  constructor(private db: D1Database, data: Record<string, any>, version: number) {
    this.data = data;
    this.version = version;
  }

  static fromRow(db: D1Database, row: ConfigRow | null, legacy: Record<string, any> = {}): Config {
    const stored = row ? parseStored(row.value) : legacy;
    return new Config(db, deepMerge(DEFAULT_CONFIG, stored), row ? Number(row.version) : 0);
  }

  static async readRow(db: D1Database): Promise<ConfigRow | null> {
    return db.prepare('SELECT value, version FROM kv WHERE key = ?').bind(CONFIG_KEY).first<ConfigRow>();
  }

  static async load(db: D1Database): Promise<Config> {
    const row = await Config.readRow(db);
    if (row) return Config.fromRow(db, row);
    // 第一次运行：把默认配置(以及从旧版表里迁移来的配置)写进数据库，之后的请求直接读取
    const data = deepMerge(DEFAULT_CONFIG, await readLegacyConfig(db));
    await db.prepare('INSERT OR IGNORE INTO kv (key, value, version, updated_at) VALUES (?, ?, 1, ?)')
      .bind(CONFIG_KEY, JSON.stringify(data), now()).run();
    return Config.fromRow(db, await Config.readRow(db));
  }

  /** 读取配置项(点号分隔的路径)，不存在时返回 undefined */
  get<T = any>(path: string): T {
    return getPath(this.data, path) as T;
  }

  get cookiePool(): boolean {
    return Boolean(this.get('common.cookiepool'));
  }

  /**
   * 修改配置：mutate 拿到最新配置的副本并直接修改它，返回 false 表示放弃。
   * @returns 是否写入
   */
  async update(mutate: (data: Record<string, any>) => boolean | void): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const row = await Config.readRow(this.db);
      const data = deepMerge(DEFAULT_CONFIG, row ? parseStored(row.value) : await readLegacyConfig(this.db));
      if (mutate(data) === false) return false;
      const text = JSON.stringify(data);
      const ts = now();
      let changes = 0;
      if (row) {
        const result = await this.db
          .prepare('UPDATE kv SET value = ?, version = version + 1, updated_at = ? WHERE key = ? AND version = ?')
          .bind(text, ts, CONFIG_KEY, row.version)
          .run();
        changes = result.meta.changes;
      } else {
        const result = await this.db
          .prepare('INSERT OR IGNORE INTO kv (key, value, version, updated_at) VALUES (?, ?, 1, ?)')
          .bind(CONFIG_KEY, text, ts)
          .run();
        changes = result.meta.changes;
      }
      if (changes === 1) {
        this.data = data;
        this.version = row ? Number(row.version) + 1 : 1;
        return true;
      }
    }
    throw new Error('配置正在被同时修改，请稍后重试');
  }

  /** 一次写入多个配置项(key 为点号分隔的路径) */
  async writeBatch(items: Record<string, unknown>): Promise<void> {
    await this.update((data) => {
      for (const [key, value] of Object.entries(items)) setPath(data, key, deepClone(value));
    });
  }

  async write(key: string, value: unknown): Promise<void> {
    await this.writeBatch({ [key]: value });
  }

  /** 用一份完整的配置替换当前配置(后台“原始配置”)，替换前把旧配置备份到 config_backup */
  async replace(content: Record<string, any>): Promise<void> {
    const row = await Config.readRow(this.db);
    if (row) {
      await this.db
        .prepare('INSERT INTO kv (key, value, version, updated_at) VALUES (?, ?, 0, ?) ' +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
        .bind(BACKUP_KEY, row.value, now())
        .run();
    }
    await this.update((data) => {
      for (const key of Object.keys(data)) delete data[key];
      Object.assign(data, deepMerge(DEFAULT_CONFIG, content));
    });
  }

  /** 给后台“原始配置”展示的完整配置 */
  text(): string {
    return JSON.stringify(this.data, null, 2);
  }
}

// ---------------------------------------------------------------------------
// 从旧版 Workers 的 source_configs / system_settings 表迁移配置(只在 D1 里还没有新配置时读取)
// ---------------------------------------------------------------------------

const LEGACY_SOURCE_KEYS: Record<string, Record<string, string>> = {
  tx: { uin: 'module.tx.user.uin', qm_keyst: 'module.tx.user.qqmusic_key', qqmusic_key: 'module.tx.user.qqmusic_key' },
  kg: { token: 'module.kg.user.token', userid: 'module.kg.user.userid', mid: 'module.kg.user.mid' },
  wy: { cookie: 'module.wy.user.cookie' },
};

export async function readLegacyConfig(db: D1Database): Promise<Record<string, any>> {
  const result: Record<string, any> = {};
  try {
    const rows = await db.prepare('SELECT source, config_key, config_value, enabled FROM source_configs').all<{
      source: string; config_key: string; config_value: string; enabled: number;
    }>();
    for (const row of rows.results) {
      const path = LEGACY_SOURCE_KEYS[row.source]?.[row.config_key];
      if (path && row.enabled && row.config_value) setPath(result, path, String(row.config_value));
    }
  } catch {
    // 没有旧表
  }
  try {
    const rows = await db.prepare('SELECT setting_key, setting_value FROM system_settings').all<{
      setting_key: string; setting_value: string;
    }>();
    const settings = Object.fromEntries(rows.results.map((row) => [row.setting_key, String(row.setting_value)]));
    if ('auth_enabled' in settings) setPath(result, 'security.key.enable', settings.auth_enabled === 'true');
    if (settings.log_level === 'debug') setPath(result, 'common.debug_mode', true);
    if (settings.rate_limit_enabled === 'true') {
      const perMinute = Number(settings.rate_limit_requests);
      if (perMinute > 0) setPath(result, 'security.rate_limit.ip', Math.round((60 / perMinute) * 100) / 100);
    }
  } catch {
    // 没有旧表
  }
  if (Object.keys(result).length) logger.info('已从旧版的配置表读取配置');
  return result;
}
