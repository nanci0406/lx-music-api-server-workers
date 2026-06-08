// HTML 模板

export function loginPage(error?: string) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理员登录 - LX Music API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-box {
      background: white;
      padding: 40px;
      border-radius: 10px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      width: 100%;
      max-width: 400px;
    }
    h1 { margin-bottom: 30px; color: #333; text-align: center; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 5px; color: #555; font-weight: 500; }
    input {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 5px;
      font-size: 14px;
    }
    input:focus { outline: none; border-color: #667eea; }
    button {
      width: 100%;
      padding: 12px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.3s;
    }
    button:hover { background: #5568d3; }
    .error {
      background: #fee;
      color: #c33;
      padding: 10px;
      border-radius: 5px;
      margin-bottom: 20px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>🎵 LX Music API</h1>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/admin/login">
      <div class="form-group">
        <label>用户名</label>
        <input type="text" name="username" required autofocus>
      </div>
      <div class="form-group">
        <label>密码</label>
        <input type="password" name="password" required>
      </div>
      <button type="submit">登录</button>
    </form>
  </div>
</body>
</html>
  `;
}

export function dashboardPage(data: any) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理后台 - LX Music API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
    }
    .header {
      background: white;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { color: #333; }
    .nav {
      display: flex;
      gap: 20px;
    }
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
      margin: 30px auto;
      padding: 0 20px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .card h2 {
      color: #333;
      margin-bottom: 15px;
      font-size: 18px;
    }
    .stat {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .stat:last-child { border-bottom: none; }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge.healthy { background: #d4edda; color: #155724; }
    .badge.degraded { background: #fff3cd; color: #856404; }
    .badge.disabled { background: #f8d7da; color: #721c24; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎵 LX Music API 管理后台</h1>
    <nav class="nav">
      <a href="/admin">仪表盘</a>
      <a href="/admin/users">用户管理</a>
      <a href="/admin/stats">统计</a>
      <a href="/admin/logout">登出</a>
    </nav>
  </div>
  <div class="container">
    <div class="cards">
      <div class="card">
        <h2>📊 系统状态</h2>
        <div class="stat">
          <span>总用户数</span>
          <strong>${data.users.length}</strong>
        </div>
        <div class="stat">
          <span>最近请求数</span>
          <strong>${data.logs.length}</strong>
        </div>
      </div>
      <div class="card">
        <h2>🎵 音源状态</h2>
        ${data.health.map((h: any) => `
          <div class="stat">
            <span>${h.source.toUpperCase()}</span>
            <span class="badge ${h.status}">${h.status}</span>
          </div>
        `).join('')}
      </div>
      <div class="card">
        <h2>📝 最近日志</h2>
        ${data.logs.slice(0, 5).map((log: any) => `
          <div class="stat">
            <span>${log.source} - ${log.method}</span>
            <span>${log.success ? '✅' : '❌'}</span>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

export function usersPage(users: any[]) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>用户管理 - LX Music API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
    }
    .header {
      background: white;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .nav {
      display: flex;
      gap: 20px;
    }
    .nav a {
      color: #667eea;
      text-decoration: none;
      padding: 8px 16px;
      border-radius: 5px;
    }
    .nav a:hover { background: #f0f0f0; }
    .container {
      max-width: 1200px;
      margin: 30px auto;
      padding: 0 20px;
    }
    .card {
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #f0f0f0;
    }
    th { background: #f8f9fa; font-weight: 600; }
    button {
      padding: 6px 12px;
      background: #dc3545;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover { background: #c82333; }
  </style>
</head>
<body>
  <div class="header">
    <h1>用户管理</h1>
    <nav class="nav">
      <a href="/admin">仪表盘</a>
      <a href="/admin/users">用户管理</a>
      <a href="/admin/stats">统计</a>
      <a href="/admin/logout">登出</a>
    </nav>
  </div>
  <div class="container">
    <div class="card">
      <h2>用户列表</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>用户名</th>
            <th>API Key</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(user => `
            <tr>
              <td>${user.id}</td>
              <td>${user.name}</td>
              <td><code>${user.api_key}</code></td>
              <td>${user.enabled ? '✅ 启用' : '❌ 禁用'}</td>
              <td>${new Date(user.created_at * 1000).toLocaleString('zh-CN')}</td>
              <td>
                <button onclick="deleteUser(${user.id})">删除</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
  <script>
    function deleteUser(id) {
      if (!confirm('确定删除该用户？')) return;
      fetch('/admin/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'user_id=' + id
      }).then(() => location.reload());
    }
  </script>
</body>
</html>
  `;
}

export function statsPage(logs: any[]) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>统计 - LX Music API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
    }
    .header {
      background: white;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .nav {
      display: flex;
      gap: 20px;
    }
    .nav a {
      color: #667eea;
      text-decoration: none;
      padding: 8px 16px;
      border-radius: 5px;
    }
    .nav a:hover { background: #f0f0f0; }
    .container {
      max-width: 1200px;
      margin: 30px auto;
      padding: 0 20px;
    }
    .card {
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #f0f0f0;
    }
    th { background: #f8f9fa; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1>请求统计</h1>
    <nav class="nav">
      <a href="/admin">仪表盘</a>
      <a href="/admin/users">用户管理</a>
      <a href="/admin/stats">统计</a>
      <a href="/admin/logout">登出</a>
    </nav>
  </div>
  <div class="container">
    <div class="card">
      <h2>最近 100 条请求</h2>
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>用户</th>
            <th>音源</th>
            <th>方法</th>
            <th>歌曲ID</th>
            <th>音质</th>
            <th>状态</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(log => `
            <tr>
              <td>${new Date(log.created_at * 1000).toLocaleString('zh-CN')}</td>
              <td>${log.username || '-'}</td>
              <td>${log.source}</td>
              <td>${log.method}</td>
              <td>${log.song_id || '-'}</td>
              <td>${log.quality || '-'}</td>
              <td>${log.success ? '✅' : '❌'}</td>
              <td>${log.client_ip}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>
  `;
}

// 导出现代化配置页面
export { modernConfigPage as configPage } from './modern-config-template';
