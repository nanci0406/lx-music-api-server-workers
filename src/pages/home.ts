// 项目首页

export function homePage(): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LX Music API Server - 多音源音乐 API 服务</title>
<style>
:root {
  --bg: #0f172a;
  --bg-lighter: #1e293b;
  --panel: #1e293b;
  --ink: #f1f5f9;
  --muted: #94a3b8;
  --line: #334155;
  --brand: #3b82f6;
  --brand-bright: #60a5fa;
  --accent: #8b5cf6;
  --good: #10b981;
  --shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.6;
  overflow-x: hidden;
}
.hero {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
}
.hero::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background:
    radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(139, 92, 246, 0.15) 0%, transparent 50%);
  pointer-events: none;
}
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 48px 24px;
  position: relative;
  z-index: 1;
}
.hero-content {
  text-align: center;
  animation: fade-in 0.8s ease-out;
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.logo {
  font-size: 72px;
  margin-bottom: 24px;
  animation: float 3s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
h1 {
  font-size: 48px;
  font-weight: 800;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.tagline {
  font-size: 20px;
  color: var(--muted);
  margin-bottom: 48px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}
.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin-top: 64px;
}
.feature-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 32px;
  transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
  position: relative;
  overflow: hidden;
}
.feature-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--brand), var(--accent));
  transform: scaleX(0);
  transition: transform 0.3s ease;
}
.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow);
  border-color: var(--brand);
}
.feature-card:hover::before {
  transform: scaleX(1);
}
.feature-icon {
  font-size: 48px;
  margin-bottom: 16px;
}
.feature-card h3 {
  font-size: 20px;
  margin-bottom: 12px;
  color: var(--ink);
}
.feature-card p {
  color: var(--muted);
  font-size: 15px;
  line-height: 1.7;
}
.endpoints {
  background: var(--bg-lighter);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 32px;
  margin-top: 64px;
}
.endpoints h2 {
  font-size: 28px;
  margin-bottom: 24px;
  text-align: center;
}
.endpoint-list {
  display: grid;
  gap: 16px;
}
.endpoint-item {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 20px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
}
.method {
  background: var(--brand);
  color: white;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.endpoint-path {
  font-family: 'Consolas', monospace;
  color: var(--brand-bright);
  font-size: 15px;
}
.endpoint-desc {
  color: var(--muted);
  font-size: 14px;
  grid-column: 2 / 4;
}
.cta-buttons {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-top: 48px;
  flex-wrap: wrap;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 28px;
  border-radius: 14px;
  text-decoration: none;
  font-weight: 700;
  font-size: 16px;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
}
.btn-primary {
  background: linear-gradient(135deg, var(--brand), var(--accent));
  color: white;
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5);
}
.btn-secondary {
  background: var(--panel);
  color: var(--ink);
  border: 2px solid var(--line);
}
.btn-secondary:hover {
  border-color: var(--brand);
  transform: translateY(-2px);
}
.sources {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 48px;
  flex-wrap: wrap;
}
.source-badge {
  background: var(--panel);
  border: 1px solid var(--line);
  padding: 10px 18px;
  border-radius: 12px;
  font-size: 14px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--good);
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.footer {
  text-align: center;
  padding: 32px;
  color: var(--muted);
  font-size: 14px;
  margin-top: 64px;
  border-top: 1px solid var(--line);
}
.footer a {
  color: var(--brand-bright);
  text-decoration: none;
}
.footer a:hover {
  text-decoration: underline;
}
@media (max-width: 768px) {
  h1 { font-size: 36px; }
  .tagline { font-size: 18px; padding: 0 12px; }
  .features { grid-template-columns: 1fr; gap: 16px; }
  .endpoint-item {
    grid-template-columns: 1fr;
    text-align: left;
    gap: 12px;
  }
  .endpoint-desc {
    grid-column: 1;
    padding-left: 0;
  }
  .method {
    display: inline-block;
  }
  .endpoint-path {
    font-size: 13px;
    word-break: break-all;
  }
  .cta-buttons {
    flex-direction: column;
    gap: 12px;
  }
  .btn {
    width: 100%;
    justify-content: center;
  }
  .sources {
    gap: 8px;
  }
  .source-badge {
    font-size: 13px;
    padding: 8px 14px;
  }
  .feature-card {
    padding: 24px;
  }
  .feature-icon {
    font-size: 40px;
  }
  .endpoints {
    padding: 24px 16px;
  }
  .endpoints h2 {
    font-size: 24px;
  }
  .container {
    padding: 24px 16px;
  }
  .logo {
    font-size: 56px;
  }
}
@media (max-width: 480px) {
  h1 { font-size: 28px; }
  .tagline { font-size: 16px; }
  .logo { font-size: 48px; }
  .stat-card .value { font-size: 28px; }
  .feature-card h3 { font-size: 18px; }
  .feature-icon { font-size: 36px; }
  .endpoints h2 { font-size: 20px; }
  .endpoint-item {
    padding: 16px;
  }
}
</style>
</head>
<body>
<div class="hero">
  <div class="container">
    <div class="hero-content">
      <div class="logo">🎵</div>
      <h1>LX Music API Server</h1>
      <p class="tagline">企业级多音源音乐 API 服务 · 全自动凭证维护 · 生产就绪</p>

      <div class="cta-buttons">
        <a href="/admin" class="btn btn-primary">
          🎛️ 管理后台
        </a>
        <a href="https://github.com/lxmusics/lx-music-api-server" class="btn btn-secondary" target="_blank">
          📚 查看文档
        </a>
      </div>

      <div class="sources">
        <div class="source-badge">
          <div class="status-dot"></div>
          酷狗音乐
        </div>
        <div class="source-badge">
          <div class="status-dot"></div>
          酷我音乐
        </div>
        <div class="source-badge">
          <div class="status-dot"></div>
          QQ音乐
        </div>
        <div class="source-badge">
          <div class="status-dot"></div>
          网易云音乐
        </div>
        <div class="source-badge">
          <div class="status-dot"></div>
          咪咕音乐
        </div>
      </div>

      <div class="features">
        <div class="feature-card">
          <div class="feature-icon">🎨</div>
          <h3>美观的管理界面</h3>
          <p>Python 风格的现代化 WebUI，配置管理、用户管理、统计分析一应俱全</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🔄</div>
          <h3>全自动维护</h3>
          <p>自动签到、定时刷新登录，所有音源凭证永久保持活跃，完全免维护</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🔒</div>
          <h3>安全可靠</h3>
          <p>完整的认证系统、速率限制、IP 封禁，企业级安全防护</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📊</div>
          <h3>完整可观测</h3>
          <p>详细的日志系统、实时统计、健康监控，运行状态一目了然</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📦</div>
          <h3>一键音源脚本</h3>
          <p>为 LX Music 客户端生成专属音源脚本，支持自动更新</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">⚡</div>
          <h3>Cloudflare Workers</h3>
          <p>部署在全球边缘网络，极速响应，零运维成本</p>
        </div>
      </div>

      <div class="endpoints">
        <h2>🔌 API 端点</h2>
        <div class="endpoint-list">
          <div class="endpoint-item">
            <span class="method">GET</span>
            <code class="endpoint-path">/url/:source/:songId/:quality</code>
            <span class="endpoint-desc">获取歌曲播放地址</span>
          </div>
          <div class="endpoint-item">
            <span class="method">GET</span>
            <code class="endpoint-path">/lyric/:source/:songId</code>
            <span class="endpoint-desc">获取歌曲歌词</span>
          </div>
          <div class="endpoint-item">
            <span class="method">GET</span>
            <code class="endpoint-path">/search/:source?keyword=xxx</code>
            <span class="endpoint-desc">搜索歌曲</span>
          </div>
          <div class="endpoint-item">
            <span class="method">GET</span>
            <code class="endpoint-path">/pic/:source/:songId</code>
            <span class="endpoint-desc">获取歌曲封面</span>
          </div>
          <div class="endpoint-item">
            <span class="method">GET</span>
            <code class="endpoint-path">/script?key=xxx</code>
            <span class="endpoint-desc">下载 LX Music 音源脚本</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="footer">
  <p>
    ⚡ Powered by <strong>Cloudflare Workers</strong> ·
    Made with ❤️ by <a href="https://github.com/lxmusics" target="_blank">lxmusics</a>
  </p>
  <p style="margin-top: 8px; font-size: 13px;">
    本项目仅供学习交流使用，请勿用于商业用途
  </p>
</div>
</body>
</html>
  `;
}
