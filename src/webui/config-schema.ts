// 后台“配置”页可编辑的配置项：分组、类型、说明、取值范围，以及值的校验与转换。
// 这里没有列出的配置(如账号池)可以在后台的“原始配置”里直接编辑。
// Workers 版的配置修改后立即生效，没有需要重启的项。

import { QUALITY_OPTIONS, SOURCE_NAMES, SUPPORTED_SOURCES } from '../sources/common';

export interface Field {
  key: string;
  label: string;
  type: 'bool' | 'int' | 'number' | 'text' | 'textarea' | 'secret' | 'select' | 'list' | 'int_list' | 'multi';
  help?: string;
  placeholder?: string;
  depends?: string;
  min?: number;
  max?: number;
  unit?: string;
  options?: any[];
  multiline?: boolean;
}

export interface Section {
  id: string;
  title: string;
  icon: string;
  description: string;
  fields: Field[];
}

const REFRESH_INTERVAL = { type: 'int' as const, min: 600, max: 30 * 86400, unit: '秒' };

export const SECTIONS: Section[] = [
  {
    id: 'service', title: '服务', icon: 'server',
    description: '账号池、请求伪装、日志与统计等服务基础设置。',
    fields: [
      { key: 'common.cookiepool', label: '启用账号池(cookie 池)', type: 'bool',
        help: '开启后各平台使用 module.cookiepool 里的多个账号，单账号配置会被忽略。账号池可在“原始配置”里编辑，' +
          'QQ 音乐和网易云账号也可以在“音乐账号”页扫码后直接加入' },
      { key: 'common.fakeip', label: '伪装国内 IP', type: 'text', placeholder: '116.25.146.177',
        help: 'Workers 从海外节点访问音乐平台，部分接口需要国内 IP 才能正常返回；请求时会附带 X-Forwarded-For: 这个地址，留空则不附带。' +
          '需要是平台认可的国内地址，酷狗提示“本次请求需要验证”时请更换' },
      { key: 'common.timezone', label: '时区(UTC 偏移)', type: 'number', min: -12, max: 14, unit: '小时',
        help: '统计按天分组、任务时间显示使用的时区，中国大陆为 8' },
      { key: 'common.debug_mode', label: '调试日志', type: 'bool', help: '在 Workers 日志(wrangler tail 或控制台)中输出更详细的调试信息' },
      { key: 'common.log_length_limit', label: '单条日志最大长度', type: 'int', min: 50, max: 100000 },
      { key: 'common.parse_log_retention_days', label: '解析记录保留天数', type: 'int', min: 0, max: 3650,
        unit: '天', help: '超过天数的解析记录每天自动清理，0 表示永久保留' },
    ],
  },
  {
    id: 'security', title: '安全', icon: 'shield',
    description: '接口鉴权、限速、封禁与后台防护。',
    fields: [
      { key: 'security.key.enable', label: '接口需要用户 Key', type: 'bool', help: '关闭后任何人都可以调用解析接口，不建议关闭' },
      { key: 'security.rate_limit.global', label: '全局请求间隔', type: 'number', min: 0, max: 3600,
        unit: '秒', help: '两次解析请求之间的最小间隔，0 表示不限制' },
      { key: 'security.rate_limit.ip', label: '单个 IP 请求间隔', type: 'number', min: 0, max: 3600, unit: '秒' },
      { key: 'security.banlist.enable', label: '启用 IP 封禁', type: 'bool' },
      { key: 'security.banlist.expire.enable', depends: 'security.banlist.enable', label: '封禁自动到期', type: 'bool' },
      { key: 'security.banlist.expire.length', depends: 'security.banlist.expire.enable', label: '封禁时长', type: 'int',
        min: 60, max: 10 * 365 * 86400, unit: '秒' },
      { key: 'security.allowed_host.enable', label: '只允许指定的 Host 访问', type: 'bool' },
      { key: 'security.allowed_host.list', depends: 'security.allowed_host.enable', label: '允许的 Host', type: 'list',
        placeholder: 'music.example.com' },
      { key: 'security.allowed_host.blacklist.enable', depends: 'security.allowed_host.enable',
        label: 'Host 不匹配时封禁来源 IP', type: 'bool' },
      { key: 'security.allowed_host.blacklist.length', depends: 'security.allowed_host.blacklist.enable',
        label: 'Host 不匹配的封禁时长', type: 'int', min: 0, max: 10 * 365 * 86400, unit: '秒', help: '0 表示永久封禁' },
      { key: 'security.admin_origin_check', label: '后台请求来源校验', type: 'bool',
        help: '防跨站请求伪造。通过其他代理访问导致后台无法保存时可以关闭' },
    ],
  },
  {
    id: 'script', title: '音源脚本', icon: 'code',
    description: '用户通过 /script?key=… 下载的 LX Music 自定义音源脚本。',
    fields: [
      { key: 'common.allow_download_script', label: '允许下载音源脚本', type: 'bool' },
      { key: 'common.download_config.name', label: '脚本名称', type: 'text' },
      { key: 'common.download_config.intro', label: '脚本简介', type: 'text' },
      { key: 'common.download_config.author', label: '作者', type: 'text' },
      { key: 'common.download_config.version', label: '版本号', type: 'text' },
      { key: 'common.download_config.filename', label: '下载文件名', type: 'text', placeholder: 'lx-music-source.js' },
      { key: 'common.download_config.dev', label: '开发模式(输出调试日志)', type: 'bool' },
      { key: 'common.download_config.update', label: '检查脚本更新', type: 'bool' },
      { key: 'common.download_config.updateMsg', depends: 'common.download_config.update', label: '更新提示文字',
        type: 'textarea', help: '可用 {updateUrl}(带 key 的更新地址)、{url}、{key}' },
      ...SUPPORTED_SOURCES.map((source): Field => ({
        key: `common.download_config.quality.${source}`, label: `${SOURCE_NAMES[source]}可用音质`, type: 'multi',
        options: QUALITY_OPTIONS[source],
      })),
    ],
  },
  {
    id: 'tx', title: 'QQ 音乐', icon: 'music',
    description: '账号凭证推荐通过“音乐账号”页扫码获取，会自动填写下面的字段。',
    fields: [
      { key: 'module.tx.enable', label: '启用 QQ 音乐', type: 'bool' },
      { key: 'module.tx.user.uin', label: 'uin(QQ 号)', type: 'text' },
      { key: 'module.tx.user.qqmusic_key', label: 'qqmusic_key', type: 'secret' },
      { key: 'module.tx.user.login_type', label: '登录方式', type: 'select',
        options: [['', '按 key 前缀判断'], ['1', '微信'], ['2', 'QQ']] },
      { key: 'module.tx.user.refresh_key', label: 'refresh_key', type: 'secret' },
      { key: 'module.tx.user.refresh_token', label: 'refresh_token', type: 'secret' },
      { key: 'module.tx.user.openid', label: 'openid', type: 'secret' },
      { key: 'module.tx.user.access_token', label: 'access_token', type: 'secret' },
      { key: 'module.tx.user.unionid', label: 'unionid', type: 'secret' },
      { key: 'module.tx.user.refresh_login.enable', label: '自动刷新登录', type: 'bool' },
      { ...REFRESH_INTERVAL, key: 'module.tx.user.refresh_login.interval', label: '刷新间隔', depends: 'module.tx.user.refresh_login.enable' },
      { key: 'module.tx.cdnaddr', label: '下载 CDN 地址', type: 'text', placeholder: 'http://ws.stream.qqmusic.qq.com/' },
      { key: 'module.tx.vkey_api.use_vkey_api', label: '使用第三方 vkey 接口', type: 'bool' },
      { key: 'module.tx.vkey_api.vkey_api_url', depends: 'module.tx.vkey_api.use_vkey_api', label: '第三方 vkey 接口地址', type: 'text' },
    ],
  },
  {
    id: 'kg', title: '酷狗音乐', icon: 'music',
    description: '账号信息需要抓包获取(/v5/url 请求)。',
    fields: [
      { key: 'module.kg.enable', label: '启用酷狗音乐', type: 'bool' },
      { key: 'module.kg.user.userid', label: 'userid', type: 'text' },
      { key: 'module.kg.user.token', label: 'token', type: 'secret' },
      { key: 'module.kg.user.mid', label: 'mid', type: 'text' },
      { key: 'module.kg.client.appid', label: '客户端类型(appid)', type: 'select',
        options: [['1005', '安卓 (1005)'], ['3116', '概念版 (3116)'], ['1001', 'PC (1001)']],
        help: '概念版账号的 token 请选 3116，签名参数(signatureKey、pidversionsecret、pid)会自动切换成概念版的；自动刷新登录只支持 1005 和 3116' },
      { key: 'module.kg.user.refresh_login.enable', label: '自动刷新登录(token 保活)', type: 'bool', help: 'token 30 天不刷新会失效' },
      { ...REFRESH_INTERVAL, key: 'module.kg.user.refresh_login.interval', label: '刷新间隔', depends: 'module.kg.user.refresh_login.enable' },
      { key: 'module.kg.user.refresh_login.login_url', depends: 'module.kg.user.refresh_login.enable', label: '刷新登录接口', type: 'text' },
      { key: 'module.kg.user.lite_sign_in.enable', label: '概念版自动签到', type: 'bool', help: '仅 appid 为 3116 时生效' },
      { ...REFRESH_INTERVAL, key: 'module.kg.user.lite_sign_in.interval', label: '签到间隔', depends: 'module.kg.user.lite_sign_in.enable' },
    ],
  },
  {
    id: 'wy', title: '网易云音乐', icon: 'music',
    description: '推荐在“音乐账号”页用网易云音乐 App 扫码登录，会自动填写 Cookie；也可以从浏览器复制完整 Cookie。',
    fields: [
      { key: 'module.wy.enable', label: '启用网易云音乐', type: 'bool' },
      { key: 'module.wy.user.cookie', label: 'Cookie', type: 'secret', multiline: true },
      { key: 'module.wy.user.refresh_login.enable', label: '自动刷新登录', type: 'bool', help: '刷新成功后服务端返回的新 Cookie 会自动写回' },
      { ...REFRESH_INTERVAL, key: 'module.wy.user.refresh_login.interval', label: '刷新间隔', depends: 'module.wy.user.refresh_login.enable' },
    ],
  },
];

