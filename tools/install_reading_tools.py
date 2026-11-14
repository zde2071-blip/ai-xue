#!/usr/bin/env python3
"""Install pinned, local-only reading assets. Does not modify the user's vault/config."""
import argparse
from contextlib import closing
import sys
import tarfile
import csv
import hashlib
import shutil
import sqlite3
import ssl
import tempfile
import urllib.request
import zipfile
from pathlib import Path
import certifi
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from reading_paths import MODEL_ROOT, SPEECH_ROOT

MODELS = {
 'translate-en_zh-1_9': '433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab',
 'translate-zh_en-1_9': '62e7af5a3a48b530e47b7b3e5c78c2de79073ecd815750d2bf3ab35b4a67da2d',
}
DICT_HASH='d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc'

def download(url, path, digest=None):
    if not path.exists():
        with urllib.request.urlopen(url, context=ssl.create_default_context(cafile=certifi.where()), timeout=60) as response, path.open('wb') as out:
            shutil.copyfileobj(response, out)
    if digest and hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
        raise ValueError(f'{path.name} 校验失败，未安装。')
    return path

def install(destination, cache):
    destination.mkdir(parents=True, exist_ok=True)
    for name,digest in MODELS.items():
        if (destination/name/'model/model.bin').is_file():continue
        package=download('https://data.argosopentech.com/argospm/v1/'+name+'.argosmodel',cache/(name+'.argosmodel'),digest)
        with tempfile.TemporaryDirectory(dir=destination) as temporary, zipfile.ZipFile(package) as archive:
            temporary=Path(temporary)
            for entry in archive.infolist():
                parts=Path(entry.filename).parts
                if not parts or parts[0]!=name or '..' in parts or entry.is_dir():continue
                # Keep weights, tokenizer and attribution; no executable code or unused Stanza weights.
                if len(parts)>1 and parts[1] not in ('model','metadata.json','sentencepiece.model','README.md'):continue
                target=temporary.joinpath(*parts);target.parent.mkdir(parents=True,exist_ok=True)
                with archive.open(entry) as source,target.open('wb') as out:shutil.copyfileobj(source,out)
            shutil.move(str(temporary/name),str(destination/name))
        print(name+' installed',flush=True)
    if not (destination/'ecdict.sqlite3').exists():
        csv_path=download('https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv',cache/'ecdict.csv',DICT_HASH)
        with tempfile.TemporaryDirectory(dir=destination) as temporary:
            dbpath=Path(temporary)/'ecdict.sqlite3'
            with closing(sqlite3.connect(dbpath)) as db,csv_path.open(encoding='utf-8-sig',newline='') as source:
                db.execute('CREATE TABLE entries (word TEXT PRIMARY KEY, translation TEXT NOT NULL)')
                db.executemany('INSERT OR REPLACE INTO entries VALUES (?,?)',((r['word'].casefold(),r['translation'].replace('\\n','\n')) for r in csv.DictReader(source) if r['translation']))
                db.commit()
            shutil.move(str(dbpath),str(destination/'ecdict.sqlite3'))
        download('https://raw.githubusercontent.com/skywind3000/ECDICT/master/LICENSE',destination/'ECDICT-LICENSE.txt')
        print('ECDICT installed',flush=True)

def install_speech(destination, cache):
    name = 'kokoro-multi-lang-v1_0'
    required = ('model.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt','LICENSE','README.md')
    if all((destination/name/file).is_file() for file in required):
        return
    if (destination/name).exists():
        raise ValueError('已有语音目录不完整，请换一个空的 --speech-destination 后重新安装。')
    destination.mkdir(parents=True,exist_ok=True)
    package = download('https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/'+name+'.tar.bz2',
        cache/(name+'.tar.bz2'), '60703707bc05ccd48d60e1eb723f38b07d6e474795a0b6a588d7220400e0f7a4')
    # sherpa-onnx 2 uses the supplied lexicons, not the old espeak/GPL payload.
    keep = {'model.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt','LICENSE','README.md'}
    with tempfile.TemporaryDirectory(dir=destination) as temporary, tarfile.open(package) as archive:
        temporary = Path(temporary)
        for entry in archive:
            parts = Path(entry.name).parts
            if len(parts)!=2 or parts[0]!=name or parts[1] not in keep or not entry.isfile():
                continue
            target = temporary.joinpath(*parts)
            target.parent.mkdir(parents=True,exist_ok=True)
            with archive.extractfile(entry) as source, target.open('wb') as out:
                shutil.copyfileobj(source,out)
        if any(not (temporary/name/file).is_file() for file in keep):
            raise ValueError('语音包不完整，未安装。')
        shutil.move(str(temporary/name),str(destination/name))
    print('Kokoro speech installed',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--destination',type=Path,default=MODEL_ROOT)
    parser.add_argument('--cache',type=Path)
    parser.add_argument('--speech-destination',type=Path,default=SPEECH_ROOT)
    args=parser.parse_args()
    if args.cache:
        args.cache.mkdir(parents=True,exist_ok=True);install(args.destination,args.cache);install_speech(args.speech_destination,args.cache)
    else:
        with tempfile.TemporaryDirectory(prefix='ai-xue-language-download-') as cache:install(args.destination,Path(cache));install_speech(args.speech_destination,Path(cache))
