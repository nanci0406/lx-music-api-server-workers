// Worker 的绑定与环境变量

export interface Env {
  DB: D1Database;
  // 首次部署时创建管理员账号使用(只在数据库里还没有管理员时生效)
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

