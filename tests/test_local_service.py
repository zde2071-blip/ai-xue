import importlib.util
from pathlib import Path
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('local_service', Path(__file__).parents[1] / 'tools/local_service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class LocalServiceTest(unittest.TestCase):
    def test_page_failure_is_unhealthy_even_when_workspace_works(self):
        responses = {'/': 500, '/app.js': 200, '/api/state': 200, '/api/workspace': 200, '/api/templates': 200, '/api/calendar': 200}

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(responses[self.path])
                self.end_headers()
                self.wfile.write(b'response')

            def log_message(self, *args):
                pass

        with ThreadingHTTPServer(('127.0.0.1', 0), Handler) as http:
            worker = threading.Thread(target=http.serve_forever, daemon=True)
            worker.start()
            try:
                self.assertFalse(service.ready(http.server_port))
                responses['/'] = 200
                self.assertTrue(service.ready(http.server_port))
                responses['/api/state'] = 500
                self.assertFalse(service.ready(http.server_port))
                responses['/api/state'] = 200
                responses['/api/templates'] = 500
                self.assertFalse(service.ready(http.server_port))
            finally:
                http.shutdown()
                worker.join()

    def test_watchdog_restarts_only_after_repeated_page_failure(self):
        server = Mock(server_port=8767)
        stopped = Mock()
        stopped.wait.side_effect = [False, False, False, False]
        with patch.object(service, 'ready', side_effect=[False, True, False, False]):
            service.watch_health(server, stopped, interval=0)
        server.shutdown.assert_called_once()

    def test_model_restore_retries_when_login_network_is_not_ready(self):
        stopped = Mock()
        stopped.is_set.return_value = False
        stopped.wait.return_value = False
        with patch.object(service, 'restore_connection', side_effect=[False, False, True]) as restore:
            service.restore_when_available(Mock(), stopped)
        self.assertEqual(restore.call_count, 3)
        self.assertEqual([call.args[0] for call in stopped.wait.call_args_list], [5, 10])

    def test_model_restore_stops_waiting_on_service_shutdown(self):
        stopped = Mock()
        stopped.is_set.return_value = False
        stopped.wait.return_value = True
        with patch.object(service, 'restore_connection', return_value=False) as restore:
            service.restore_when_available(Mock(), stopped)
        restore.assert_called_once()
