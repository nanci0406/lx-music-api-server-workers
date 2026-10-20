// 平台接口返回的、可以告诉用户的失败(对应 Python 版的 FailedException)
export class FailedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FailedException';
  }
}

// 扫码 / 验证码登录过程中的错误，message 会直接展示给管理员
export class LoginError extends Error {
  code?: number | null;

  constructor(message: string, code?: number | null) {
    super(message);
    this.name = 'LoginError';
    this.code = code;
  }
}

// 后台接口的错误响应(HTTP 状态码 + 说明 + 附加数据)
export class HttpError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data: unknown = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.data = data;
  }
}
