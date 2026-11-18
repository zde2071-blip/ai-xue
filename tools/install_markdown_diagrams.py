"""Install the pinned local Mermaid runtime without requiring Node.js."""

import argparse
import hashlib
import shutil
import tarfile
import tempfile
from pathlib import Path
from urllib.request import urlopen


VERSION = '12.3.0'
URL = f'https://registry.npmjs.org/mermaid/-/mermaid-{VERSION}.tgz'
ARCHIVE_SHA256 = 'be0684e8d20bfc874df12c0f04927a5c482f57f2200eec54cca52a4583fd4040'
VENDOR = Path(__file__).resolve().parents[1] / 'web' / 'vendor'


def digest(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def install(archive=None):
    files = {
        'package/dist/mermaid.min.js': VENDOR / 'mermaid-runtime.js',
        'package/LICENSE': VENDOR / 'licenses' / 'mermaid-LICENSE',
    }
    stamp = VENDOR / 'mermaid-runtime.version'
    if stamp.is_file() and stamp.read_text() == VERSION and all(path.is_file() for path in files.values()):
        return
    with tempfile.TemporaryDirectory() as temporary:
        if archive is None:
            archive = Path(temporary) / 'mermaid.tgz'
            with urlopen(URL, timeout=90) as response, archive.open('wb') as file:
                shutil.copyfileobj(response, file)
        if digest(archive) != ARCHIVE_SHA256:
            raise ValueError('Mermaid 安装文件校验失败，请重新下载。')
        with tarfile.open(archive, 'r:gz') as package:
            for member, destination in files.items():
                destination.parent.mkdir(parents=True, exist_ok=True)
                with package.extractfile(member) as source, tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as output:
                    staged = Path(output.name)
                    shutil.copyfileobj(source, output)
                staged.replace(destination)
        stamp.write_text(VERSION)
        print(f'Mermaid {VERSION} 已安装。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Use a previously downloaded npm archive.')
    install(parser.parse_args().archive)
