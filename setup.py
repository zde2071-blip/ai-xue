"""Bootstrap AI Xue with the same steps on Windows, macOS and Linux."""
import subprocess
import sys
import venv
from pathlib import Path

if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    environment = root / '.venv'
    if not environment.exists():
        venv.EnvBuilder(with_pip=True).create(environment)
    python = environment / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    subprocess.run([str(python), '-m', 'pip', 'install', '-r', str(root/'requirements.txt')], check=True)
    subprocess.run([str(python), str(root/'tools/install_reading_tools.py')], check=True)
    print('安装完成。运行 python start.py，然后打开 http://127.0.0.1:8767/')
