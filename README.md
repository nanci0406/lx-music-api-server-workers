# LX Music API Server - Cloudflare Workers 版

> 基于 Cloudflare Workers 的多音源音乐 API 服务，支持酷狗、酷我、QQ音乐、网易云、咪咕等主流音源

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nanci0406/lx-music-api-server-workers)

## ✨ 特性

- 🎵 **多音源支持** - kg，kw，tx，wy，mg
- 🎨 **美观的 WebUI** - 现代化管理后台，配置管理、用户管理、统计分析
- 🔄 **自动维护** - 自动签到、定时刷新登录
- 🔒 **安全可靠** - 完整的认证系统、速率限制、IP 封禁
- 📊 **完整可观测** - 详细的日志系统、实时统计、健康监控
- ⚡ **边缘计算** - 部署在 Cloudflare 全球边缘网络，极速响应

## 🚀 快速开始

### 方式一：一键部署脚本（推荐）

#### Linux / macOS

```bash
# 克隆项目
git clone https://github.com/nanci0406/lx-music-api-server-workers.git
cd lx-music-api-server-workers

# 运行一键部署脚本
./deploy.sh
```

#### Windows

```batch
# 克隆项目
git clone https://github.com/nanci0406/lx-music-api-server-workers.git
cd lx-music-api-server-workers

# 运行一键部署脚本
deploy.bat
```

脚本会自动完成：
- ✅ 检查环境依赖
- ✅ 安装 Wrangler CLI
- ✅ 登录 Cloudflare
- ✅ 创建 D1 数据库
- ✅ 初始化数据库
- ✅ 部署到 Cloudflare Workers

### 方式二：网页端部署

打开 `deploy.html` 文件，按照页面指引逐步操作。

### 方式三：手动部署

### 前置要求

- Node.js 18+
- Cloudflare 账号
- Wrangler CLI

### 本地开发

```bash
# 克隆项目
git clone https://github.com/nanci0406/lx-music-api-server-workers.git
cd lx-music-api-server-workers

# 安装依赖
npm install

# 配置环境变量
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填入你的配置

# 创建数据库
npx wrangler d1 create lx-music-api-db

# 执行数据库迁移
npx wrangler d1 execute lx-music-api-db --local --file=./src/db/schema.sql

# 启动本地开发服务器
npm run dev
```

### 部署到 Cloudflare Workers

```bash
# 登录 Cloudflare
npx wrangler login

# 创建 D1 数据库
npx wrangler d1 create lx-music-api-db

# 更新 wrangler.toml 中的数据库 ID

# 执行远程数据库迁移
npx wrangler d1 execute lx-music-api-db --remote --file=./src/db/schema.sql

# 部署
npm run deploy
```

## 📖 使用指南

### 管理后台

访问 `https://your-worker.workers.dev/admin` 进入管理后台

默认管理员账号：
- 用户名: `admin`
- 密码: `admin123`（首次登录后请立即修改）

### API 端点

```
GET  /url/:source/:songId/:quality    # 获取歌曲播放地址
GET  /lyric/:source/:songId           # 获取歌曲歌词
GET  /search/:source?keyword=xxx      # 搜索歌曲
GET  /pic/:source/:songId             # 获取歌曲封面
GET  /script?key=xxx                  # 下载 LX Music 音源脚本
```

支持的音源：
- `kg` - 酷狗音乐
- `kw` - 酷我音乐
- `tx` - QQ音乐
- `wy` - 网易云音乐
- `mg` - 咪咕音乐

### 配置音源

1. 登录管理后台
2. 进入"配置管理"
3. 选择要配置的音源
4. 填入必要的配置信息（Cookie、Token 等）
5. 启用音源

### 自动刷新登录

系统会自动维护音源凭证：

- **酷狗音乐**
  - 自动签到：每天 08:07（北京时间）
  - 刷新登录：每7天 08:07
  
- **QQ音乐**
  - 刷新登录：每3天 08:13
  
- **网易云音乐**
  - 刷新登录：每7天 08:19

## 🔧 配置说明

### 环境变量

在 `wrangler.toml` 中配置：

```toml
[vars]
AUTH_ENABLED = "true"        # 是否启用用户认证
ENVIRONMENT = "production"   # 环境：production/development
```

### 定时任务

在 `wrangler.toml` 中配置 cron 触发器：

```toml
[triggers]
crons = [
  "7 0 * * *",      # 每天 - 酷狗签到
  "7 0 */7 * *",    # 每7天 - 酷狗刷新登录
  "13 0 */3 * *",   # 每3天 - QQ音乐刷新登录
  "19 0 */7 * *"    # 每7天 - 网易云刷新登录
]
```

## 📱 LX Music 音源脚本

### 获取音源脚本

1. 登录管理后台，进入"用户管理"
2. 创建 API 用户，获取 API Key
3. 访问 `https://your-worker.workers.dev/script?key=YOUR_API_KEY`
4. 下载音源脚本

### 在 LX Music 中使用

1. 打开 LX Music 客户端
2. 进入"设置" → "音源管理"
3. 点击"添加自定义音源"
4. 输入脚本地址：`https://your-worker.workers.dev/script?key=YOUR_API_KEY`
5. 客户端会自动下载并安装音源脚本

## 🛡️ 安全配置

### API 认证

所有 API 请求需要在请求头中包含有效的 API Key：

```
X-Request-Key: YOUR_API_KEY
```

### 速率限制

可在管理后台配置速率限制：
- 全局开关
- 时间窗口（秒）
- 最大请求次数

### IP 封禁

支持封禁恶意 IP，可设置：
- 永久封禁
- 临时封禁（自动过期）

## 📊 监控和日志

### 健康监控

访问 `https://your-worker.workers.dev/admin/health` 查看音源健康状态

### 日志查看

```bash
# 实时查看日志
npx wrangler tail --format=pretty

# 在管理后台查看
访问 /admin/stats 查看统计和日志
```

## 🔨 开发

### 项目结构

```
src/
├── index.ts              # 主入口
├── router.ts             # API 路由
├── admin/                # 管理后台
│   ├── routes.ts         # 后台路由
│   ├── middleware.ts     # 认证中间件
│   └── python-templates.ts # WebUI 模板
├── sources/              # 音源实现
│   ├── kg/              # 酷狗
│   ├── kw/              # 酷我
│   ├── tx/              # QQ音乐
│   ├── wy/              # 网易云
│   └── mg/              # 咪咕
├── cron/                # 定时任务
│   └── refresh-login.ts # 刷新登录
├── db/                  # 数据库
│   └── queries.ts       # 数据库查询
├── lib/                 # 工具库
│   ├── auth.ts          # 认证
│   ├── ratelimit.ts     # 限流
│   └── logger.ts        # 日志
└── types/               # 类型定义
```

### 添加新音源

1. 在 `src/sources/` 创建新音源目录
2. 实现搜索、获取 URL、歌词、封面等功能
3. 在 `src/router.ts` 中注册路由
4. 在数据库中添加音源配置

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## ⚠️ 免责声明

本项目仅供学习交流使用，请勿用于商业用途。使用本项目所造成的一切后果由使用者自行承担。

## 🔗 相关链接

- [LX Music Desktop](https://github.com/lyswhut/lx-music-desktop) - 原版音乐播放器
- [LX Music API Server](https://github.com/MeoProject/lx-music-api-server) - Python 原版项目
- [Cloudflare Workers](https://workers.cloudflare.com/) - 边缘计算平台

## 💬 支持

如有问题，欢迎提交 Issue
