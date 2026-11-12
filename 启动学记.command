#!/bin/zsh
cd "$(dirname "$0")" || exit 1
STUDY_PORT="${PORT:-8767}"
STUDY_RUNTIME="$HOME/Library/Application Support/AI Xue/venv/bin/python3"
if [[ -x "$STUDY_RUNTIME" ]]; then
  STUDY_PYTHON="$STUDY_RUNTIME"
elif [[ -x .venv/bin/python3 ]]; then
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
STUDY_URL="http://127.0.0.1:$STUDY_PORT/"
if "$STUDY_PYTHON" tools/local_service.py --check --port "$STUDY_PORT"; then
  open "$STUDY_URL"
  exit 0
fi
STUDY_SERVICE="gui/$(id -u)/local.ai-xue.timetable-rules"
if [[ "$STUDY_PORT" == 8767 ]] && launchctl print "$STUDY_SERVICE" >/dev/null 2>&1; then
  launchctl kickstart -k "$STUDY_SERVICE"
  for STUDY_ATTEMPT in {1..20}; do
    if "$STUDY_PYTHON" tools/local_service.py --check --port "$STUDY_PORT"; then
      open "$STUDY_URL"
      exit 0
    fi
    sleep 0.5
  done
  echo "学习服务暂时无法启动，请查看 ~/Library/Logs/AI Xue/server.err.log。"
else
  (
    for STUDY_ATTEMPT in {1..20}; do
      if "$STUDY_PYTHON" tools/local_service.py --check --port "$STUDY_PORT"; then
        open "$STUDY_URL"
        exit 0
      fi
      sleep 0.5
    done
  ) &
  "$STUDY_PYTHON" tools/local_service.py --port "$STUDY_PORT"
fi
read -r "?服务已停止。按回车关闭"
