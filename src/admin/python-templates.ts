// Python 风格的页面模板 - 完全参考 lx-api-server/webui

const CSS_CONTENT = `/* CSS 内容将被内联 */`;

// 通用页面包装器
export function pythonStylePage(title: string, body: string, extraNav: string = '', heroText?: string): string {
  const description = heroText || '面向桌面与手机的统一控制台，覆盖模块状态、在线下载、配置热重载、用户管理与解析统计。';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${getPythonCSS()}</style>
</head>
<body>
  <div class="wrapper">
    <div class="hero shell">
      <div class="hero-copy loading-glow">
        <div class="eyebrow">LX API SERVER</div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
      </div>
      <div class="hero-side loading-glow">
        <div class="nav">
          <a class="btn secondary" href="/">首页</a>
          <a class="btn secondary" href="/admin">管理后台</a>
          ${extraNav}
        </div>
        <div class="hero-note">模块状态每 2 分钟自动刷新一次，后台也支持手动刷新。</div>
      </div>
    </div>
    ${body}
  </div>
</body>
</html>`;
}

// 管理页面包装器
export function adminPage(title: string, body: string, description: string = '管理操作页。完成当前操作后返回仪表盘，再进入其他模块。'): string {
  return pythonStylePage(
    title,
    body,
    '<a class="btn secondary" href="/admin/logout">退出</a>',
    description
  );
}

// HTML 转义
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// 获取 Python 风格的 CSS
function getPythonCSS(): string {
  return `
:root {
  color-scheme: light dark;
  --font-sans: "Söhne", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --font-serif: "Tiempos Text", "Source Han Serif SC", "Noto Serif SC", Georgia, serif;
  --bg: #f4f7fb;
  --bg-grad-top: rgba(17, 75, 140, 0.15);
  --bg-grad-main-start: #f9fbfe;
  --bg-grad-main-end: #eef4fa;
  --panel: #ffffff;
  --panel-soft: rgba(255, 255, 255, 0.86);
  --panel-accent-start: #ffffff;
  --panel-accent-end: #f7fbff;
  --panel-dark-start: #0f2744;
  --panel-dark-end: #143c6c;
  --ink: #102033;
  --muted: #5d6c7b;
  --line: #d9e2ec;
  --brand: #114b8c;
  --brand-soft: #eaf3ff;
  --brand-deep: #0a2e57;
  --ok: #177245;
  --warn: #b56a00;
  --bad: #b42318;
  --off: #687588;
  --code-bg: #f0f4f9;
  --notice-bg: #edf6ff;
  --notice-ink: #17406e;
  --notice-error-bg: #fff1ef;
  --shadow: 0 18px 48px rgba(16, 32, 51, 0.08);
  --hero-border: rgba(17, 75, 140, 0.08);
  --card-border: rgba(17, 75, 140, 0.08);
  --feature-border: rgba(17, 75, 140, 0.1);
  --feature-bg: rgba(255, 255, 255, 0.78);
  --summary-bg: rgba(255, 255, 255, 0.82);
  --table-shell-bg: rgba(255, 255, 255, 0.92);
  --table-shell-border: rgba(17, 75, 140, 0.08);
  --divider: rgba(255, 255, 255, 0.18);
  --dark-text-soft: rgba(255, 255, 255, 0.82);
  --dark-code-bg: rgba(255, 255, 255, 0.12);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #08131f;
    --bg-grad-top: rgba(62, 130, 210, 0.18);
    --bg-grad-main-start: #0a1624;
    --bg-grad-main-end: #07111c;
    --panel: #0f1b2a;
    --panel-soft: rgba(13, 24, 38, 0.9);
    --panel-accent-start: #102032;
    --panel-accent-end: #0c1827;
    --panel-dark-start: #142f52;
    --panel-dark-end: #102745;
    --ink: #e8f0f7;
    --muted: #9fb0c2;
    --line: #284258;
    --brand: #83b8ff;
    --brand-soft: #163250;
    --brand-deep: #c4defd;
    --ok: #6ad59b;
    --warn: #ffbf6b;
    --bad: #ff968f;
    --off: #93a6bb;
    --code-bg: #142436;
    --notice-bg: #11263d;
    --notice-ink: #d7e9ff;
    --notice-error-bg: #3a1b1f;
    --shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
    --hero-border: rgba(131, 184, 255, 0.16);
    --card-border: rgba(131, 184, 255, 0.14);
    --feature-border: rgba(131, 184, 255, 0.16);
    --feature-bg: rgba(16, 31, 48, 0.9);
    --summary-bg: rgba(16, 31, 48, 0.92);
    --table-shell-bg: rgba(11, 22, 35, 0.94);
    --table-shell-border: rgba(131, 184, 255, 0.18);
    --divider: rgba(255, 255, 255, 0.14);
    --dark-text-soft: rgba(236, 243, 250, 0.88);
    --dark-code-bg: rgba(255, 255, 255, 0.1);
  }
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: var(--font-sans);
  background:
    radial-gradient(circle at top left, var(--bg-grad-top) 0, rgba(17, 75, 140, 0) 26%),
    linear-gradient(180deg, var(--bg-grad-main-start) 0%, var(--bg-grad-main-end) 100%);
  color: var(--ink);
}
a { color: var(--brand); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrapper {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px 56px;
  animation: page-fade 0.6s ease-out;
}
.hero.shell {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
  gap: 18px;
  margin-bottom: 24px;
}
.hero-copy,
.hero-side {
  background: var(--panel-soft);
  backdrop-filter: blur(8px);
  border: 1px solid var(--hero-border);
  border-radius: 24px;
  padding: 22px;
  box-shadow: var(--shadow);
}
.hero h1,
.card h2,
.card h3 {
  font-family: var(--font-serif);
  letter-spacing: -0.02em;
}
.hero h1 {
  margin: 8px 0 0;
  font-size: clamp(28px, 5vw, 40px);
  line-height: 1.05;
}
.hero p { margin: 10px 0 0; color: var(--muted); font-size: 15px; }
.eyebrow { color: var(--brand); font-size: 11px; letter-spacing: 0.14em; font-weight: 800; }
.hero-note { margin-top: 18px; color: var(--muted); font-size: 13px; line-height: 1.6; }
.nav { display: flex; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.btn, button {
  border: 0;
  border-radius: 14px;
  background: var(--brand);
  color: #fff;
  padding: 11px 16px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}
.btn:hover, button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(17, 75, 140, 0.18);
  text-decoration: none;
}
.btn.secondary, .secondary {
  background: var(--brand-soft);
  color: var(--brand-deep);
}
.grid { display: grid; gap: 18px; }
.grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid.three { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.hero-panels, .lower-panels { margin-top: 0; }
.card {
  background: var(--panel);
  border: 1px solid var(--card-border);
  border-radius: 22px;
  padding: 20px;
  box-shadow: var(--shadow);
  min-width: 0;
  animation: card-rise 0.55s ease-out both;
}
.panel-accent {
  background: linear-gradient(180deg, var(--panel-accent-start) 0%, var(--panel-accent-end) 100%);
}
.panel-dark {
  background: linear-gradient(160deg, var(--panel-dark-start) 0%, var(--panel-dark-end) 100%);
  color: #fff;
}
.panel-dark .kv,
.panel-dark label,
.panel-dark .light,
.panel-dark .small,
.panel-dark code { color: var(--dark-text-soft); }
.panel-dark code { background: var(--dark-code-bg); }
.panel-dark input,
.panel-dark select,
.panel-dark textarea {
  background: rgba(255, 255, 255, 0.94);
  color: #102033;
}
.panel-top, .module-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.card h2, .card h3 { margin: 8px 0 12px; }
.status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.status.healthy { background: #e8fff1; color: var(--ok); }
.status.degraded { background: #fff3e5; color: var(--warn); }
.status.misconfigured { background: #fff0ef; color: var(--bad); }
.status.disabled { background: #eef2f6; color: var(--off); }
.module-card { min-height: 170px; }
.module-detail { min-height: 44px; line-height: 1.55; }
label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
input, select, textarea {
  width: 100%;
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 14px;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--ink);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(17, 75, 140, 0.12);
}
textarea { min-height: 180px; font-family: Consolas, monospace; }
form .row { margin-bottom: 14px; }
.inline-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.notice {
  padding: 12px 14px;
  border-radius: 14px;
  margin-bottom: 16px;
  background: var(--notice-bg);
  color: var(--notice-ink);
}
.notice.error { background: var(--notice-error-bg); color: var(--bad); }
.table-shell {
  width: 100%;
  border: 1px solid var(--table-shell-border);
  border-radius: 18px;
  overflow: hidden;
  background: var(--table-shell-bg);
}
.table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.table { width: 100%; border-collapse: collapse; min-width: 620px; }
.table th, .table td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); font-size: 14px; vertical-align: top; }
.kv { color: var(--muted); font-size: 13px; line-height: 1.6; }
code { background: var(--code-bg); padding: 2px 6px; border-radius: 8px; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.small { font-size: 12px; color: var(--muted); }
.metric-card h3 { margin: 6px 0; font-size: 28px; }
.compact-card { align-self: start; }
.compact-home-card { align-self: stretch; }
.result-card { max-width: 820px; }
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin: 18px 0;
}
.meta-grid strong { display: block; margin-top: 6px; }
.break-all { word-break: break-all; overflow-wrap: anywhere; }
.admin-grid { align-items: start; }
.stack-mobile { align-items: flex-start; }
.landing-card { min-height: 100%; }
.top-gap { margin-top: 16px; }
.login-card { max-width: 480px; margin: auto; }
.page-lead, .config-intro { margin-bottom: 18px; }
.config-grid { margin-top: 18px; }
.config-card form { height: 100%; }
.field-tag {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand-deep);
  font-size: 11px;
  font-weight: 700;
}
.summary-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 18px 0;
}
.summary-strip div {
  border: 1px solid var(--feature-border);
  border-radius: 16px;
  padding: 14px;
  background: var(--summary-bg);
}
.summary-strip span {
  display: block;
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 6px;
}
.summary-strip strong {
  font-family: var(--font-serif);
  font-size: 24px;
  line-height: 1;
}
.compact-status-grid .module-card {
  min-height: 152px;
}
.divider {
  height: 1px;
  margin: 18px 0;
  background: var(--divider);
}
.admin-card {
  overflow: hidden;
}
.admin-card form {
  width: 100%;
}
.project-badges {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
}
.project-badges span {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--feature-border);
  background: var(--feature-bg);
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
}
.project-copy {
  display: grid;
  gap: 12px;
}
.project-copy p {
  margin: 0;
}
.loading-glow {
  position: relative;
  overflow: hidden;
}
.loading-glow::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 0%, rgba(255, 255, 255, 0.24) 45%, transparent 100%);
  transform: translateX(-120%);
  animation: shimmer 2.6s ease-in-out infinite;
  pointer-events: none;
}
.refresh-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.refresh-indicator::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.7;
  animation: pulse-dot 1.8s ease-in-out infinite;
}

