// 模拟一台安卓手机的设备信息，用于 QQ 音乐手机验证码 / 扫码登录时构造请求里的 comm 字段。
// 保存在 D1 的 kv 表里(key = tx_device)，同一个服务始终使用同一台“设备”。

import { kvGet, kvSet } from '../../lib/db';
import { md5, randomChoice, randomHex, randomInt } from '../../lib/crypto';

const DEVICE_KEY = 'tx_device';

// 获取到的 QIMEI 缓存多久(秒)，过期后重新获取
export const QIMEI_CACHE_SECONDS = 24 * 3600;

export interface OSVersion {
  incremental: string;
  release: string;
  codename: string;
  sdk: number;
}

export interface Device {
  display: string;
  product: string;
  device: string;
  board: string;
  model: string;
  fingerprint: string;
  boot_id: string;
  proc_version: string;
  imei: string;
  brand: string;
  android_id: string;
  open_udid: string;
  version: OSVersion;
  qimei: { q16?: string; q36?: string };
  qimei_time: number;
}

/** 生成随机 IMEI(写法与 Python 版一致) */
export function randomImei(): string {
  const digits: number[] = [];
  let total = 0;
  for (let i = 0; i < 14; i++) {
    let num = randomInt(0, 9);
    if (i % 2 === 0) {
      num *= 2;
      if (num >= 10) num = (num % 10) + 1;
    }
    total += num;
    digits.push(num);
  }
  digits.push((total * 9) % 10);
  return digits.join('');
}

export function newDevice(): Device {
  return {
    display: `QMAPI.${randomInt(100000, 999999)}.001`,
    product: 'iarim',
    device: 'sagit',
    board: 'eomam',
    model: 'MI 6',
    fingerprint: `xiaomi/iarim/sagit:10/eomam.200122.001/${randomInt(1000000, 9999999)}:user/release-keys`,
    boot_id: crypto.randomUUID(),
    proc_version: `Linux 5.4.0-54-generic-${randomChoice('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8)} (android-build@google.com)`,
    imei: randomImei(),
    brand: 'Xiaomi',
    android_id: randomHex(8),
    open_udid: md5(randomHex(16)),
    version: { incremental: '5891938', release: '10', codename: 'REL', sdk: 29 },
    qimei: {},
    qimei_time: 0,
  };
}

export function qimeiFresh(device: Device, now = Date.now() / 1000): boolean {
  return Boolean(device.qimei?.q36) && now - device.qimei_time < QIMEI_CACHE_SECONDS;
}

/** 读取保存的设备信息；没有或损坏时生成一台新的并保存 */
export async function loadDevice(db: D1Database): Promise<Device> {
  const stored = await kvGet<Device>(db, DEVICE_KEY);
  if (stored && stored.android_id && stored.open_udid && stored.version) {
    return { ...newDevice(), ...stored, qimei: stored.qimei || {}, qimei_time: Number(stored.qimei_time) || 0 };
  }
  const device = newDevice();
  await saveDevice(db, device);
  return device;
}

export async function saveDevice(db: D1Database, device: Device): Promise<void> {
  await kvSet(db, DEVICE_KEY, device);
}
