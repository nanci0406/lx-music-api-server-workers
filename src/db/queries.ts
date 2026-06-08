import type { D1Database } from '@cloudflare/workers-types';
import type { User, Admin } from '../types/env';

export class DatabaseQueries {
  constructor(private db: D1Database) {}

  // ==================== 用户管理 ====================

  async getUserByCredentials(name: string, apiKey: string): Promise<User | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE name = ? AND api_key = ? AND enabled = 1')
      .bind(name, apiKey)
      .first() as Promise<User | null>;
  }

  async createUser(name: string, apiKey: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare('INSERT INTO users (name, api_key, enabled, created_at) VALUES (?, ?, 1, ?)')
      .bind(name, apiKey, now)
      .run();
  }

  async listUsers(limit: number = 100): Promise<User[]> {
    const result = await this.db
      .prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ?')
      .bind(limit)
      .all();
    return result.results as any as User[];
  }

  async updateUserLastUsed(userId: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare('UPDATE users SET last_used_at = ? WHERE id = ?')
      .bind(now, userId)
      .run();
  }

  async deleteUser(userId: number): Promise<void> {
    await this.db
      .prepare('DELETE FROM users WHERE id = ?')
      .bind(userId)
      .run();
  }

  // ==================== 管理员管理 ====================

  async getAdminByUsername(username: string): Promise<Admin | null> {
    return this.db
      .prepare('SELECT * FROM admins WHERE username = ?')
      .bind(username)
      .first() as Promise<Admin | null>;
  }

  async updateAdminPassword(username: string, passwordHash: string): Promise<void> {
    await this.db
      .prepare('UPDATE admins SET password_hash = ? WHERE username = ?')
      .bind(passwordHash, username)
      .run();
  }

  async updateAdminLastLogin(username: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare('UPDATE admins SET last_login_at = ? WHERE username = ?')
      .bind(now, username)
      .run();
  }

  // ==================== 解析日志 ====================

  async logParse(data: {
    userId?: number;
    username?: string;
    source: string;
    method: string;
    songId?: string;
    quality?: string;
    success: boolean;
    errorMessage?: string;
    clientIp: string;
  }): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare(`
        INSERT INTO parse_logs
        (user_id, username, source, method, song_id, quality, success, error_message, client_ip, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        data.userId || null,
        data.username || null,
        data.source,
        data.method,
        data.songId || null,
        data.quality || null,
        data.success ? 1 : 0,
        data.errorMessage || null,
        data.clientIp,
        now
      )
      .run();
  }

  async getRecentLogs(limit: number = 100) {
    const result = await this.db
      .prepare('SELECT * FROM parse_logs ORDER BY created_at DESC LIMIT ?')
      .bind(limit)
      .all();
    return result.results as any;
  }

  // ==================== 模块健康状态 ====================

  async updateModuleHealth(source: string, status: string, detail?: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare(`
        INSERT OR REPLACE INTO module_health (source, status, detail, checked_at)
        VALUES (?, ?, ?, ?)
      `)
      .bind(source, status, detail || null, now)
      .run();
  }

  async getAllModuleHealth() {
    const result = await this.db
      .prepare('SELECT * FROM module_health ORDER BY source')
      .all();
    return result.results as any;
  }

  // ==================== IP 封禁 ====================

  async banIP(ip: string, expireTime: number | null, reason?: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .prepare(`
        INSERT OR REPLACE INTO banned_ips (ip, expire_time, reason, created_at)
        VALUES (?, ?, ?, ?)
      `)
      .bind(ip, expireTime, reason || null, now)
      .run();
  }

  async isIPBanned(ip: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db
      .prepare(`
        SELECT 1 FROM banned_ips
        WHERE ip = ? AND (expire_time IS NULL OR expire_time > ?)
      `)
      .bind(ip, now)
      .first();
    return !!result;
  }
}
