"""Convert saved Markdown notes to Word or PDF in the local service."""

import base64
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree

import markdown_files
import source_preview


MIME_TYPES = {
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'pdf': 'application/pdf',
}
INPUT = 'markdown+wikilinks_title_after_pipe+tex_math_single_backslash-raw_html-raw_tex-raw_attribute'
MAX_IMAGE_BYTES = 30 * 1024 * 1024


def pandoc_command():
    name = 'pandoc.exe' if os.name == 'nt' else 'pandoc'
    bundled = Path(__file__).resolve().parent / 'tools' / 'note-export-runtime' / name
    command = str(bundled) if bundled.is_file() else shutil.which('pandoc')
    if command:
        return command
    raise ValueError('本机尚未安装导出组件。请运行 python tools/install_note_export.py。')


def convert(command, raw, from_format, to_format):
    try:
        result = subprocess.run(
            [command, '--sandbox', '--from=' + from_format, '--to=' + to_format],
            input=raw, capture_output=True, check=True, timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        raise ValueError('笔记转换未完成，请重试。') from None
    return result.stdout


def safe_svg(data):
    if re.search(rb'<!(?:DOCTYPE|ENTITY)|<\?xml-stylesheet', data, re.I):
        return False
    try:
        root = ElementTree.fromstring(data)
    except ElementTree.ParseError:
        return False
    if root.tag.rsplit('}', 1)[-1] != 'svg':
        return False
    for element in root.iter():
        if element.tag.rsplit('}', 1)[-1] in ('script', 'foreignObject'):
            return False
        for key, value in element.attrib.items():
            name = key.rsplit('}', 1)[-1].lower()
            if name.startswith('on') or name in ('href', 'base') and not value.startswith('#'):
                return False
        for value in [element.text or '', *element.attrib.values()]:
            if re.search(r'@import\b', value, re.I):
                return False
            if any(not target.strip(' \t\r\n\'"').startswith('#') for target in re.findall(r'url\(([^)]*)\)', value, re.I)):
                return False
    return True


class NoteImages:
    """Resolve only the note's local attachments, without fetching remote images."""

    def __init__(self, vault, document_path):
        self.vault = vault
        self.document_path = document_path
        self.remaining = MAX_IMAGE_BYTES
        self.media = {}

    def embed(self, reference, wiki):
        try:
            url = urlsplit(reference)
        except ValueError:
            return None
        if url.scheme or url.netloc:
            return None
        path = markdown_files.resolve(
            self.vault, unquote(url.path), self.document_path, wiki=wiki, image=True,
        )
        if not path:
            return None
        if path in self.media:
            return self.media[path]
        size = path.stat().st_size
        if size > self.remaining:
            return None
        data = path.read_bytes()
        self.remaining -= len(data)
        if path.suffix.lower() == '.svg' and not safe_svg(data):
            return None
        mime = markdown_files.IMAGE_TYPES[path.suffix.lower()]
        embedded = 'data:' + mime + ';base64,' + base64.b64encode(data).decode('ascii')
        self.media[path] = embedded
        return embedded

    def image(self, attributes, alt, dest):
        ident, classes, dimensions = attributes
        wiki = 'wikilink' in classes
        if wiki:
            label = alt[0]['c'] if len(alt) == 1 and alt[0].get('t') == 'Str' else ''
            size = re.fullmatch(r'([1-9]\d{0,3})(?:x([1-9]\d{0,3}))?', label)
            if size:
                dimensions = [['width', size[1] + 'px']]
                if size[2]:
                    dimensions.append(['height', size[2] + 'px'])
                alt = [{'t': 'Str', 'c': Path(unquote(dest[0])).name}]
            attributes = [ident, [name for name in classes if name != 'wikilink'], dimensions]
        source = self.embed(dest[0], wiki)
        if source:
            return {'t': 'Image', 'c': [attributes, alt, [source, dest[1]]]}
        return {'t': 'Span', 'c': [['', [], []], [{'t': 'Str', 'c': '图片：'}, *alt]]}

    def visit(self, value):
        if isinstance(value, dict):
            if value.get('t') == 'Image':
                return self.image(*value['c'])
            if value.get('t') == 'Figure':
                _, _, blocks = value['c']
                if len(blocks) == 1 and blocks[0]['t'] == 'Plain':
                    children = blocks[0]['c']
                    if len(children) == 1 and children[0]['t'] == 'Image' and 'wikilink' in children[0]['c'][0][1]:
                        return {'t': 'Para', 'c': [self.visit(children[0])]}
            return {key: self.visit(item) for key, item in value.items()}
        return [self.visit(item) for item in value] if isinstance(value, list) else value


def export(note, vault, output_format):
    if output_format not in MIME_TYPES:
        raise ValueError('请选择支持的导出格式。')
    command = pandoc_command()
    relative = Path(note['path']).resolve().relative_to(vault.resolve()).as_posix()
    parsed = json.loads(convert(command, note['content'].encode('utf-8'), INPUT, 'json'))
    parsed['meta'] = {'lang': {'t': 'MetaString', 'c': 'zh-CN'}}
    parsed['blocks'] = NoteImages(vault, relative).visit(parsed['blocks'])
    docx = convert(command, json.dumps(parsed, ensure_ascii=False).encode('utf-8'), 'json', 'docx')
    if not docx.startswith(b'PK\x03\x04'):
        raise ValueError('无法生成有效的 Word 文件。')
    if output_format == 'pdf':
        if not source_preview.office_executable():
            raise ValueError('本机尚未安装 LibreOffice，安装后可导出 PDF。')
        pdf, _ = source_preview.preview_bytes('笔记.docx', docx)
        return pdf
    return docx
