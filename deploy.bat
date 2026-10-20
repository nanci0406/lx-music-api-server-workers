@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

:: LX Music API Server (Workers) - 一键部署脚本(Windows)
:: 依次完成：安装依赖 → 登录 Cloudflare → 创建 D1 数据库 → 初始化表结构 → 部署 → 设置管理员密码
:: 可以重复执行：已有的数据库会直接使用，升级时再运行一次即可。

set DB_NAME=lx-music-api-db

echo.
echo ━━ 1/6 检查环境
where node >nul 2>&1 || (echo 没有找到 Node.js，请先安装 Node.js 20 或更高版本：https://nodejs.org/ & pause & exit /b 1)
for /f "tokens=*" %%i in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%i
if !NODE_MAJOR! LSS 20 (echo Node.js 版本太低，需要 20 或更高版本 & pause & exit /b 1)
for /f "tokens=*" %%i in ('node -v') do echo √ Node.js %%i

echo.
echo ━━ 2/6 安装依赖
call npm install --no-audit --no-fund || (echo 依赖安装失败 & pause & exit /b 1)

echo.
echo ━━ 3/6 登录 Cloudflare
call npx --no-install wrangler whoami --json >nul 2>&1
if errorlevel 1 (
  echo 即将打开浏览器登录 Cloudflare……
  call npx --no-install wrangler login || (echo 登录失败 & pause & exit /b 1)
)
:: 登录的用户有多个账号时选一个(只对这次运行生效；也可以提前设置环境变量 CLOUDFLARE_ACCOUNT_ID)
call npx --no-install wrangler whoami --json > "%TEMP%\lx-whoami.json"
if "%CLOUDFLARE_ACCOUNT_ID%"=="" (
  for /f "tokens=*" %%i in ('node -e "const a=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).accounts||[];console.log(a.length)" "%TEMP%\lx-whoami.json"') do set ACCOUNT_COUNT=%%i
  if !ACCOUNT_COUNT! GTR 1 (
    echo 这个用户有多个 Cloudflare 账号：
    node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).accounts.forEach((a,i)=>console.log('  '+(i+1)+'. '+a.name+' ('+a.id+')'))" "%TEMP%\lx-whoami.json"
    set CHOICE=1
    set /p CHOICE=选择要部署到的账号 [1]: 
    for /f "tokens=*" %%i in ('node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).accounts[Number(process.argv[2])-1].id)" "%TEMP%\lx-whoami.json" !CHOICE!') do set CLOUDFLARE_ACCOUNT_ID=%%i
  )
)
del "%TEMP%\lx-whoami.json" >nul 2>&1
echo √ 已登录

echo.
echo ━━ 4/6 准备 D1 数据库
call :find_db
if "!DB_ID!"=="" (
  echo 创建数据库 %DB_NAME%^(主节点放在亚太地区，离国内更近^)……
  call npx --no-install wrangler d1 create %DB_NAME% --location apac >nul
  call :find_db
  if "!DB_ID!"=="" (echo 创建数据库失败，请执行 npx wrangler d1 create %DB_NAME% 查看原因 & pause & exit /b 1)
  echo √ 数据库已创建
) else (
  echo √ 使用已有的数据库
)
node -e "const fs=require('fs');fs.writeFileSync('wrangler.toml',fs.readFileSync('wrangler.toml','utf8').replace(/^database_id *= *\".*\"/m,'database_id = \"'+process.argv[1]+'\"'))" "!DB_ID!"
echo √ database_id = !DB_ID!

echo.
echo ━━ 5/6 初始化表结构
call npx --no-install wrangler d1 execute %DB_NAME% --remote --file=./src/db/schema.sql >nul || (echo 初始化表结构失败 & pause & exit /b 1)
echo √ 表结构已就绪

echo.
echo ━━ 6/6 部署
call npx --no-install wrangler deploy || (echo 部署失败 & pause & exit /b 1)

echo.
echo 设置管理员密码：直接回车跳过，稍后在浏览器里打开管理后台创建管理员
set ADMIN_PASSWORD=
set /p ADMIN_PASSWORD=管理员密码(至少 8 位，输入时会显示):
if not "!ADMIN_PASSWORD!"=="" (
  node -e "process.exit(process.argv[1].length>=8?0:1)" "!ADMIN_PASSWORD!" || (echo 密码至少需要 8 位，请重新运行脚本 & pause & exit /b 1)
  node -e "process.stdout.write(process.argv[1])" "!ADMIN_PASSWORD!" | npx --no-install wrangler secret put ADMIN_PASSWORD >nul
  echo √ 已设置^(用户名 admin，只在还没有管理员时生效^)
) else (
  echo ! 请尽快打开管理后台 /admin 创建管理员账号，在此之前任何人打开后台都可以创建
)

echo.
echo 全部完成！管理后台地址为部署输出里的 https://….workers.dev/admin
pause
exit /b 0

:find_db
set DB_ID=
for /f "tokens=*" %%i in ('npx --no-install wrangler d1 list --json 2^>nul ^| node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const db=JSON.parse(s).find(x=>x.name===process.argv[1]);console.log(db?db.uuid:'')}catch{console.log('')}})" %DB_NAME%') do set DB_ID=%%i
exit /b 0
