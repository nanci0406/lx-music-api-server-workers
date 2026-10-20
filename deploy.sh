#!/usr/bin/env bash
# LX Music API Server (Workers) - 一键部署脚本(Linux / macOS)
#
# 会依次完成：安装依赖 → 登录 Cloudflare → 创建 D1 数据库 → 部署 → 设置管理员密码
# 可以重复执行：已有的数据库会直接使用，升级时再运行一次即可。

set -euo pipefail
cd "$(dirname "$0")"

DB_NAME="lx-music-api-db"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
step() { echo; echo -e "${CYAN}━━ $1${NC}"; }
ok() { echo -e "${GREEN}✔ $1${NC}"; }
warn() { echo -e "${YELLOW}! $1${NC}"; }
fail() { echo -e "${RED}✘ $1${NC}"; exit 1; }

wrangler() { npx --no-install wrangler "$@"; }

step "1/5 检查环境"
command -v node >/dev/null || fail "没有找到 Node.js，请先安装 Node.js 20 或更高版本：https://nodejs.org/"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js 版本太低($(node -v))，需要 20 或更高版本"
ok "Node.js $(node -v)"

step "2/5 安装依赖"
npm install --no-audit --no-fund
ok "依赖安装完成(wrangler $(wrangler --version 2>/dev/null | head -1))"

step "3/5 登录 Cloudflare"
if ! wrangler whoami --json >/dev/null 2>&1; then
  echo "即将打开浏览器登录 Cloudflare……"
  wrangler login
fi
# 登录的用户有多个账号时选一个(只对这次运行生效；也可以提前设置环境变量 CLOUDFLARE_ACCOUNT_ID)
ACCOUNTS_JSON=$(wrangler whoami --json)
ACCOUNT_COUNT=$(node -e 'console.log((JSON.parse(process.argv[1]).accounts||[]).length)' "$ACCOUNTS_JSON" 2>/dev/null || echo 0)
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] && [ "$ACCOUNT_COUNT" -gt 1 ]; then
  echo "这个用户有多个 Cloudflare 账号："
  node -e 'JSON.parse(process.argv[1]).accounts.forEach((a,i)=>console.log(`  ${i+1}. ${a.name} (${a.id})`))' "$ACCOUNTS_JSON"
  read -rp "选择要部署到的账号 [1]: " CHOICE
  export CLOUDFLARE_ACCOUNT_ID=$(node -e 'console.log(JSON.parse(process.argv[1]).accounts[Number(process.argv[2])-1].id)' "$ACCOUNTS_JSON" "${CHOICE:-1}")
fi
ok "已登录${CLOUDFLARE_ACCOUNT_ID:+(账号 $CLOUDFLARE_ACCOUNT_ID)}"

step "4/5 准备 D1 数据库"
# 部署时 wrangler 会按名字使用这个数据库；这里提前创建，是为了把主节点放在离国内更近的亚太地区
find_db() {
  wrangler d1 list --json 2>/dev/null | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try{const db=JSON.parse(s).find(x=>x.name===process.argv[1]);console.log(db?db.uuid:"")}catch{console.log("")}
    })' "$DB_NAME"
}
DB_ID=$(find_db)
if [ -z "$DB_ID" ]; then
  echo "创建数据库 $DB_NAME(主节点放在亚太地区，离国内更近)……"
  wrangler d1 create "$DB_NAME" --location apac >/dev/null
  DB_ID=$(find_db)
  [ -n "$DB_ID" ] || fail "创建数据库失败，请执行 npx wrangler d1 create $DB_NAME 查看原因"
  ok "数据库已创建"
else
  ok "使用已有的数据库($DB_ID)"
fi

step "5/5 部署(表结构会在第一次访问时自动创建)"
DEPLOY_OUTPUT=$(wrangler deploy 2>&1) || { echo "$DEPLOY_OUTPUT"; fail "部署失败"; }
echo "$DEPLOY_OUTPUT" | tail -5
URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' <<<"$DEPLOY_OUTPUT" | head -1 || true)
ok "部署完成"

echo
echo "设置管理员密码：直接回车跳过，稍后在浏览器里打开管理后台创建管理员"
read -rsp "管理员密码(至少 8 位): " ADMIN_PASSWORD; echo
if [ -n "$ADMIN_PASSWORD" ]; then
  [ ${#ADMIN_PASSWORD} -ge 8 ] || fail "密码至少需要 8 位，请重新运行脚本"
  printf '%s' "$ADMIN_PASSWORD" | wrangler secret put ADMIN_PASSWORD >/dev/null
  ok "已设置(用户名 admin，只在还没有管理员时生效)"
fi

echo
echo -e "${GREEN}全部完成！${NC}"
if [ -n "$URL" ]; then
  echo "  首页      $URL/"
  echo "  管理后台  $URL/admin"
  echo "  音源脚本  $URL/script?key=<用户的 Key>"
fi
[ -n "${ADMIN_PASSWORD:-}" ] || warn "请尽快打开管理后台创建管理员账号，在此之前任何人打开后台都可以创建"