export const FIELDS: Record<string, Field> = Object.fromEntries(
  SECTIONS.flatMap((section) => section.fields.map((field) => [field.key, field])));

const MAX_TEXT = 4000;
const MAX_SECRET = 16000;

export class ValidationError extends Error {}

export function secretPreview(value: unknown): { set: boolean; preview: string } {
  const text = value === null || value === undefined ? '' : String(value);
  if (!text) return { set: false, preview: '' };
  return { set: true, preview: text.length > 8 ? text.slice(-4) : '' };
}

/** 返回给前端的值：密钥类只告诉前端“是否已设置”和末尾几位 */
export function publicValue(field: Field, value: unknown): unknown {
  switch (field.type) {
    case 'secret':
      return secretPreview(value);
    case 'bool':
      return Boolean(value);
    case 'list':
    case 'int_list':
    case 'multi':
      return Array.isArray(value) ? [...value] : [];
    case 'int':
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    default:
      return value === null || value === undefined ? '' : String(value);
  }
}

function toNumber(field: Field, value: unknown, integer: boolean): number {
  if (typeof value === 'boolean') throw new ValidationError('需要数字');
  if (typeof value === 'string') {
    value = value.trim();
    if (!value) throw new ValidationError('不能为空');
  }
  if (typeof value !== 'number' && typeof value !== 'string') throw new ValidationError(integer ? '需要整数' : '需要数字');
  const number = Number(value);
  if (!Number.isFinite(number)) throw new ValidationError(integer ? '需要整数' : '需要数字');
  if (integer && !Number.isInteger(number)) throw new ValidationError('需要整数');
  if (field.min !== undefined && number < field.min) throw new ValidationError(`不能小于 ${field.min}`);
  if (field.max !== undefined && number > field.max) throw new ValidationError(`不能大于 ${field.max}`);
  return number;
}

