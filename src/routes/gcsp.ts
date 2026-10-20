// 歌词适配后端(module.gcsp)：请求体是 zlib 压缩的十六进制 JSON，响应也用 zlib 压缩。请只在私人范围内使用。

import type { AppContext } from '../lib/context';
import { deflate, hexToBytes, inflate, md5, utf8Decode, utf8Encode } from '../lib/crypto';
import { now } from '../lib/utils';
import { url as resolveUrl } from '../sources';
import type { Source } from '../sources/common';

const QUALITY_MAP: Record<string, string> = { mp3: '128k', hq: '320k', sq: 'flac', hr: 'flac24bit', hires: 'flac24bit' };
export const PLATFORM_MAP: Record<string, Source> = { qq: 'tx', wyy: 'wy', kugou: 'kg' };

const MESSAGES: Record<string, string> = {
  time: '请求检验失败，请检查系统时间是否为标准时间',
  sign: '请求检验失败，请检查应用是否被修改或更新到最新版本',
};

/** 与 Python 的 ujson.dumps 相同的写法：紧凑格式，非 ASCII 字符和 / 都会转义(签名按这个格式计算) */
export function pyJsonDumps(value: unknown): string {
  return JSON.stringify(value)
    .replace(/[\u0080-￿]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'))
    .replace(/\//g, '\\/');
}

function verify(ctx: AppContext, data: Record<string, any>): 'success' | 'sign' | 'time' {
  if (!ctx.config.get('module.gcsp.enable_verify')) return 'success';
  const pkg = String(ctx.config.get('module.gcsp.package_md5') || '');
  const salt1 = String(ctx.config.get('module.gcsp.salt_1') || '');
  const salt2 = String(ctx.config.get('module.gcsp.salt_2') || '');
  const sign1 = md5(pkg + data.time + salt2);
  const sign2 = md5((pyJsonDumps(data.text_1) + pyJsonDumps(data.text_2) + sign1 + data.time + salt1)
    .replace(/\\/g, '').replace(/}"/g, '}').replace(/"\{/g, '{'));
  if (data.sign_1 !== sign1 || data.sign_2 !== sign2) return 'sign';
  if (now() - Number.parseInt(String(data.time), 10) > 10) return 'time';
  return 'success';
}

function reply(code: string, message: string, data: unknown): Uint8Array {
  return deflate(utf8Encode(JSON.stringify({ code, error_msg: message, data })));
}

export async function handleGcspBody(ctx: AppContext, body: Uint8Array): Promise<Uint8Array> {
  const data = JSON.parse(utf8Decode(hexToBytes(utf8Decode(inflate(body)).trim())));
  const result = verify(ctx, data);
  if (result !== 'success') return reply('403', MESSAGES[result], null);
  const te = JSON.parse(data.text_1);
  const source = PLATFORM_MAP[te.platform];
  const quality = QUALITY_MAP[te.t2];
  if (!source || !quality) return reply('403', '暂不支持该平台或音质', null);
  const resolved = await resolveUrl(ctx, source, String(te.t1), quality);
  if (resolved.code === 0) return reply('200', 'success', resolved.data);
  return reply('403', '内部系统错误，请稍后再试', null);
}

export async function handleGcsp(ctx: AppContext, request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > 5 * 1024) return new Response('Request Entity Too Large', { status: 413 });
  try {
    return new Response(await handleGcspBody(ctx, body), { headers: { 'Content-Type': 'application/octet-stream' } });
  } catch {
    return new Response(reply('403', '请求格式错误', null), { headers: { 'Content-Type': 'application/octet-stream' } });
  }
}
