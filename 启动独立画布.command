#!/bin/bash
set -e
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/node/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
    echo "未找到 Node.js，请安装后重试。"
    read -r -p "按回车关闭…"
    exit 1
fi
node scripts/start-local.mjs || read -r -p "启动失败；按回车关闭…"
