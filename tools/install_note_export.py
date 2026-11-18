"""Install the verified Pandoc release used for local note export."""

import argparse
import hashlib
import platform
import shutil
import subprocess
import tarfile
import tempfile
import zipfile
from pathlib import Path
from urllib.request import urlopen


VERSION = '3.14'
BIN = Path(__file__).resolve().parent / 'note-export-runtime'
ARCHIVES = {
    ('Darwin', 'arm64'): ('arm64-macOS.zip', '58d6593884fec9d4424b641b92503c316d9c36decb2891ff8d73ae74dd3b6304'),
    ('Darwin', 'x86_64'): ('x86_64-macOS.zip', '891708579061e7b1c1a6ce0df30ebb3cb2b6d0ca045ed3c8554ab830c1e0c270'),
    ('Linux', 'x86_64'): ('linux-amd64.tar.gz', 'c5f4720cdefb3f7bdc5d07202ef579feef0d1370773c873804dd8fdaa8c4f1b8'),
    ('Linux', 'aarch64'): ('linux-arm64.tar.gz', 'c692f3d78a415741bbbac4cdbbbe26fa7edca1f43d2301b982fbf4009cc8cf7f'),
    ('Windows', 'AMD64'): ('windows-x86_64.zip', '0144b96e8c7b023fd382ec5ef5bdc475e873f1019d6fa72502492df2c9a94a3b'),
}


def install(archive=None):
    system = platform.system()
    key = (system, platform.machine())
    if key not in ARCHIVES:
        print('此平台请从 pandoc.org 手动安装 Pandoc，安装后可导出 Word。')
        return
    executable = 'pandoc.exe' if system == 'Windows' else 'pandoc'
    target = BIN / executable
    if target.is_file() and archive is None:
        try:
            result = subprocess.run([str(target), '--version'], capture_output=True, text=True, check=True, timeout=5)
            if result.stdout.splitlines()[0] == 'pandoc ' + VERSION:
                return
        except (OSError, IndexError, subprocess.SubprocessError):
            pass
    suffix, expected = ARCHIVES[key]
    filename = f'pandoc-{VERSION}-{suffix}'
    BIN.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=BIN) as temporary:
        directory = Path(temporary)
        if archive is None:
            archive = directory / filename
            url = f'https://github.com/jgm/pandoc/releases/download/{VERSION}/{filename}'
            with urlopen(url, timeout=90) as response, archive.open('wb') as output:
                shutil.copyfileobj(response, output)
        with archive.open('rb') as source:
            if hashlib.file_digest(source, 'sha256').hexdigest() != expected:
                raise ValueError('Pandoc 安装文件校验失败。')
        prepared = directory / executable
        if suffix.endswith('.zip'):
            with zipfile.ZipFile(archive) as package:
                member = next(name for name in package.namelist() if Path(name).name == executable)
                with package.open(member) as source, prepared.open('wb') as output:
                    shutil.copyfileobj(source, output)
        else:
            with tarfile.open(archive) as package:
                member = next(item for item in package if item.isfile() and Path(item.name).name == executable)
                with package.extractfile(member) as source, prepared.open('wb') as output:
                    shutil.copyfileobj(source, output)
        prepared.chmod(0o755)
        subprocess.run([str(prepared), '--version'], stdout=subprocess.DEVNULL, check=True, timeout=10)
        prepared.replace(target)
    print(f'Pandoc {VERSION} 已安装。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path)
    install(parser.parse_args().archive)