@keyframes page-fade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes card-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes shimmer {
  from { transform: translateX(-120%); }
  to { transform: translateX(140%); }
}

@keyframes pulse-dot {
  0%, 100% { transform: scale(0.8); opacity: 0.45; }
  50% { transform: scale(1.15); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .wrapper,
  .card,
  .btn,
  button,
  .loading-glow::after,
  .refresh-indicator::before {
    animation: none !important;
    transition: none !important;
  }
}

@media (max-width: 900px) {
  .wrapper { padding: 18px 12px 40px; }
  .hero.shell, .grid.two, .compact-home-grid { grid-template-columns: 1fr; }
  .grid.three { grid-template-columns: 1fr; }
  .nav { justify-content: flex-start; }
  .hero-copy, .hero-side, .card { border-radius: 18px; padding: 16px; }
  .inline-fields { grid-template-columns: 1fr; }
  .table { min-width: 560px; }
  .hero-panels { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  body { font-size: 14px; }
  .hero h1 { font-size: 28px; }
  h2 { font-size: 20px; }
  .btn, button { width: 100%; justify-content: center; padding: 12px 16px; }
  .nav .btn { width: auto; }
  .actions.stack-mobile .btn,
  .actions .btn { width: 100%; margin-bottom: 8px; }
  .actions { flex-direction: column; gap: 8px; }
  .table-shell {
    border-radius: 16px;
    border: 1px solid var(--table-shell-border);
    overflow-x: auto;
  }
  .table {
    font-size: 13px;
  }
  .table th, .table td {
    padding: 10px 8px;
  }
  /* 隐藏不重要的列 */
  .table .hide-mobile {
    display: none;
  }
  .card { padding: 14px; }
  .metric-card h3 { font-size: 32px; }
  .eyebrow { font-size: 10px; }
  /* 表单优化 */
  input, select, textarea {
    font-size: 16px; /* 防止 iOS 缩放 */
  }
  /* 统计卡片在移动端单列显示 */
  .hero-panels {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  /* 移动端优化间距 */
  .lower-panels { margin-top: 18px; }
}
    min-width: 520px;
  }
  textarea { min-height: 140px; }
  .summary-strip { grid-template-columns: 1fr; }
  .panel-top, .module-head { flex-direction: column; align-items: flex-start; }
  .card,
  .module-card,
  .compact-home-card,
  .admin-card {
    overflow: hidden;
  }
  .project-badges {
    flex-direction: column;
  }
}
  `;
}

// 健康检查页面
export function healthPage(data: {
  username: string;
  health: any[];
}): string {
  const { username, health } = data;

  // 统计
  const totalModules = health.length;
  const healthyModules = health.filter(h => h.status === 'healthy').length;
  const disabledModules = health.filter(h => h.status === 'disabled').length;
  const errorModules = health.filter(h => h.status === 'error').length;

  // 音源名称映射
  const sourceNames: Record<string, string> = {
    kg: '酷狗音乐',
    kw: '酷我音乐',
    tx: 'QQ音乐',
    wy: '网易云音乐',
    mg: '咪咕音乐'
  };

  // 状态映射
  const statusMap: Record<string, { text: string; color: string }> = {
    healthy: { text: '✅ 健康', color: '#22c55e' },
    disabled: { text: '⚪ 未启用', color: '#94a3b8' },
    error: { text: '❌ 异常', color: '#ef4444' }
  };

  const healthRows = health.map(h => {
    const statusInfo = statusMap[h.status] || { text: h.status, color: '#64748b' };
    const checkedTime = h.checked_at > 0
      ? new Date(h.checked_at * 1000).toLocaleString('zh-CN')
      : '-';

    return `
      <tr>
        <td>${sourceNames[h.source] || h.source}</td>
        <td><code>${h.source}</code></td>
        <td><span style="color: ${statusInfo.color}; font-weight: 600;">${statusInfo.text}</span></td>
        <td style="color: var(--muted);">${h.detail || '-'}</td>
        <td style="color: var(--muted); font-size: 13px;">${checkedTime}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>健康状态 - LX Music API</title>
<style>
:root {
  --bg: #f8fafc;
  --panel: #ffffff;
  --panel-accent-start: rgba(17, 75, 140, 0.04);
  --panel-accent-end: rgba(17, 75, 140, 0.01);
  --ink: #1e293b;
  --muted: #64748b;
  --line: #e2e8f0;
  --card-border: rgba(148, 163, 184, 0.14);
  --brand: #114b8c;
  --brand-deep: #0d3a6b;
  --brand-soft: #e8f1fa;
  --shadow: 0 2px 8px rgba(17, 75, 140, 0.06);
  --good: #22c55e;
  --bad: #ef4444;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.6;
}
.container { max-width: 1200px; margin: 0 auto; padding: 24px; }
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--line);
}
.header h1 { font-size: 28px; font-weight: 700; }
.user-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--brand-soft);
  color: var(--brand-deep);
  padding: 8px 14px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
}
.btn {
  display: inline-block;
  background: var(--brand);
  color: white;
  padding: 10px 18px;
  border-radius: 14px;
  text-decoration: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  border: none;
}
.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(17, 75, 140, 0.18);
}
.btn.secondary {
  background: var(--brand-soft);
  color: var(--brand-deep);
}
.card {
  background: var(--panel);
  border: 1px solid var(--card-border);
  border-radius: 22px;
  padding: 24px;
  box-shadow: var(--shadow);
  margin-bottom: 24px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.stat-card {
  background: var(--panel);
  border: 1px solid var(--card-border);
  border-radius: 18px;
  padding: 18px;
  text-align: center;
}
.stat-card .label {
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}
.stat-card .value {
  font-size: 32px;
  font-weight: 700;
  color: var(--ink);
}
table {
  width: 100%;
  border-collapse: collapse;
}
thead th {
  text-align: left;
  padding: 12px;
  background: var(--bg);
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  border-bottom: 2px solid var(--line);
}
tbody td {
  padding: 14px 12px;
  border-bottom: 1px solid var(--line);
}
tbody tr:hover {
  background: var(--bg);
}
code {
  background: var(--bg);
  padding: 2px 6px;
  border-radius: 6px;
  font-family: Consolas, monospace;
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .stat-card .value {
    font-size: 28px;
  }
  table {
    font-size: 13px;
  }
  thead th {
    font-size: 11px;
    padding: 10px 8px;
  }
  tbody td {
    padding: 12px 8px;
  }
  .header h1 {
    font-size: 24px;
  }
  .user-badge {
    font-size: 13px;
    padding: 6px 12px;
  }
  .card {
    padding: 18px;
  }
  .actions {
    flex-direction: column;
    gap: 10px;
  }
  .btn {
    width: 100%;
    justify-content: center;
  }
}
@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .stat-card .label {
    font-size: 11px;
  }
  .stat-card .value {
    font-size: 24px;
  }
  /* 隐藏不重要的列 */
  tbody td:nth-child(5) {
    display: none;
  }
  thead th:nth-child(5) {
    display: none;
  }
}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🏥 健康状态监控</h1>
    <div class="user-badge">👤 ${username}</div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="label">总音源数</div>
      <div class="value">${totalModules}</div>
    </div>
    <div class="stat-card">
      <div class="label">健康</div>
      <div class="value" style="color: var(--good);">${healthyModules}</div>
    </div>
    <div class="stat-card">
      <div class="label">未启用</div>
      <div class="value" style="color: var(--muted);">${disabledModules}</div>
    </div>
    <div class="stat-card">
      <div class="label">异常</div>
      <div class="value" style="color: var(--bad);">${errorModules}</div>
    </div>
  </div>

  <div class="card">
    <h2 style="margin-bottom: 18px;">音源状态详情</h2>
    <table>
      <thead>
        <tr>
          <th>音源名称</th>
          <th>标识</th>
          <th>状态</th>
          <th>详情</th>
          <th>检查时间</th>
        </tr>
      </thead>
      <tbody>
        ${healthRows}
      </tbody>
    </table>
  </div>

  <div class="actions">
    <a class="btn secondary" href="/admin">← 返回仪表盘</a>
    <button class="btn" onclick="location.reload()">🔄 刷新数据</button>
  </div>
