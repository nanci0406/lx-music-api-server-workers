@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: LX Music API Server - 一键部署脚本 (Windows)

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 🚀 LX Music API Server - 一键部署脚本
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 欢迎使用 LX Music API Server 自动部署工具！
echo.
echo 本脚本将帮助你完成以下操作：
echo   1. 检查环境依赖
echo   2. 安装必要工具
echo   3. 登录 Cloudflare
echo   4. 创建 D1 数据库
echo   5. 初始化数据库
echo   6. 部署到 Cloudflare Workers
echo.
pause

:: 步骤 1: 检查环境
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 步骤 1/6: 检查环境依赖
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

echo ℹ️  检查 Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js 未安装
    echo ℹ️  请先安装 Node.js 18 或更高版本: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✅ Node.js 已安装: %NODE_VERSION%

echo ℹ️  检查 npm...
npm -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm 未安装
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo ✅ npm 已安装: %NPM_VERSION%

:: 步骤 2: 安装 Wrangler
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 步骤 2/6: 安装 Wrangler CLI
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

wrangler --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ℹ️  正在安装 Wrangler...
    call npm install -g wrangler
    if %errorlevel% neq 0 (
        echo ❌ Wrangler 安装失败
        pause
        exit /b 1
    )
    echo ✅ Wrangler 安装完成
) else (
    for /f "tokens=*" %%i in ('wrangler --version') do set WRANGLER_VERSION=%%i
    echo ✅ Wrangler 已安装: !WRANGLER_VERSION!
)

:: 步骤 3: 登录 Cloudflare
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 步骤 3/6: 登录 Cloudflare
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

echo ℹ️  即将打开浏览器进行 Cloudflare 登录...
echo ⚠️  如果已经登录，可以跳过此步骤
pause

call wrangler login
if %errorlevel% neq 0 (
    echo ❌ 登录失败，请检查网络连接
    pause
    exit /b 1
)
echo ✅ 登录成功

:: 步骤 4: 创建 D1 数据库
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 步骤 4/6: 创建 D1 数据库
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

echo ℹ️  正在创建数据库...
call wrangler d1 create lx-music-api-db > db_output.txt 2>&1

findstr /C:"database_id" db_output.txt >nul
if %errorlevel% equ 0 (
    echo ✅ 数据库创建成功

    :: 提取 database_id (简化版本，手动提示用户)
    echo.
    echo ℹ️  请从下方输出中复制 database_id:
    type db_output.txt | findstr /C:"database_id"
    echo.
    set /p DATABASE_ID="请输入 database_id: "

    if exist wrangler.toml (
        echo ℹ️  正在更新配置文件...
        powershell -Command "(Get-Content wrangler.toml) -replace 'database_id = \".*\"', 'database_id = \"%DATABASE_ID%\"' | Set-Content wrangler.toml"
        echo ✅ 配置文件已更新
    ) else (
        echo ⚠️  未找到 wrangler.toml 文件
    )
) else (
    findstr /C:"already exists" db_output.txt >nul
    if %errorlevel% equ 0 (
        echo ⚠️  数据库已存在，跳过创建
    ) else (
        echo ❌ 创建数据库失败
        type db_output.txt
        del db_output.txt
        pause
        exit /b 1
    )
)
del db_output.txt

:: 步骤 5: 初始化数据库
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 步骤 5/6: 初始化数据库
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

if exist src\db\schema.sql (
    echo ℹ️  正在执行数据库迁移...
    call wrangler d1 execute lx-music-api-db --remote --file=./src/db/schema.sql
    if %errorlevel% neq 0 (
        echo ⚠️  数据库迁移可能失败（如果数据库已初始化过，可忽略）
    )
    echo ✅ 数据库初始化完成
) else (
    echo ❌ 未找到数据库迁移文件
    pause
    exit /b 1
)

:: 步骤 6: 安装依赖并部署
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 步骤 6/6: 部署到 Cloudflare Workers
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

echo ℹ️  正在安装项目依赖...
call npm install
if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)
echo ✅ 依赖安装完成

echo ℹ️  正在部署到 Cloudflare Workers...
call npm run deploy > deploy_output.txt 2>&1

findstr /C:"https://" deploy_output.txt | findstr /C:"workers.dev" >nul
if %errorlevel% equ 0 (
    echo ✅ 部署成功！

    echo.
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo 🎉 部署完成！
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo.
    echo 你的音乐 API 服务已成功部署！
    echo.
    echo 📍 请从下方输出中查看你的部署地址：
    type deploy_output.txt | findstr /C:"https://" | findstr /C:"workers.dev"
    echo.
    echo 🔐 默认管理员账号：
    echo    用户名: admin
    echo    密码: admin123
    echo.
    echo ⚠️  重要提示：
    echo    1. 请立即登录管理后台修改默认密码
    echo    2. 在配置管理中填入各音源的 Cookie
    echo    3. 创建 API 用户并获取 API Key
    echo.
    echo ✅ 部署完成！
) else (
    echo ❌ 部署失败
    type deploy_output.txt
    del deploy_output.txt
    pause
    exit /b 1
)

del deploy_output.txt
echo.
pause
