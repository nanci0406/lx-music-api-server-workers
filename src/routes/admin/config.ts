import { Context } from 'hono';
import type { Database } from '../../types/db';
import { clearConfigCache } from '../../lib/config';

// 获取所有音源配置
export async function getSourceConfigs(c: Context) {
  const db = c.env.DB as Database;

  const configs = await db
    .prepare(`
      SELECT source, config_key, config_value, enabled, description, updated_at
      FROM source_configs
      ORDER BY source, config_key
    `)
    .all();

  // 按音源分组
  const grouped: Record<string, any> = {};
  for (const row of configs.results) {
    const source = row.source as string;
    if (!grouped[source]) {
      grouped[source] = {};
    }
    grouped[source][row.config_key as string] = {
      value: row.config_value,
      enabled: row.enabled === 1,
      description: row.description,
      updated_at: row.updated_at
    };
  }

  return c.json({
    code: 0,
    msg: 'success',
    data: grouped
  });
}

// 更新音源配置
export async function updateSourceConfig(c: Context) {
  const db = c.env.DB as Database;
  const { source, config_key, config_value, enabled } = await c.req.json();

  if (!source || !config_key) {
    return c.json({ code: 1, msg: '参数错误' }, 400);
  }

  const username = c.get('username') || 'admin';
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(`
      INSERT INTO source_configs (source, config_key, config_value, enabled, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, config_key) DO UPDATE SET
        config_value = excluded.config_value,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `)
    .bind(source, config_key, config_value, enabled === false ? 0 : 1, now, username)
    .run();

  // 清除配置缓存
  clearConfigCache();

  return c.json({
    code: 0,
    msg: 'success'
  });
}

// 批量更新音源配置
export async function batchUpdateSourceConfigs(c: Context) {
  const db = c.env.DB as Database;
  const { source, configs } = await c.req.json();

  if (!source || !configs || typeof configs !== 'object') {
    return c.json({ code: 1, msg: '参数错误' }, 400);
  }

  const username = c.get('username') || 'admin';
  const now = Math.floor(Date.now() / 1000);

  // 使用事务批量更新
  const statements = [];
  for (const [key, value] of Object.entries(configs)) {
    statements.push(
      db
        .prepare(`
          INSERT INTO source_configs (source, config_key, config_value, enabled, updated_at, updated_by)
          VALUES (?, ?, ?, 1, ?, ?)
          ON CONFLICT(source, config_key) DO UPDATE SET
            config_value = excluded.config_value,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by
        `)
        .bind(source, key, value, now, username)
    );
  }

  await db.batch(statements);

  // 清除配置缓存
  clearConfigCache();

  return c.json({
    code: 0,
    msg: 'success'
  });
}

// 获取系统设置
export async function getSystemSettings(c: Context) {
  const db = c.env.DB as Database;

  const settings = await db
    .prepare(`
      SELECT setting_key, setting_value, description, updated_at
      FROM system_settings
      ORDER BY setting_key
    `)
    .all();

  const result: Record<string, any> = {};
  for (const row of settings.results) {
    result[row.setting_key as string] = {
      value: row.setting_value,
      description: row.description,
      updated_at: row.updated_at
    };
  }

  return c.json({
    code: 0,
    msg: 'success',
    data: result
  });
}

// 更新系统设置
export async function updateSystemSetting(c: Context) {
  const db = c.env.DB as Database;
  const { setting_key, setting_value } = await c.req.json();

  if (!setting_key || setting_value === undefined) {
    return c.json({ code: 1, msg: '参数错误' }, 400);
  }

  const username = c.get('username') || 'admin';
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(`
      UPDATE system_settings
      SET setting_value = ?, updated_at = ?, updated_by = ?
      WHERE setting_key = ?
    `)
    .bind(setting_value, now, username, setting_key)
    .run();

  return c.json({
    code: 0,
    msg: 'success'
  });
}
