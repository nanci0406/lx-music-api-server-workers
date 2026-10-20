// Web 界面入口：公开首页(/)、管理后台(/admin/...，单页应用)。静态文件在 public/static 下，由 Cloudflare 直接提供。

import { Hono } from 'hono';
import type { AppEnv } from './http';

const shell = (title: string, bodyClass: string, script: string) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#faf9f5" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#262624" media="(prefers-color-scheme: dark)">
  <title>${title}</title>
  <link rel="icon" href="/static/img/logo.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/static/css/app.css">
  <script src="/static/js/theme.js"></script>
</head>
<body class="${bodyClass}">
  <div id="app"><div class="boot"><div class="boot-logo"></div></div></div>
  <noscript><p class="noscript">这个页面需要启用 JavaScript。</p></noscript>
  <script type="module" src="/static/js/${script}"></script>
</body>
</html>
`;

const app = new Hono<AppEnv>();

app.get('/', (c) => c.html(shell('LX API Server', 'page-public', 'public.js')));
// /admin 下的所有页面都由前端路由处理，服务端统一返回同一个页面
app.get('/admin', (c) => c.html(shell('管理后台 · LX API Server', 'page-admin', 'admin.js')));
app.get('/admin/*', (c) => c.html(shell('管理后台 · LX API Server', 'page-admin', 'admin.js')));
// 不存在的静态文件(存在的由 Cloudflare 直接返回，不会到这里)
app.get('/static/*', (c) => c.text('Not Found', 404));

export default app;
