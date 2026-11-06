"""Read-only original-document previews. Office conversion runs in a temporary profile."""
import base64
import hashlib
import html
import shutil
import subprocess
import tempfile
import threading
from collections import OrderedDict
from pathlib import Path

_cache = OrderedDict()
_lock = threading.Lock()
_MAX_CACHE = 32 * 1024 * 1024


def preview_bytes(name, raw):
    suffix = Path(name).suffix.lower()
    if suffix == '.pdf':
        return raw, 'application/pdf'
    if suffix in ('.ppt', '.pptx', '.doc', '.docx'):
        key = hashlib.sha256(suffix.encode() + raw).hexdigest()
        with _lock:
            if key in _cache:
                _cache.move_to_end(key)
                return _cache[key], 'application/pdf'
            executable = shutil.which('soffice')
            if not executable and Path('/Applications/LibreOffice.app/Contents/MacOS/soffice').is_file():
                executable = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
            if not executable:
                raise ValueError('此电脑尚未安装 LibreOffice，暂时无法预览 Office 文件。可通过右上角打开原文件。')
            with tempfile.TemporaryDirectory(prefix='ai-xue-preview-') as directory:
                folder = Path(directory)
                source = folder / ('original' + suffix)
                source.write_bytes(raw)
                try:
                    result = subprocess.run([executable, '-env:UserInstallation=' + (folder / 'profile').as_uri(), '--headless', '--convert-to', 'pdf', '--outdir', str(folder), str(source)], capture_output=True, timeout=45)
                except (OSError, subprocess.TimeoutExpired):
                    raise ValueError('原文件预览未能完成，请通过右上角打开原文件。') from None
                output = folder / 'original.pdf'
                if result.returncode or not output.is_file():
                    raise ValueError('无法预览这个 Office 文件，请检查文件是否完整。')
                body = output.read_bytes()
                if not body.startswith(b'%PDF-'):
                    raise ValueError('原文件转换结果无效。')
            if len(body) <= _MAX_CACHE:
                while _cache and sum(map(len, _cache.values())) + len(body) > _MAX_CACHE:
                    _cache.popitem(last=False)
                _cache[key] = body
            return body, 'application/pdf'
    if suffix in ('.png', '.jpg', '.jpeg', '.webp'):
        mime = 'image/jpeg' if suffix in ('.jpg', '.jpeg') else 'image/' + suffix[1:]
        content = '<img alt="原始材料" src="data:' + mime + ';base64,' + base64.b64encode(raw).decode() + '">'
    elif suffix in ('.md', '.txt'):
        content = '<pre>' + html.escape(raw.decode('utf-8-sig', errors='replace')) + '</pre>'
    else:
        raise ValueError('此文件暂不支持预览，请通过右上角打开原文件。')
    document = '<!doctype html><meta charset="utf-8"><style>body{margin:20px;color:#292929;background:#fafafa;font:15px/1.7 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}img{max-width:100%;height:auto}</style>' + content
    return document.encode(), 'text/html; charset=utf-8'

_pdf_lock = threading.Lock()  # PDFium is not thread-safe.


def pdf_page(raw, page_index):
    import io
    import pypdfium2 as pdfium
    with _pdf_lock:
        with pdfium.PdfDocument(raw) as document:
            if not 0 <= page_index < len(document):
                raise ValueError('没有这一页。')
            page = document[page_index]
            bitmap = page.render(scale=min(2, 1500 / page.get_width()))
            output = io.BytesIO()
            bitmap.to_pil().save(output, format='PNG')
            bitmap.close(); page.close()
            return output.getvalue()


def pdf_viewer(raw, course_id):
    import pypdfium2 as pdfium
    with _pdf_lock:
        with pdfium.PdfDocument(raw) as document:
            dimensions=[]
            for index in range(len(document)):
                page=document[index];dimensions.append(page.get_size());page.close()
    images=''.join(f'<img id="page-{i+1}" alt="第 {i+1} 页" width="{round(w)}" height="{round(h)}" src="/api/courses/{course_id}/source-preview/pages/{i}" loading="lazy">' for i,(w,h) in enumerate(dimensions))
    html_doc=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/source-viewer.css"><script defer src="/source-viewer.js"></script><body data-source="{course_id}"><header><label>页 <input id="page-number" type="number" min="1" max="{len(dimensions)}" value="1" aria-label="页码"> / {len(dimensions)}</label><div><button id="zoom-out" aria-label="缩小">−</button><button id="zoom-reset" aria-label="适合宽度">适合宽度</button><button id="zoom-in" aria-label="放大">＋</button></div></header><main>{images}</main></body></html>'''
    return html_doc.encode()
