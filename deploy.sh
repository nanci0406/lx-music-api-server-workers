#!/bin/bash

# LX Music API Server - 一键部署脚本
# 适用于 Linux/macOS

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印函数
print_header() {
    echo ""
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        return 1
    fi
    return 0
}

# 主函数
main() {
    clear
    print_header "🚀 LX Music API Server - 一键部署脚本"

    echo -e "${CYAN}欢迎使用 LX Music API Server 自动部署工具！${NC}"
    echo ""
    echo "本脚本将帮助你完成以下操作："
    echo "  1. 检查环境依赖"
    echo "  2. 安装必要工具"
    echo "  3. 登录 Cloudflare"
    echo "  4. 创建 D1 数据库"
    echo "  5. 初始化数据库"
    echo "  6. 部署到 Cloudflare Workers"
    echo ""
    read -p "按 Enter 键开始部署，或按 Ctrl+C 取消... "

    # 步骤 1: 检查环境
    print_header "步骤 1/6: 检查环境依赖"

    print_info "检查 Node.js..."
    if check_command node; then
        NODE_VERSION=$(node -v)
        print_success "Node.js 已安装: $NODE_VERSION"
    else
        print_error "Node.js 未安装"
        print_info "请先安装 Node.js 18 或更高版本: https://nodejs.org/"
        exit 1
    fi

    print_info "检查 npm..."
    if check_command npm; then
        NPM_VERSION=$(npm -v)
        print_success "npm 已安装: $NPM_VERSION"
    else
        print_error "npm 未安装"
        exit 1
    fi

    # 步骤 2: 安装 Wrangler
    print_header "步骤 2/6: 安装 Wrangler CLI"

    if check_command wrangler; then
        WRANGLER_VERSION=$(wrangler --version)
        print_success "Wrangler 已安装: $WRANGLER_VERSION"
    else
        print_info "正在安装 Wrangler..."
        npm install -g wrangler
        print_success "Wrangler 安装完成"
    fi

    # 步骤 3: 登录 Cloudflare
    print_header "步骤 3/6: 登录 Cloudflare"

    print_info "即将打开浏览器进行 Cloudflare 登录..."
    print_warning "如果已经登录，可以跳过此步骤"
    read -p "按 Enter 键继续登录... "

    wrangler login || {
        print_error "登录失败，请检查网络连接"
        exit 1
    }
    print_success "登录成功"

    # 步骤 4: 创建 D1 数据库
    print_header "步骤 4/6: 创建 D1 数据库"

    print_info "正在创建数据库..."
    DB_OUTPUT=$(wrangler d1 create lx-music-api-db 2>&1)

    if echo "$DB_OUTPUT" | grep -q "database_id"; then
        print_success "数据库创建成功"

        # 提取 database_id
        DATABASE_ID=$(echo "$DB_OUTPUT" | grep "database_id" | awk -F'"' '{print $2}')
        print_info "数据库 ID: $DATABASE_ID"

        # 更新 wrangler.toml
        print_info "正在更新配置文件..."
        if [ -f "wrangler.toml" ]; then
            # 备份原文件
            cp wrangler.toml wrangler.toml.bak

            # 替换 database_id
            sed -i.tmp "s/database_id = \".*\"/database_id = \"$DATABASE_ID\"/" wrangler.toml
            rm -f wrangler.toml.tmp

            print_success "配置文件已更新"
        else
            print_warning "未找到 wrangler.toml 文件"
        fi
    else
        # 数据库可能已存在
        if echo "$DB_OUTPUT" | grep -q "already exists"; then
            print_warning "数据库已存在，跳过创建"
        else
            print_error "创建数据库失败"
            echo "$DB_OUTPUT"
            exit 1
        fi
    fi

    # 步骤 5: 初始化数据库
    print_header "步骤 5/6: 初始化数据库"

    if [ -f "src/db/schema.sql" ]; then
        print_info "正在执行数据库迁移..."
        wrangler d1 execute lx-music-api-db --remote --file=./src/db/schema.sql || {
            print_warning "数据库迁移可能失败（如果数据库已初始化过，可忽略）"
        }
        print_success "数据库初始化完成"
    else
        print_error "未找到数据库迁移文件"
        exit 1
    fi

    # 步骤 6: 安装依赖并部署
    print_header "步骤 6/6: 部署到 Cloudflare Workers"

    print_info "正在安装项目依赖..."
    npm install || {
        print_error "依赖安装失败"
        exit 1
    }
    print_success "依赖安装完成"

    print_info "正在部署到 Cloudflare Workers..."
    DEPLOY_OUTPUT=$(npm run deploy 2>&1)

    if echo "$DEPLOY_OUTPUT" | grep -q "https://"; then
        print_success "部署成功！"

        # 提取部署地址
        WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -o "https://[^[:space:]]*workers.dev" | head -1)

        echo ""
        print_header "🎉 部署完成！"

        echo -e "${GREEN}你的音乐 API 服务已成功部署！${NC}"
        echo ""
        echo -e "${CYAN}📍 访问地址：${NC}"
        echo -e "   🏠 项目首页: ${BLUE}$WORKER_URL/${NC}"
        echo -e "   🎛️  管理后台: ${BLUE}$WORKER_URL/admin${NC}"
        echo -e "   📦 音源脚本: ${BLUE}$WORKER_URL/script?key=你的KEY${NC}"
        echo ""
        echo -e "${CYAN}🔐 默认管理员账号：${NC}"
        echo -e "   用户名: ${YELLOW}admin${NC}"
        echo -e "   密码: ${YELLOW}admin123${NC}"
        echo ""
        echo -e "${RED}⚠️  重要提示：${NC}"
        echo -e "   1. 请立即登录管理后台修改默认密码"
        echo -e "   2. 在配置管理中填入各音源的 Cookie"
        echo -e "   3. 创建 API 用户并获取 API Key"
        echo ""
        print_success "部署完成！"
    else
        print_error "部署失败"
        echo "$DEPLOY_OUTPUT"
        exit 1
    fi
}

# 错误处理
trap 'print_error "脚本执行出错，请检查错误信息"; exit 1' ERR

# 运行主函数
main
