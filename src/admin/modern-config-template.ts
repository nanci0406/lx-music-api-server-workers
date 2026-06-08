// 现代化配置管理页面 - 参考 Python 项目设计

export function modernConfigPage() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>配置管理 - LX Music API</title>
  <style>
${getModernStyles()}
  </style>
</head>
<body>
  <div class="wrapper">
    <!-- Hero Section -->
    <div class="hero">
      <div class="hero-copy">
        <div class="eyebrow">LX API SERVER</div>
        <h1>配置管理</h1>
        <p>在线配置音源参数，修改后实时生效无需重启。支持所有主流音乐平台的集中管理。</p>
      </div>
      <div class="hero-side">
        <div class="nav">
          <a class="btn secondary" href="/admin">仪表盘</a>
          <a class="btn secondary" href="/admin/users">用户管理</a>
          <a class="btn secondary" href="/admin/stats">统计</a>
          <a class="btn secondary" href="/admin/logout">退出</a>
        </div>
      </div>
    </div>

    <!-- Alerts -->
    <div class="alert success" id="successAlert"></div>
    <div class="alert error" id="errorAlert"></div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active" onclick="switchTab('basic')">基础设置</button>
      <button class="tab" onclick="switchTab('kg')">酷狗音乐</button>
      <button class="tab" onclick="switchTab('tx')">QQ 音乐</button>
      <button class="tab" onclick="switchTab('wy')">网易云音乐</button>
      <button class="tab" onclick="switchTab('mg')">咪咕音乐</button>
      <button class="tab" onclick="switchTab('kw')">酷我音乐</button>
    </div>

    <!-- 基础设置 -->
    <div class="tab-content active" id="basic-tab">
      <div class="card">
        <h2>系统基础设置</h2>
        <p class="description">控制用户认证、日志级别和速率限制等核心功能。保存后立即生效。</p>

        <div class="field-group">
          <label>
            <input type="checkbox" id="auth-enabled"> 启用用户认证
          </label>
          <small>开启后，所有 API 请求需要提供有效的用户名和 API Key</small>
        </div>

        <div class="field-group">
          <label for="log-level">日志级别</label>
          <select id="log-level">
            <option value="debug">Debug（调试）</option>
            <option value="info" selected>Info（信息）</option>
            <option value="warn">Warning（警告）</option>
            <option value="error">Error（错误）</option>
          </select>
          <small>控制日志输出的详细程度</small>
        </div>

        <div class="field-group">
          <label>
            <input type="checkbox" id="rate-limit-enabled" checked> 启用速率限制
          </label>
          <small>防止 API 滥用，建议开启</small>
        </div>

        <div class="field-group">
          <label for="rate-limit-requests">每分钟请求限制</label>
          <input type="number" id="rate-limit-requests" value="100" min="1">
          <small>单个用户每分钟最多请求次数</small>
        </div>

        <button class="btn primary" onclick="saveSystemSettings()">保存基础设置</button>
      </div>
    </div>

    <!-- 酷狗音乐 -->
    <div class="tab-content" id="kg-tab">
      <div class="card">
        <h2>🐕 酷狗音乐配置</h2>
        <p class="description">酷狗音乐需要 token、userid 和 mid 三个参数，缺一不可。</p>

        <div class="field-group">
          <label for="kg-token">Token</label>
          <input type="text" id="kg-token" placeholder="酷狗音乐 Token">
          <small>从酷狗音乐 APP 或网页版获取</small>
        </div>

        <div class="field-group">
          <label for="kg-userid">User ID</label>
          <input type="text" id="kg-userid" placeholder="酷狗用户 ID">
          <small>您的酷狗账号 User ID</small>
        </div>

        <div class="field-group">
          <label for="kg-mid">MID</label>
          <input type="text" id="kg-mid" placeholder="设备 MID">
          <small>设备唯一标识符</small>
        </div>

        <button class="btn primary" onclick="saveSourceConfig('kg')">保存酷狗配置</button>
      </div>
    </div>

    <!-- QQ 音乐 -->
    <div class="tab-content" id="tx-tab">
      <div class="card">
        <h2>🎼 QQ 音乐配置</h2>
        <p class="description">QQ 音乐需要 uin 和 qm_keyst 成对配置，可从网页版 Cookie 中获取。</p>

        <div class="field-group">
          <label for="tx-uin">UIN</label>
          <input type="text" id="tx-uin" placeholder="QQ 音乐 UIN">
          <small>打开 QQ 音乐网页版 → F12 → Application → Cookies → uin</small>
        </div>

        <div class="field-group">
          <label for="tx-qm-keyst">qm_keyst</label>
          <input type="text" id="tx-qm-keyst" placeholder="QQ 音乐 qm_keyst">
          <small>打开 QQ 音乐网页版 → F12 → Application → Cookies → qm_keyst</small>
        </div>

        <button class="btn primary" onclick="saveSourceConfig('tx')">保存 QQ 音乐配置</button>
      </div>
    </div>

    <!-- 网易云音乐 -->
    <div class="tab-content" id="wy-tab">
      <div class="card">
        <h2>☁️ 网易云音乐配置</h2>
        <p class="description">网易云音乐需要完整的 Cookie 字符串。</p>

        <div class="field-group">
          <label for="wy-cookie">Cookie</label>
          <textarea id="wy-cookie" rows="6" placeholder="完整的网易云音乐 Cookie"></textarea>
          <small>打开网易云音乐网页版 → F12 → Application → Cookies → 复制所有 Cookie</small>
        </div>

        <button class="btn primary" onclick="saveSourceConfig('wy')">保存网易云配置</button>
      </div>
    </div>

    <!-- 咪咕音乐 -->
    <div class="tab-content" id="mg-tab">
      <div class="card">
        <h2>🎵 咪咕音乐配置</h2>
        <p class="description">咪咕音乐需要 by、session 和 User-Agent。</p>

        <div class="field-group">
          <label for="mg-by">by</label>
          <input type="text" id="mg-by" placeholder="咪咕音乐 by">
          <small>从咪咕音乐请求头中获取</small>
        </div>

        <div class="field-group">
          <label for="mg-session">Session</label>
          <input type="text" id="mg-session" placeholder="咪咕音乐 Session">
          <small>从咪咕音乐 Cookie 中获取</small>
        </div>

        <div class="field-group">
          <label for="mg-useragent">User-Agent</label>
          <textarea id="mg-useragent" rows="3" placeholder="咪咕音乐 User-Agent"></textarea>
          <small>从咪咕音乐请求头中复制完整的 User-Agent</small>
        </div>

        <button class="btn primary" onclick="saveSourceConfig('mg')">保存咪咕配置</button>
      </div>
    </div>

    <!-- 酷我音乐 -->
    <div class="tab-content" id="kw-tab">
      <div class="card">
        <h2>🎹 酷我音乐配置</h2>
        <p class="description">酷我音乐需要 uid、token 和 device_id 三个参数。</p>

        <div class="field-group">
          <label for="kw-uid">UID</label>
          <input type="text" id="kw-uid" placeholder="酷我音乐 UID">
          <small>您的酷我账号 UID</small>
        </div>

        <div class="field-group">
          <label for="kw-token">Token</label>
          <input type="text" id="kw-token" placeholder="酷我音乐 Token">
          <small>从酷我音乐获取的认证 Token</small>
        </div>

        <div class="field-group">
          <label for="kw-device-id">Device ID</label>
          <input type="text" id="kw-device-id" placeholder="设备 ID">
          <small>设备唯一标识符</small>
        </div>

        <button class="btn primary" onclick="saveSourceConfig('kw')">保存酷我配置</button>
      </div>
    </div>
  </div>

  <script>