</div>
</body>
</html>
  `;
}

// 登录页面
export function loginPage(): string {
  const body = `
    <section class="card login-card loading-glow">
      <h2>管理员登录</h2>
      <form method="post" action="/admin/login">
        <div class="row"><label>用户名</label><input name="username" required></div>
        <div class="row"><label>密码</label><input name="password" type="password" required></div>
        <button type="submit">登录后台</button>
      </form>
    </section>
  `;
  return pythonStylePage('管理员登录', body);
}

// 登录失败页面
export function loginErrorPage(message: string): string {
  const body = `
    <div class="notice error">${escapeHtml(message)}</div>
    <a class="btn secondary" href="/admin/login">返回登录</a>
  `;
  return pythonStylePage('管理员登录失败', body);
}

// 仪表盘页面
export function dashboardPage(data: {
  username: string;
  users: any[];
  health: any[];
  summary: any[];
  activeModules: number;
}): string {
  const { username, users, health, summary, activeModules } = data;

  // 最近活跃用户表格
  const summaryRows = summary.length > 0
    ? summary.slice(0, 8).map(row => `
        <tr>
          <td>${escapeHtml(row.username || '-')}</td>
          <td>${row.total || 0}</td>
          <td>${row.success_count || 0}</td>
          <td>${row.failure_count || 0}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="4">暂无统计</td></tr>';

  const body = `
    <div class="dashboard-top grid three">
      <section class="card metric-card loading-glow">
        <div class="eyebrow">ADMIN</div>
        <h3>${escapeHtml(username)}</h3>
        <p class="kv">当前登录管理员</p>
      </section>
      <section class="card metric-card loading-glow">
        <div class="eyebrow">USERS</div>
        <h3>${users.length}</h3>
        <p class="kv">已录入 API 用户数量</p>
      </section>
      <section class="card metric-card loading-glow">
        <div class="eyebrow">MODULES</div>
        <h3>${activeModules}</h3>
        <p class="kv">首页正在展示的启用模块数</p>
      </section>
    </div>
    <div class="grid two" style="margin-top:18px;">
      <section class="card panel-accent loading-glow">
        <h2>后台模块入口</h2>
        <p class="kv">从这里进入具体管理页。进入某个模块后，如需切换到别的模块，请先返回仪表盘。</p>
        <div class="actions stack-mobile">
          <a class="btn" href="/admin/config">配置管理</a>
          <a class="btn" href="/admin/users">用户管理</a>
          <a class="btn" href="/admin/stats">解析统计</a>
          <a class="btn" href="/admin/health">模块状态</a>
          <a class="btn secondary" href="/admin/logout">退出登录</a>
        </div>
      </section>
      <section class="card compact-card loading-glow">
        <h2>运行说明</h2>
        <p class="kv">配置保存后会立即生效（60秒缓存）。所有音源配置存储在数据库中，无需重新部署。修改配置后即可在前端测试。</p>
      </section>
    </div>
    <section class="card loading-glow" style="margin-top:18px;">
      <h2>最近活跃用户汇总</h2>
      <div class="table-shell"><div class="table-wrap">
        <table class="table">
          <thead><tr><th>用户</th><th>总次数</th><th>成功</th><th>失败</th></tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </div></div>
    </section>
  `;

  return adminPage('管理后台', body, '后台首页用于进入各个管理模块。切换模块时请先回到这里，再进入下一个页面。');
}

