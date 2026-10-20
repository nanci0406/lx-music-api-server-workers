// 通用小工具

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** 文件大小格式化，与 Python 版的 sizeFormat 输出一致(如 3.0MB、4.25MB) */
export function sizeFormat(size: number): string {
  size = Number(size) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  if (size < 1024) return `${size}B`;
  let index = 0;
  let value = size;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  const rounded = Math.round(value * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded.toFixed(1) : rounded}${units[index]}`;
}

/** 时长格式化：mm:ss，超过一小时为 hh:mm:ss */
export function timeLengthFormat(seconds: number | string): string {
  const t = Math.trunc(Number(seconds));
  if (!Number.isFinite(t)) return '//';
  const hour = Math.floor(t / 3600);
  const minute = Math.floor((t % 3600) / 60);
  const second = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${hour > 0 ? pad(hour) + ':' : ''}${pad(minute)}:${pad(second)}`;
}

/** 按时区偏移(小时)格式化时间戳：YYYY-MM-DD HH:MM:SS */
export function timestampFormat(ts: number, offsetHours = 8): string {
  const d = new Date((ts + offsetHours * 3600) * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** 按 key 排序后的新对象 */
export function sortObject<T extends Record<string, unknown>>(obj: T): T {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) sorted[key] = obj[key];
  return sorted as T;
}

/** 拼接 k=v&k=v，不做编码(签名接口要求按原样拼接) */
export function joinParams(params: Record<string, unknown>): string {
  return Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
}

/** 拼接并编码查询字符串 */
export function buildQuery(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

export function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deepClone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/** 深度合并：对象逐层合并，数组和其他值整体替换 */
export function deepMerge(base: any, override: any): any {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? deepClone(base) : deepClone(override);
  }
  const result: Record<string, any> = deepClone(base);
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? deepMerge(result[key], value) : deepClone(value);
  }
  return result;
}

/** 按点号分隔的路径读取对象里的值，不存在时返回 undefined */
export function getPath(obj: any, path: string): any {
  let current = obj;
  for (const key of path.split('.')) {
    if (!isPlainObject(current) && !Array.isArray(current)) return undefined;
    current = (current as any)[key];
    if (current === undefined) return undefined;
  }
  return current;
}

/** 按点号分隔的路径写入对象，缺少的中间层自动创建 */
export function setPath(obj: any, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys.slice(0, -1)) {
    if (!isPlainObject(current[key]) && !Array.isArray(current[key])) current[key] = {};
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

/** 随机打乱后取一个 */
export function pickRandom<T>(items: T[]): T | undefined {
  if (!items.length) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}
