"""Launch the installed application without OS-specific shell commands."""
import subprocess
import sys
from pathlib import Path

if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    python = root / '.venv' / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    if not python.is_file():
        raise SystemExit('请先运行 python setup.py。')
    raise SystemExit(subprocess.call([str(python), str(root/'server.py')], cwd=root))