// 用户管理页面（AJAX 交互 + Python 风格）
export function usersPage(): string {
  const body = `
    <section class="card panel-accent page-lead loading-glow">
      <div class="panel-top">
        <div>
          <div class="eyebrow">USER MODULE</div>
          <h2>用户管理</h2>
        </div>
        <a class="btn secondary" href="/admin">返回仪表盘</a>
      </div>
      <p class="kv">管理 API 用户。创建用户时可自定义用户名和 API Key，也可留空自动生成。用户使用 name 和 key 调用音乐 API。</p>
    </section>

    <div id="alert" class="notice" style="display:none;"></div>

    <section class="card loading-glow" style="margin-top:18px;">
      <h2>新建用户</h2>
      <form id="createForm" onsubmit="return createUser(event)">
        <div class="inline-fields">
          <div class="row">
            <label>用户名</label>
            <input id="newName" name="name" placeholder="例如：user01" required>
          </div>
          <div class="row">
            <label>API Key（留空自动生成）</label>
            <input id="newKey" name="api_key" placeholder="留空则自动生成">
          </div>
        </div>
        <button type="submit">创建用户</button>
      </form>
    </section>

    <section class="card loading-glow" style="margin-top:18px;">
      <h2>用户列表</h2>
      <div class="table-shell"><div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>ID</th><th>用户名</th><th>API Key</th><th>状态</th><th>创建时间</th><th>最后使用</th><th>操作</th></tr>
          </thead>
          <tbody id="userTableBody">
            <tr><td colspan="7">加载中...</td></tr>
          </tbody>
        </table>
      </div></div>
    </section>

    <script>
      function showAlert(msg, isError) {
        const alert = document.getElementById('alert');
        alert.textContent = msg;
        alert.className = isError ? 'notice error' : 'notice';
        alert.style.display = 'block';
        setTimeout(() => { alert.style.display = 'none'; }, 3000);
      }

      function formatTime(ts) {
        if (!ts) return '-';
        const d = new Date(ts * 1000);
        return d.toLocaleString('zh-CN');
      }

      async function loadUsers() {
        try {
          const res = await fetch('/admin/api/users');
          const result = await res.json();
          const tbody = document.getElementById('userTableBody');

          if (result.code === 0 && result.data) {
            if (result.data.length === 0) {
              tbody.innerHTML = '<tr><td colspan="7">暂无用户</td></tr>';
              return;
            }
            tbody.innerHTML = result.data.map(u => \`
              <tr>
                <td>\${u.id}</td>
                <td>\${u.name}</td>
                <td><code>\${u.api_key}</code></td>
                <td>\${u.enabled ? '<span class="status healthy">启用</span>' : '<span class="status disabled">禁用</span>'}</td>
                <td>\${formatTime(u.created_at)}</td>
                <td>\${formatTime(u.last_used_at)}</td>
                <td>
                  <div class="actions">
                    <button onclick="resetKey(\${u.id})" class="secondary" style="padding:6px 10px;font-size:12px;">重置Key</button>
                    <button onclick="deleteUser(\${u.id}, '\${u.name}')" style="padding:6px 10px;font-size:12px;background:var(--bad);">删除</button>
                  </div>
                </td>
              </tr>
            \`).join('');
          }
        } catch (e) {
          showAlert('加载用户失败：' + e.message, true);
        }
      }

      async function createUser(e) {
        e.preventDefault();
        const name = document.getElementById('newName').value.trim();
        const api_key = document.getElementById('newKey').value.trim();

        if (!name) {
          showAlert('用户名不能为空', true);
          return false;
        }

        try {
          const res = await fetch('/admin/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, api_key })
          });
          const result = await res.json();

          if (result.code === 0) {
            showAlert('用户创建成功！API Key: ' + result.data.api_key);
            document.getElementById('newName').value = '';
            document.getElementById('newKey').value = '';
            loadUsers();
          } else {
            showAlert('创建失败：' + result.msg, true);
          }
        } catch (e) {
          showAlert('创建失败：' + e.message, true);
        }
        return false;
      }

      async function resetKey(id) {
        if (!confirm('确认重置该用户的 API Key？')) return;
        try {
          const res = await fetch('/admin/api/users/' + id + '/reset-key', { method: 'POST' });
          const result = await res.json();
          if (result.code === 0) {
            showAlert('API Key 已重置：' + result.data.api_key);
            loadUsers();
          } else {
            showAlert('重置失败：' + result.msg, true);
          }
        } catch (e) {
          showAlert('重置失败：' + e.message, true);
        }
      }

      async function deleteUser(id, name) {
        if (!confirm('确认删除用户「' + name + '」？')) return;
        try {
          const res = await fetch('/admin/api/users/' + id, { method: 'DELETE' });
          const result = await res.json();
          if (result.code === 0) {
            showAlert('用户已删除');
            loadUsers();
          } else {
            showAlert('删除失败：' + result.msg, true);
          }
        } catch (e) {
          showAlert('删除失败：' + e.message, true);
        }
      }

      window.addEventListener('DOMContentLoaded', loadUsers);
    </script>
  `;

  return adminPage('用户管理', body);
}

