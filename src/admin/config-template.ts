// 配置管理页面模板

export function configPage() {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>配置管理 - LX Music API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
    }
    .header {
      background: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 20px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { color: #333; font-size: 24px; }
    .nav { display: flex; gap: 20px; }
    .nav a {
      color: #667eea;
      text-decoration: none;
      padding: 8px 16px;
      border-radius: 5px;
      transition: background 0.3s;
    }
    .nav a:hover { background: #f0f0f0; }
    .container {
      max-width: 1200px;
      margin: 40px auto;
      padding: 0 20px;
    }
    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      border-bottom: 2px solid #ddd;
    }
    .tab {
      padding: 12px 24px;
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 16px;
      color: #666;
      border-bottom: 3px solid transparent;
      transition: all 0.3s;
    }
    .tab.active {
      color: #667eea;
      border-bottom-color: #667eea;
    }
    .tab:hover { background: #f0f0f0; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .card {
      background: white;
      border-radius: 10px;
      padding: 30px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .card h2 {
      margin-bottom: 20px;
      color: #333;
      font-size: 20px;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: #555;
      font-weight: 500;
    }
    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 5px;
      font-size: 14px;
      font-family: monospace;
    }
    .form-group textarea {
      min-height: 100px;
      resize: vertical;
    }
    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    .form-group small {
      display: block;
      margin-top: 5px;
      color: #888;
      font-size: 12px;
    }
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.3s;
    }
    .btn-primary {
      background: #667eea;
      color: white;
    }
    .btn-primary:hover { background: #5568d3; }
    .btn-success {
      background: #48bb78;
      color: white;
    }
    .btn-success:hover { background: #38a169; }
    .alert {
      padding: 12px 16px;
      border-radius: 5px;
      margin-bottom: 20px;
      display: none;
    }
    .alert.show { display: block; }
    .alert-success {
      background: #c6f6d5;
      color: #22543d;
      border: 1px solid #9ae6b4;
    }
    .alert-error {
      background: #fed7d7;
      color: #742a2a;
      border: 1px solid #fc8181;
    }
    .source-section {
      margin-bottom: 30px;
      padding-bottom: 30px;
      border-bottom: 1px solid #e0e0e0;
    }
    .source-section:last-child {
      border-bottom: none;
    }
    .source-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .source-title {
      font-size: 18px;
      font-weight: 600;
      color: #333;
    }
    .source-status {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .status-enabled {
      background: #c6f6d5;
      color: #22543d;
    }
    .status-disabled {
      background: #fed7d7;
      color: #742a2a;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎵 LX Music API 管理后台</h1>
    <nav class="nav">
      <a href="/admin">仪表盘</a>
      <a href="/admin/users">用户管理</a>
      <a href="/admin/config">配置管理</a>
      <a href="/admin/stats">统计</a>
      <a href="/admin/logout">登出</a>
    </nav>
  </div>

  <div class="container">
    <div class="alert alert-success" id="successAlert"></div>
    <div class="alert alert-error" id="errorAlert"></div>

    <div class="tabs">
      <button class="tab active" onclick="switchTab('sources')">音源配置</button>
      <button class="tab" onclick="switchTab('system')">系统设置</button>
    </div>

    <!-- 音源配置 -->
    <div class="tab-content active" id="sources-tab">
      <div class="card">
        <h2>🎵 音源配置管理</h2>

        <!-- QQ音乐 -->
        <div class="source-section">
          <div class="source-header">
            <span class="source-title">🎼 QQ音乐 (tx)</span>
            <span class="source-status status-enabled" id="tx-status">已启用</span>
          </div>
          <div class="form-group">
            <label for="tx-uin">UIN</label>
            <input type="text" id="tx-uin" placeholder="QQ音乐 UIN">
            <small>从 QQ音乐网页版 Cookie 中获取</small>
          </div>
          <div class="form-group">
            <label for="tx-qm-keyst">qm_keyst</label>
            <input type="text" id="tx-qm-keyst" placeholder="QQ音乐 qm_keyst">
            <small>从 QQ音乐网页版 Cookie 中获取</small>
          </div>
          <button class="btn btn-primary" onclick="saveSourceConfig('tx')">保存 QQ音乐配置</button>
        </div>

        <!-- 网易云音乐 -->
        <div class="source-section">
          <div class="source-header">
            <span class="source-title">☁️ 网易云音乐 (wy)</span>
            <span class="source-status status-enabled" id="wy-status">已启用</span>
          </div>
          <div class="form-group">
            <label for="wy-cookie">Cookie</label>
            <textarea id="wy-cookie" placeholder="网易云音乐 Cookie"></textarea>
            <small>从网易云音乐网页版获取完整的 Cookie</small>
          </div>
          <button class="btn btn-primary" onclick="saveSourceConfig('wy')">保存网易云配置</button>
        </div>

        <!-- 酷狗音乐 -->
        <div class="source-section">
          <div class="source-header">
            <span class="source-title">🐕 酷狗音乐 (kg)</span>
            <span class="source-status status-enabled" id="kg-status">已启用</span>
          </div>
          <div class="form-group">
            <label for="kg-token">Token</label>
            <input type="text" id="kg-token" placeholder="酷狗音乐 Token">
            <small>酷狗账号的 Token</small>
          </div>
          <div class="form-group">
            <label for="kg-userid">User ID</label>
            <input type="text" id="kg-userid" placeholder="酷狗音乐 User ID">
            <small>酷狗账号的 User ID</small>
          </div>
          <div class="form-group">
            <label for="kg-mid">MID</label>
            <input type="text" id="kg-mid" placeholder="酷狗音乐 MID">
            <small>设备的 MID</small>
          </div>
          <button class="btn btn-primary" onclick="saveSourceConfig('kg')">保存酷狗配置</button>
        </div>
      </div>
    </div>

    <!-- 系统设置 -->
    <div class="tab-content" id="system-tab">
      <div class="card">
        <h2>⚙️ 系统设置</h2>

        <div class="form-group">
          <label for="auth-enabled">
            <input type="checkbox" id="auth-enabled"> 启用用户认证
          </label>
          <small>启用后，所有 API 请求需要提供有效的用户名和 API Key</small>
        </div>

        <div class="form-group">
          <label for="log-level">日志级别</label>
          <select id="log-level" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px;">
            <option value="debug">Debug</option>
            <option value="info" selected>Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
          <small>控制日志详细程度</small>
        </div>

        <div class="form-group">
          <label for="rate-limit-enabled">
            <input type="checkbox" id="rate-limit-enabled" checked> 启用速率限制
          </label>
          <small>防止 API 滥用</small>
        </div>

        <div class="form-group">
          <label for="rate-limit-requests">每分钟请求限制</label>
          <input type="number" id="rate-limit-requests" value="100" min="1">
          <small>单个用户每分钟最多请求次数</small>
        </div>

        <button class="btn btn-success" onclick="saveSystemSettings()">保存系统设置</button>
      </div>
    </div>
  </div>

  <script>
    // 切换标签页
    function switchTab(tabName) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      event.target.classList.add('active');
      document.getElementById(tabName + '-tab').classList.add('active');
    }

    // 显示提示消息
    function showAlert(type, message) {
      const alertId = type === 'success' ? 'successAlert' : 'errorAlert';
      const alert = document.getElementById(alertId);
      alert.textContent = message;
      alert.classList.add('show');

      setTimeout(() => {
        alert.classList.remove('show');
      }, 3000);
    }

    // 加载配置
    async function loadConfigs() {
      try {
        const response = await fetch('/admin/api/configs/sources');
        const result = await response.json();

        if (result.code === 0) {
          const configs = result.data;

          // 填充 QQ音乐配置
          if (configs.tx) {
            document.getElementById('tx-uin').value = configs.tx.uin?.value || '';
            document.getElementById('tx-qm-keyst').value = configs.tx.qm_keyst?.value || '';
          }

          // 填充网易云配置
          if (configs.wy) {
            document.getElementById('wy-cookie').value = configs.wy.cookie?.value || '';
          }

          // 填充酷狗配置
          if (configs.kg) {
            document.getElementById('kg-token').value = configs.kg.token?.value || '';
            document.getElementById('kg-userid').value = configs.kg.userid?.value || '';
            document.getElementById('kg-mid').value = configs.kg.mid?.value || '';
          }
        }
      } catch (error) {
        console.error('加载配置失败:', error);
      }
    }

    // 加载系统设置
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

    // 保存音源配置
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

    // 保存系统设置
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

    // 页面加载时加载配置
    window.addEventListener('DOMContentLoaded', () => {
      loadConfigs();
      loadSystemSettings();
    });
  </script>
</body>
</html>
  `;
}
