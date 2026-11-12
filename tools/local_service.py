"""Run the local service with a health check and launchd recovery."""
import argparse
import importlib
import os
from pathlib import Path
import runpy
import sys
import threading
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]


def ready(port, *, check_state=True):
    paths = ('/', '/app.js', '/api/state') if check_state else ('/', '/app.js')
    opener = build_opener(ProxyHandler({}))
    try:
        for path in paths:
            with opener.open(f'http://127.0.0.1:{port}{path}', timeout=4) as response:
                if response.status != 200 or not response.read(1):
                    return False
    except HTTPError as error:
        error.close()
        return False
    except (OSError, URLError):
        return False
    return True


def watch_health(service, stopped, *, interval=30):
    failures = 0
    while not stopped.wait(interval):
        failures = 0 if ready(service.server_port, check_state=False) else failures + 1
        if failures >= 2:
            print('Local page failed two health checks. Restarting the service.', file=sys.stderr, flush=True)
            service.shutdown()
            return


def restore_connection(app):
    source = os.environ.get('AI_XUE_CONNECTION_SOURCE')
    if not source:
        return
    scope = {}
    try:
        scope = runpy.run_path(source)
        config = scope['cfg']
        document = app.ai_document()
        learning = document['defaults'].get('learning')
        profile = next((row for row in document['services'] if learning and row['id'] == learning['id']), None)
        if not profile or profile['base'] != config['base'] or profile['provider'] != config['provider']:
            return
        models = {choice['model'] for choice in document['defaults'].values() if choice and choice['id'] == profile['id']}
        for model in models:
            app.ai_services.chat_messages(
                {'provider': profile['provider'], 'base': profile['base'], 'key': config['key'], 'model': model},
                [{'role': 'user', 'content': 'Reply OK.'}], max_tokens=32,
            )
        with app.LOCK:
            app.ai_memory()[profile['id']] = {'key': config['key'], 'verified': models}
            app.sync_active_ai()
        print('Saved model connection restored.', flush=True)
    except (Exception, SystemExit) as error:
        print('Model connection could not be restored: '+type(error).__name__, file=sys.stderr, flush=True)
    finally:
        scope.clear()


def serve(port):
    sys.path.insert(0, str(ROOT))
    app = importlib.import_module('server')
    app.initialize()
    stopped = threading.Event()
    with app.ThreadingHTTPServer(('127.0.0.1', port), app.Handler) as service:
        service.daemon_threads = True
        threading.Thread(target=restore_connection, args=(app,), daemon=True).start()
        threading.Thread(target=watch_health, args=(service, stopped), daemon=True).start()
        print(f'AI Xue is listening on http://127.0.0.1:{port}', flush=True)
        try:
            service.serve_forever()
        finally:
            stopped.set()
    return 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', '8767')))
    args = parser.parse_args()
    sys.exit((0 if ready(args.port) else 1) if args.check else serve(args.port))