${getConfigScript()}
  </script>
</body>
</html>
  `;
}

function getModernStyles() {
  return `
:root {
  color-scheme: light dark;
  --font-sans: "Söhne", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --bg: #f4f7fb;
  --bg-grad-top: rgba(17, 75, 140, 0.15);
  --bg-grad-main-start: #f9fbfe;
  --bg-grad-main-end: #eef4fa;
  --panel: #ffffff;
  --ink: #102033;
  --muted: #5d6c7b;
  --line: #d9e2ec;
  --brand: #114b8c;
  --brand-soft: #eaf3ff;
  --brand-deep: #0a2e57;
  --ok: #177245;
  --warn: #b56a00;
  --bad: #b42318;
  --shadow: 0 18px 48px rgba(16, 32, 51, 0.08);
  --card-border: rgba(17, 75, 140, 0.08);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #08131f;
    --bg-grad-top: rgba(62, 130, 210, 0.18);
    --bg-grad-main-start: #0a1624;
    --bg-grad-main-end: #07111c;
    --panel: #0f1b2a;
    --ink: #e8f0f7;
    --muted: #9fb0c2;
    --line: #284258;
    --brand: #83b8ff;
    --brand-soft: #163250;
    --brand-deep: #c4defd;
    --ok: #6ad59b;
    --warn: #ffbf6b;
    --bad: #ff968f;
    --shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
    --card-border: rgba(131, 184, 255, 0.14);
  }
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: var(--font-sans);
  background: radial-gradient(circle at top left, var(--bg-grad-top) 0, rgba(17, 75, 140, 0) 26%),
              linear-gradient(180deg, var(--bg-grad-main-start) 0%, var(--bg-grad-main-end) 100%);
  color: var(--ink);
  line-height: 1.6;
  min-height: 100vh;
}

