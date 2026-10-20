// LX Music 自定义音源脚本(/script?key=…)：在模板里填好服务地址、用户名、Key 和配置的音质

import template from '../script/lx-music-source.txt';
import type { AppContext } from '../lib/context';
import { md5 } from '../lib/crypto';
import { isSupportedSource } from '../sources/common';

/** 脚本头部注释里的文字：不能包含换行和注释结束符 */
function commentText(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\*\//g, '* /');
}

/** 只保留当前支持的平台：旧配置里可能还留着已下线的平台(如酷我、咪咕)，不能写进脚本让客户端以为可用 */
export function supportedQuality(quality: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (quality && typeof quality === 'object') {
    for (const [source, qualities] of Object.entries(quality as Record<string, unknown>)) {
      if (isSupportedSource(source) && Array.isArray(qualities)) result[source] = qualities.map(String);
    }
  }
  return result;
}

export interface ScriptResult {
  script: string;
  md5: string;
  filename: string;
}

/** 生成脚本；baseUrl 为服务地址(如 https://example.com) */
export function buildScript(ctx: AppContext, baseUrl: string, userName: string, apiKey: string): ScriptResult {
  const c = ctx.config;
  const lines = template.split('\n').map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('const API_URL')) return `const API_URL = ${JSON.stringify(baseUrl)}`;
    if (trimmed.startsWith('const API_KEY')) return `const API_KEY = ${JSON.stringify(apiKey)}`;
    if (trimmed.startsWith('const USER_NAME')) return `const USER_NAME = ${JSON.stringify(userName)}`;
    if (trimmed.startsWith('* @name')) return ' * @name ' + commentText(c.get('common.download_config.name'));
    if (trimmed.startsWith('* @description')) return ' * @description ' + commentText(c.get('common.download_config.intro'));
    if (trimmed.startsWith('* @author')) return ' * @author ' + commentText(c.get('common.download_config.author'));
    if (trimmed.startsWith('* @version')) return ' * @version ' + commentText(c.get('common.download_config.version'));
    if (trimmed.startsWith('const DEV_ENABLE ')) return `const DEV_ENABLE = ${Boolean(c.get('common.download_config.dev'))}`;
    if (trimmed.startsWith('const UPDATE_ENABLE ')) return `const UPDATE_ENABLE = ${Boolean(c.get('common.download_config.update'))}`;
    return line;
  });
  let script = lines.join('\n');
  const quality = JSON.stringify(supportedQuality(c.get('common.download_config.quality')));
  script = script.replace(/const MUSIC_QUALITY = {[^}]+}/, `const MUSIC_QUALITY = JSON.parse(${JSON.stringify(quality)})`);
  // 用于检查更新：脚本内容(含地址、用户、音质等配置)变了，MD5 就会变
  const hash = md5(script);
  script = script.replace("const SCRIPT_MD5 = ''", `const SCRIPT_MD5 = '${hash}'`);
  let filename = String(c.get('common.download_config.filename') || 'lx-music-source.js').replace(/["\r\n\\/]/g, '_');
  if (!filename.endsWith('.js')) filename += '.js';
  return { script, md5: hash, filename };
}

/** 检查更新的响应：没有更新时 data 为 null */
export function updateInfo(ctx: AppContext, baseUrl: string, apiKey: string, current: string, latestMd5: string) {
  if (current === latestMd5) return null;
  const url = `${baseUrl}/script`;
  const updateUrl = `${url}?key=${encodeURIComponent(apiKey)}`;
  const updateMsg = String(ctx.config.get('common.download_config.updateMsg') || '')
    .replace(/\{updateUrl\}/g, updateUrl)
    .replace(/\{url\}/g, url)
    .replace(/\{key\}/g, apiKey)
    .replace(/\\n/g, '\n');
  return { updateMsg, updateUrl };
}