/** 把前端提交的值校验并转换成写入配置的值；不合法时抛出 ValidationError */
export function convert(field: Field, value: unknown): unknown {
  switch (field.type) {
    case 'bool':
      if (typeof value !== 'boolean') throw new ValidationError('需要开关值');
      return value;
    case 'int':
      return toNumber(field, value, true);
    case 'number':
      return toNumber(field, value, false);
    case 'text':
    case 'textarea':
    case 'secret': {
      if (typeof value !== 'string') throw new ValidationError('需要文本');
      if (value.length > (field.type === 'secret' ? MAX_SECRET : MAX_TEXT)) throw new ValidationError('内容太长');
      if (field.type === 'text' && /[\r\n]/.test(value)) throw new ValidationError('不能包含换行');
      return field.type === 'textarea' ? value : value.trim();
    }
    case 'select': {
      const options = (field.options || []).map((option) => option[0]);
      if (typeof value !== 'string' || !options.includes(value)) throw new ValidationError('不是可选的值');
      return value;
    }
    case 'list':
    case 'int_list':
    case 'multi': {
      if (!Array.isArray(value)) throw new ValidationError('需要列表');
      if (value.length > 200) throw new ValidationError('条目太多');
      if (field.type === 'multi') {
        const chosen = new Set<string>();
        for (const item of value) {
          if (!(field.options || []).includes(item)) throw new ValidationError(`未知的选项: ${item}`);
          chosen.add(item);
        }
        return (field.options || []).filter((option) => chosen.has(option));
      }
      const result: unknown[] = [];
      for (let item of value) {
        if (field.type === 'int_list') {
          item = toNumber(field, item, true);
        } else {
          if (typeof item !== 'string') throw new ValidationError('需要文本');
          item = item.trim();
          if (!item) continue;
          if ((item as string).length > 500 || /\s/.test(item as string)) throw new ValidationError(`无效的条目: ${(item as string).slice(0, 30)}`);
        }
        if (!result.includes(item)) result.push(item);
      }
      return result;
    }
    default:
      throw new ValidationError('不支持的类型');
  }
}