.wrapper {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px 56px;
  animation: page-fade 0.6s ease-out;
}

@keyframes page-fade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.hero {
  background: var(--panel);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  padding: 32px;
  margin-bottom: 32px;
  box-shadow: var(--shadow);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 32px;
}

.hero-copy .eyebrow {
  font-size: 12px;
  font-weight: 600;
  color: var(--brand);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.hero-copy h1 {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 12px;
}

.hero-copy p {
  font-size: 16px;
  color: var(--muted);
}

.nav {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  display: inline-block;
  border: none;
}

.btn.primary {
  background: var(--brand);
  color: white;
}

.btn.primary:hover {
  background: var(--brand-deep);
}

.btn.secondary {
  background: var(--brand-soft);
  color: var(--brand);
}

.btn.secondary:hover {
  background: var(--brand);
  color: white;
}

.card {
  background: var(--panel);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: var(--shadow);
}

.card h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
}

.card .description {
  font-size: 14px;
  color: var(--muted);
  margin-bottom: 24px;
}

.field-group {
  margin-bottom: 20px;
}

.field-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}

.field-group input[type="text"],
.field-group input[type="number"],
.field-group textarea,
.field-group select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 14px;
  background: var(--panel);
  color: var(--ink);
  font-family: var(--font-sans);
}

.field-group input:focus,
.field-group textarea:focus,
.field-group select:focus {
  outline: none;
  border-color: var(--brand);
}

.field-group textarea {
  resize: vertical;
  font-family: monospace;
}

.field-group small {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
}

.tabs {
  display: flex;
  gap: 8px;
  border-bottom: 2px solid var(--line);
  margin-bottom: 24px;
  overflow-x: auto;
}

.tab {
  padding: 12px 20px;
  background: transparent;
  border: none;
  font-size: 15px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
  white-space: nowrap;
}

.tab:hover {
  color: var(--ink);
}

.tab.active {
  color: var(--brand);
  border-bottom-color: var(--brand);
}

.tab-content {
  display: none;
  animation: tab-fade 0.3s ease-out;
}

.tab-content.active {
  display: block;
}

@keyframes tab-fade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.alert {
  padding: 14px 18px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 14px;
  display: none;
}

.alert.show {
  display: block;
  animation: slide-down 0.3s ease-out;
}

