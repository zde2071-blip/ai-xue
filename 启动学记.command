#!/bin/zsh
cd "$(dirname "$0")" || exit 1
STUDY_PORT="${PORT:-8767}"
if curl -fsS "http://127.0.0.1:$STUDY_PORT/api/workspace" >/dev/null 2>&1; then
  open "http://127.0.0.1:$STUDY_PORT"
  exit 0
fi
if [[ -x .venv/bin/python3 ]]; then
  STUDY_PYTHON="$PWD/.venv/bin/python3"
elif [[ -x "${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" ]]; then
  STUDY_PYTHON="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
else
  STUDY_PYTHON="$(command -v python3)"
fi
if [[ -z "$STUDY_PYTHON" ]]; then
  echo "请安装 Python 3.11 或更新版本，再按 README 安装依赖。"
  read -r "?按回车关闭"
  exit 1
fi
(sleep 1; open "http://127.0.0.1:$STUDY_PORT") &
"$STUDY_PYTHON" server.py
read -r "?服务已停止。按回车关闭"
