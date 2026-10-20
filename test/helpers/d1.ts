// 测试用的 D1：用 Node 自带的 node:sqlite 实现 Worker 里用到的那部分 D1 接口(prepare/bind/first/all/run/batch)

import { DatabaseSync } from 'node:sqlite';

type Params = unknown[];

class Statement {
  constructor(private db: DatabaseSync, private sql: string, private params: Params = []) {}

  bind(...params: Params): Statement {
    return new Statement(this.db, this.sql, params);
  }

  execute() {
    const stmt = this.db.prepare(this.sql);
    const params = this.params.map((value) => (typeof value === 'boolean' ? Number(value) : value)) as any[];
    if (stmt.columns().length) {
      const results = stmt.all(...params).map((row) => ({ ...row }));
      return { results, success: true, meta: { changes: results.length && /^\s*(insert|update|delete)/i.test(this.sql) ? results.length : 0 } };
    }
    const info = stmt.run(...params);
    return { results: [], success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.execute().results[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all() {
    return this.execute();
  }

  async run() {
    return this.execute();
  }

  async raw() {
    return this.execute().results.map((row) => Object.values(row));
  }
}

export class TestD1 {
  sqlite = new DatabaseSync(':memory:');

  prepare(sql: string): Statement {
    return new Statement(this.sqlite, sql);
  }

  async batch(statements: Statement[]) {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.execute());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (e) {
      this.sqlite.exec('ROLLBACK');
      throw e;
    }
  }

  async exec(sql: string) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }

  /** 直接查询(测试断言用) */
  rows<T = Record<string, any>>(sql: string, ...params: unknown[]): T[] {
    return this.sqlite.prepare(sql).all(...(params as any[])).map((row) => ({ ...row })) as T[];
  }
}