// 配置管理页面（AJAX 交互 + Python 分组卡片风格）
export function configPage(): string {
  const body = `
    <section class="card panel-accent config-intro loading-glow">
      <div class="panel-top">
        <div>
          <div class="eyebrow">CONFIG CENTER</div>
          <h2>分组配置管理</h2>
        </div>
        <a class="btn secondary" href="/admin">返回仪表盘</a>
      </div>
      <p class="kv">每个音源单独保存，配置存储在数据库中，保存后立即生效（60秒缓存），无需重新部署。修改后即可在前端测试。</p>
    </section>

    <div id="alert" class="notice" style="display:none;"></div>

    <div class="grid two admin-grid config-grid">
      <!-- 系统设置 -->
      <section class="card config-card loading-glow">
        <div class="panel-top">
          <div>
            <div class="eyebrow">CONFIG</div>
            <h2>系统设置</h2>
          </div>
          <button onclick="saveSystem()">保存本分组</button>
        </div>
        <p class="kv">控制用户认证、日志级别和速率限制等核心功能。</p>
        <div class="row">
          <label>启用用户认证</label>
          <select id="auth-enabled">
            <option value="false">关闭</option>
            <option value="true">开启</option>
          </select>
        </div>
        <div class="row">
          <label>日志级别</label>
          <select id="log-level">
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div class="row">
          <label>启用速率限制</label>
          <select id="rate-limit-enabled">
            <option value="true">开启</option>
            <option value="false">关闭</option>
          </select>
        </div>
        <div class="row">
          <label>每分钟请求限制</label>
          <input id="rate-limit-requests" type="number" value="100" min="1">
        </div>
      </section>

      <!-- 酷狗音乐 -->
      <section class="card config-card loading-glow">
        <div class="panel-top">
          <div>
            <div class="eyebrow">CONFIG</div>
            <h2>酷狗音乐</h2>
          </div>
          <button onclick="saveSource('kg')">保存本分组</button>
        </div>
        <p class="kv">酷狗音乐需要 token、userid 和 mid 三个参数，缺一不可。</p>
        <div class="row"><label>token</label><input id="kg-token" placeholder="酷狗音乐 Token"></div>
        <div class="row"><label>userid</label><input id="kg-userid" placeholder="酷狗用户 ID"></div>
        <div class="row"><label>mid</label><input id="kg-mid" placeholder="设备 MID"></div>
      </section>

      <!-- QQ 音乐 -->
      <section class="card config-card loading-glow">
        <div class="panel-top">
          <div>
            <div class="eyebrow">CONFIG</div>
            <h2>QQ 音乐</h2>
          </div>
          <button onclick="saveSource('tx')">保存本分组</button>
        </div>
        <p class="kv">QQ 音乐的 uin 与 qm_keyst 需要成对配置，从网页版 Cookie 获取。</p>
        <div class="row"><label>uin</label><input id="tx-uin" placeholder="QQ 音乐 UIN"></div>
        <div class="row"><label>qm_keyst</label><input id="tx-qm-keyst" placeholder="QQ 音乐 qm_keyst"></div>
      </section>

      <!-- 网易云音乐 -->
      <section class="card config-card loading-glow">
        <div class="panel-top">
          <div>
            <div class="eyebrow">CONFIG</div>
            <h2>网易云音乐</h2>
          </div>
          <button onclick="saveSource('wy')">保存本分组</button>
        </div>
        <p class="kv">网易云音乐需要完整的 Cookie 字符串。</p>
        <div class="row"><label>Cookie</label><textarea id="wy-cookie" rows="4" placeholder="完整的网易云音乐 Cookie"></textarea></div>
      </section>

      <!-- 咪咕音乐 -->
      <section class="card config-card loading-glow">
        <div class="panel-top">
          <div>
            <div class="eyebrow">CONFIG</div>
            <h2>咪咕音乐</h2>
          </div>
          <button onclick="saveSource('mg')">保存本分组</button>
        </div>
        <p class="kv">咪咕需要 by 与 session，User-Agent 按需调整。</p>
        <div class="row"><label>by</label><input id="mg-by" placeholder="咪咕音乐 by"></div>
        <div class="row"><label>session</label><input id="mg-session" placeholder="咪咕音乐 Session"></div>
        <div class="row"><label>User-Agent</label><textarea id="mg-useragent" rows="3" placeholder="咪咕音乐 User-Agent"></textarea></div>
      </section>

      <!-- 酷我音乐 -->
      <section class="card config-card loading-glow">
        <div class="panel-top">
          <div>
            <div class="eyebrow">CONFIG</div>
            <h2>酷我音乐</h2>
          </div>
          <button onclick="saveSource('kw')">保存本分组</button>
        </div>
        <p class="kv">酷我的 uid、token、device_id 缺一不可。</p>
        <div class="row"><label>uid</label><input id="kw-uid" placeholder="酷我音乐 UID"></div>
        <div class="row"><label>token</label><input id="kw-token" placeholder="酷我音乐 Token"></div>
        <div class="row"><label>device_id</label><input id="kw-device-id" placeholder="设备 ID"></div>
      </section>
    </div>

    <script>
      function showAlert(msg, isError) {
        const alert = document.getElementById('alert');
        alert.textContent = msg;
        alert.className = isError ? 'notice error' : 'notice';
        alert.style.display = 'block';
        setTimeout(() => { alert.style.display = 'none'; }, 3000);
      }

      async function loadConfigs() {
        try {
          const res = await fetch('/admin/api/configs/sources');
          const result = await res.json();
          if (result.code === 0) {
            const c = result.data;
            if (c.tx) {
              document.getElementById('tx-uin').value = c.tx.uin?.value || '';
              document.getElementById('tx-qm-keyst').value = c.tx.qm_keyst?.value || '';
            }
            if (c.wy) {
              document.getElementById('wy-cookie').value = c.wy.cookie?.value || '';
            }
            if (c.kg) {
              document.getElementById('kg-token').value = c.kg.token?.value || '';
              document.getElementById('kg-userid').value = c.kg.userid?.value || '';
              document.getElementById('kg-mid').value = c.kg.mid?.value || '';
            }
            if (c.mg) {
              document.getElementById('mg-by').value = c.mg.by?.value || '';
              document.getElementById('mg-session').value = c.mg.session?.value || '';
              document.getElementById('mg-useragent').value = c.mg.useragent?.value || '';
            }
            if (c.kw) {
              document.getElementById('kw-uid').value = c.kw.uid?.value || '';
              document.getElementById('kw-token').value = c.kw.token?.value || '';
              document.getElementById('kw-device-id').value = c.kw.device_id?.value || '';
            }
          }
        } catch (e) {
          console.error('加载配置失败:', e);
        }
      }

      async function loadSystem() {
        try {
          const res = await fetch('/admin/api/configs/system');
          const result = await res.json();
          if (result.code === 0) {
            const s = result.data;
            document.getElementById('auth-enabled').value = s.auth_enabled?.value || 'false';
            document.getElementById('log-level').value = s.log_level?.value || 'info';
            document.getElementById('rate-limit-enabled').value = s.rate_limit_enabled?.value || 'true';
            document.getElementById('rate-limit-requests').value = s.rate_limit_requests?.value || '100';
          }
        } catch (e) {
          console.error('加载系统设置失败:', e);
        }
      }

      async function saveSource(source) {
        const configs = {};
        if (source === 'tx') {
          configs.uin = document.getElementById('tx-uin').value.trim();
          configs.qm_keyst = document.getElementById('tx-qm-keyst').value.trim();
        } else if (source === 'wy') {
          configs.cookie = document.getElementById('wy-cookie').value.trim();
        } else if (source === 'kg') {
          configs.token = document.getElementById('kg-token').value.trim();
          configs.userid = document.getElementById('kg-userid').value.trim();
          configs.mid = document.getElementById('kg-mid').value.trim();
        } else if (source === 'mg') {
          configs.by = document.getElementById('mg-by').value.trim();
          configs.session = document.getElementById('mg-session').value.trim();
          configs.useragent = document.getElementById('mg-useragent').value.trim();
        } else if (source === 'kw') {
          configs.uid = document.getElementById('kw-uid').value.trim();
          configs.token = document.getElementById('kw-token').value.trim();
          configs.device_id = document.getElementById('kw-device-id').value.trim();
        }

        try {
          const res = await fetch('/admin/api/configs/sources/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source, configs })
          });
          const result = await res.json();
          if (result.code === 0) {
            showAlert('配置保存成功！');
          } else {
            showAlert('保存失败：' + result.msg, true);
          }
        } catch (e) {
          showAlert('保存失败：' + e.message, true);
        }
      }

      async function saveSystem() {
        const settings = [
          { setting_key: 'auth_enabled', setting_value: document.getElementById('auth-enabled').value },
          { setting_key: 'log_level', setting_value: document.getElementById('log-level').value },
          { setting_key: 'rate_limit_enabled', setting_value: document.getElementById('rate-limit-enabled').value },
          { setting_key: 'rate_limit_requests', setting_value: document.getElementById('rate-limit-requests').value }
        ];

        try {
          for (const s of settings) {
            await fetch('/admin/api/configs/system', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(s)
            });
          }
          showAlert('系统设置保存成功！');
        } catch (e) {
          showAlert('保存失败：' + e.message, true);
        }
      }

      window.addEventListener('DOMContentLoaded', () => {
        loadConfigs();
        loadSystem();
      });
    </script>
  `;

  return adminPage('配置管理', body);
}

