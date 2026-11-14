"""Shared resource locations for desktop and server installations."""
import os
import sys
from pathlib import Path

def data_root():
    if os.environ.get('AI_XUE_DATA_HOME'):
        return Path(os.environ['AI_XUE_DATA_HOME']).expanduser()
    if sys.platform == 'darwin':
        return Path.home() / 'Library/Application Support/AI Xue'
    if sys.platform == 'win32':
        return Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData/Local')) / 'AI Xue'
    return Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share')) / 'ai-xue'

MODEL_ROOT = Path(os.environ.get('AI_XUE_TRANSLATION_MODELS', data_root() / 'translation-models')).expanduser()
SPEECH_ROOT = Path(os.environ.get('AI_XUE_SPEECH_MODELS', data_root() / 'speech-models')).expanduser()
