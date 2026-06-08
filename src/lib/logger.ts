import type { Env } from '../types/env';
import { getSystemSetting } from './config';

// 日志级别优先级
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

type LogLevel = keyof typeof LOG_LEVELS;

/**
 * 日志工具类
 * 根据数据库中的 log_level 设置过滤日志输出
 */
export class Logger {
  private env: Env;
  private currentLevel: LogLevel = 'info';

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * 从数据库加载日志级别
   */
  async loadLevel(): Promise<void> {
    const dbLogLevel = await getSystemSetting(this.env.DB, 'log_level');
    if (dbLogLevel && dbLogLevel in LOG_LEVELS) {
      this.currentLevel = dbLogLevel as LogLevel;
    }
  }

  /**
   * 检查是否应该输出该级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.currentLevel];
  }

  /**
   * Debug 级别日志
   */
  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Info 级别日志
   */
  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  /**
   * Warning 级别日志
   */
  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  /**
   * Error 级别日志
   */
  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
}

/**
 * 创建 Logger 实例
 */
export async function createLogger(env: Env): Promise<Logger> {
  const logger = new Logger(env);
  await logger.loadLevel();
  return logger;
}
