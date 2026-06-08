import { Context } from 'hono';
import type { Database } from '../../types/db';
import { generateApiKey } from '../../lib/utils';

// 获取所有用户
export async function getUsers(c: Context) {
  const db = c.env.DB as Database;

  const users = await db
    .prepare(`
      SELECT id, name, api_key, enabled, created_at, last_used_at
      FROM users
      ORDER BY created_at DESC
    `)
    .all();

  return c.json({
    code: 0,
    msg: 'success',
    data: users.results
  });
}

// 创建用户
export async function createUser(c: Context) {
  const db = c.env.DB as Database;
  const { name, api_key } = await c.req.json();

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return c.json({ code: 1, msg: '用户名不能为空' }, 400);
  }

  // 检查用户名是否已存在
  const existing = await db
    .prepare('SELECT id FROM users WHERE name = ?')
    .bind(name.trim())
    .first();

  if (existing) {
    return c.json({ code: 1, msg: '用户名已存在' }, 400);
  }

  // API Key：如果提供则使用，否则自动生成
  let finalApiKey: string;
  if (api_key && typeof api_key === 'string' && api_key.trim().length > 0) {
    finalApiKey = api_key.trim();

    // 检查 API Key 是否已存在
    const existingKey = await db
      .prepare('SELECT id FROM users WHERE api_key = ?')
      .bind(finalApiKey)
      .first();

    if (existingKey) {
      return c.json({ code: 1, msg: 'API Key 已存在' }, 400);
    }
  } else {
    // 自动生成 API Key
    finalApiKey = generateApiKey();
  }

  const now = Math.floor(Date.now() / 1000);

  const result = await db
    .prepare(`
      INSERT INTO users (name, api_key, enabled, created_at)
      VALUES (?, ?, 1, ?)
      RETURNING id, name, api_key, enabled, created_at
    `)
    .bind(name.trim(), finalApiKey, now)
    .first();

  return c.json({
    code: 0,
    msg: 'success',
    data: result
  });
}

// 更新用户
export async function updateUser(c: Context) {
  const db = c.env.DB as Database;
  const { id } = c.req.param();
  const { name, enabled } = await c.req.json();

  if (!id) {
    return c.json({ code: 1, msg: '用户 ID 不能为空' }, 400);
  }

  // 检查用户是否存在
  const user = await db
    .prepare('SELECT id FROM users WHERE id = ?')
    .bind(id)
    .first();

  if (!user) {
    return c.json({ code: 1, msg: '用户不存在' }, 404);
  }

  // 构建更新语句
  const updates: string[] = [];
  const binds: any[] = [];

  if (name !== undefined && name.trim().length > 0) {
    updates.push('name = ?');
    binds.push(name.trim());
  }

  if (enabled !== undefined) {
    updates.push('enabled = ?');
    binds.push(enabled ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json({ code: 1, msg: '没有要更新的字段' }, 400);
  }

  binds.push(id);

  await db
    .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();

  const updated = await db
    .prepare('SELECT id, name, api_key, enabled, created_at, last_used_at FROM users WHERE id = ?')
    .bind(id)
    .first();

  return c.json({
    code: 0,
    msg: 'success',
    data: updated
  });
}

// 重置用户 API Key
export async function resetApiKey(c: Context) {
  const db = c.env.DB as Database;
  const { id } = c.req.param();

  if (!id) {
    return c.json({ code: 1, msg: '用户 ID 不能为空' }, 400);
  }

  const newApiKey = generateApiKey();

  const result = await db
    .prepare(`
      UPDATE users
      SET api_key = ?
      WHERE id = ?
      RETURNING id, name, api_key, enabled, created_at, last_used_at
    `)
    .bind(newApiKey, id)
    .first();

  if (!result) {
    return c.json({ code: 1, msg: '用户不存在' }, 404);
  }

  return c.json({
    code: 0,
    msg: 'success',
    data: result
  });
}

// 删除用户
export async function deleteUser(c: Context) {
  const db = c.env.DB as Database;
  const { id } = c.req.param();

  if (!id) {
    return c.json({ code: 1, msg: '用户 ID 不能为空' }, 400);
  }

  const result = await db
    .prepare('DELETE FROM users WHERE id = ?')
    .bind(id)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ code: 1, msg: '用户不存在' }, 404);
  }

  return c.json({
    code: 0,
    msg: 'success'
  });
}

// 获取用户统计信息
export async function getUserStats(c: Context) {
  const db = c.env.DB as Database;

  const stats = await db
    .prepare(`
      SELECT
        COUNT(*) as total_users,
        SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled_users,
        SUM(CASE WHEN last_used_at IS NOT NULL THEN 1 ELSE 0 END) as active_users
      FROM users
    `)
    .first();

  return c.json({
    code: 0,
    msg: 'success',
    data: stats
  });
}
