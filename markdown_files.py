"""Read Markdown references inside the active local knowledge library."""

from glob import escape
from pathlib import Path


IMAGE_TYPES = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
    '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
}
FILE_TYPES = {
    **IMAGE_TYPES, '.pdf': 'application/pdf',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.md': 'text/plain', '.txt': 'text/plain',
}
MAX_FILE_SIZE = 30 * 1024 * 1024


def resolve(vault, ref, document='', wiki=False, image=False):
    """Find a relative reference or a unique Obsidian filename under vault."""
    root = vault.resolve()
    types = IMAGE_TYPES if image else FILE_TYPES
    if not ref or len(ref) > 1024 or len(document) > 1024:
        return None
    if any(c in ref + document for c in ('\0', '\\', ':')) or ref.startswith('/') or document.startswith('/'):
        return None
    target = Path(ref)
    names = [target]
    if wiki and not image and target.suffix.lower() not in types:
        names = [Path(ref + '.md')]
    if any(name.suffix.lower() not in types for name in names):
        return None

    def visible(candidate):
        try:
            path = candidate.resolve()
            relative = path.relative_to(root)
            if not relative.parts or any(part.startswith('.') for part in relative.parts):
                return None
            if path.suffix.lower() in types and path.is_file():
                return path
        except (OSError, RuntimeError, ValueError):
            pass
        return None

    parent = (root / document).parent if document else root
    for name in names:
        for base in ((parent, root) if wiki else (parent,)):
            path = visible(base / name)
            if path:
                return path
        if wiki and len(name.parts) == 1:
            found = set()
            for candidate in root.rglob(escape(name.name)):
                path = visible(candidate)
                if path:
                    found.add(path)
                if len(found) > 1:
                    return None
            if found:
                return found.pop()
    return None