// 统计页面（Python 风格）
export function statsPage(logs: any[]): string {
  const rows = logs.length > 0
    ? logs.map(log => `
        <tr>
          <td>${formatTimestamp(log.created_at)}</td>
          <td>${escapeHtml(log.username || '-')}</td>
          <td>${escapeHtml(log.source || '-')}</td>
          <td>${escapeHtml(log.method || '-')}</td>
          <td>${escapeHtml(log.song_id || '-')}</td>
          <td>${escapeHtml(log.quality || '-')}</td>
          <td>${log.success ? '<span class="status healthy">成功</span>' : '<span class="status misconfigured">失败</span>'}</td>
          <td>${escapeHtml(log.client_ip || '-')}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="8">暂无解析记录</td></tr>';

  // 计算统计摘要
  const total = logs.length;
  const success = logs.filter(l => l.success).length;
  const failure = total - success;

  const body = `
    <section class="card panel-accent page-lead loading-glow">
      <div class="panel-top">
        <div>
          <div class="eyebrow">STATS MODULE</div>
          <h2>解析统计</h2>
        </div>
        <a class="btn secondary" href="/admin">返回仪表盘</a>
      </div>
      <p class="kv">展示最近的解析请求记录，包括来源、音质、成功状态和客户端 IP。</p>
      <div class="summary-strip">
        <div><span>总请求数</span><strong>${total}</strong></div>
        <div><span>成功</span><strong>${success}</strong></div>
        <div><span>失败</span><strong>${failure}</strong></div>
      </div>
    </section>

    <section class="card loading-glow" style="margin-top:18px;">
      <h2>解析记录</h2>
      <div class="table-shell"><div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>时间</th><th>用户</th><th>来源</th><th>方法</th><th>歌曲ID</th><th>音质</th><th>状态</th><th>客户端IP</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div></div>
    </section>
  `;

  return adminPage('解析统计', body);
}

// 格式化时间戳
function formatTimestamp(ts: number): string {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleString('zh-CN');
}