@keyframes slide-down {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.alert.success {
  background: rgba(23, 114, 69, 0.1);
  color: var(--ok);
  border: 1px solid var(--ok);
}

.alert.error {
  background: rgba(180, 35, 24, 0.1);
  color: var(--bad);
  border: 1px solid var(--bad);
}

@media (max-width: 768px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
  }
}
  `;
}

function getConfigScript() {
  return `
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  event.target.classList.add('active');
  document.getElementById(tabName + '-tab').classList.add('active');
}

function showAlert(type, message) {
  const alertId = type === 'success' ? 'successAlert' : 'errorAlert';
  const alert = document.getElementById(alertId);
  alert.textContent = message;
  alert.classList.add('show');

  setTimeout(() => {
    alert.classList.remove('show');
  }, 3000);
}

async function loadConfigs() {
  try {
    const response = await fetch('/admin/api/configs/sources');
    const result = await response.json();

    if (result.code === 0) {
      const configs = result.data;

      if (configs.tx) {
        document.getElementById('tx-uin').value = configs.tx.uin?.value || '';
        document.getElementById('tx-qm-keyst').value = configs.tx.qm_keyst?.value || '';
      }

      if (configs.wy) {
        document.getElementById('wy-cookie').value = configs.wy.cookie?.value || '';
      }

      if (configs.kg) {
        document.getElementById('kg-token').value = configs.kg.token?.value || '';
        document.getElementById('kg-userid').value = configs.kg.userid?.value || '';
        document.getElementById('kg-mid').value = configs.kg.mid?.value || '';
      }

      if (configs.mg) {
        document.getElementById('mg-by').value = configs.mg.by?.value || '';
        document.getElementById('mg-session').value = configs.mg.session?.value || '';
        document.getElementById('mg-useragent').value = configs.mg.useragent?.value || '';
      }

      if (configs.kw) {
        document.getElementById('kw-uid').value = configs.kw.uid?.value || '';
        document.getElementById('kw-token').value = configs.kw.token?.value || '';
        document.getElementById('kw-device-id').value = configs.kw.device_id?.value || '';
      }
    }
  } catch (error) {
    console.error('加载配置失败:', error);
  }
}

async function loadSystemSettings() {
  try {
    const response = await fetch('/admin/api/configs/system');
    const result = await response.json();

    if (result.code === 0) {
      const settings = result.data;

      document.getElementById('auth-enabled').checked = settings.auth_enabled?.value === 'true';
      document.getElementById('log-level').value = settings.log_level?.value || 'info';
      document.getElementById('rate-limit-enabled').checked = settings.rate_limit_enabled?.value === 'true';
      document.getElementById('rate-limit-requests').value = settings.rate_limit_requests?.value || '100';
    }
  } catch (error) {
    console.error('加载系统设置失败:', error);
  }
}

async function saveSourceConfig(source) {
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
    const response = await fetch('/admin/api/configs/sources/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, configs })
    });

    const result = await response.json();

    if (result.code === 0) {
      showAlert('success', '配置保存成功！');
    } else {
      showAlert('error', '保存失败：' + result.msg);
    }
  } catch (error) {
    showAlert('error', '保存失败：' + error.message);
  }
}

async function saveSystemSettings() {
  const settings = [
    {
      setting_key: 'auth_enabled',
      setting_value: document.getElementById('auth-enabled').checked ? 'true' : 'false'
    },
    {
      setting_key: 'log_level',
      setting_value: document.getElementById('log-level').value
    },
    {
      setting_key: 'rate_limit_enabled',
      setting_value: document.getElementById('rate-limit-enabled').checked ? 'true' : 'false'
    },
    {
      setting_key: 'rate_limit_requests',
      setting_value: document.getElementById('rate-limit-requests').value
    }
  ];

  try {
    for (const setting of settings) {
      await fetch('/admin/api/configs/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setting)
      });
    }

    showAlert('success', '系统设置保存成功！');
  } catch (error) {
    showAlert('error', '保存失败：' + error.message);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadConfigs();
  loadSystemSettings();
});
  `;
}
