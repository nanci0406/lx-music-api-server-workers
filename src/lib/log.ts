// 日志：输出到 Workers 日志(wrangler tail / 控制台 Observability)，调试日志受 common.debug_mode 控制

let debugEnabled = false;
let lengthLimit = 500;

export function configureLogging(options: { debug?: boolean; lengthLimit?: number }): void {
  debugEnabled = Boolean(options.debug);
  if (options.lengthLimit && options.lengthLimit > 0) lengthLimit = options.lengthLimit;
}

function format(name: string, message: string): string {
  const text = message.length > lengthLimit ? message.slice(0, lengthLimit) + '…' : message;
  return `[${name}] ${text}`;
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export function log(name: string): Logger {
  return {
    debug: (message) => { if (debugEnabled) console.log(format(name, message)); },
    info: (message) => console.log(format(name, message)),
    warning: (message) => console.warn(format(name, message)),
    error: (message) => console.error(format(name, message)),
  };
}
