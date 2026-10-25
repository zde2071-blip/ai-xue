import io
import unittest
from unittest.mock import Mock
import server as app


class FileResponseEncodingTests(unittest.TestCase):
    def response(self, content_type):
        handler = object.__new__(app.Handler)
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        handler.wfile = io.BytesIO()
        raw = '集合与关系'.encode('utf-8')
        handler.respond(raw, content_type=content_type, filename='原始材料.md')
        headers = dict(call.args for call in handler.send_header.call_args_list)
        self.assertEqual(handler.wfile.getvalue(), raw)
        return headers

    def test_plain_text_originals_declare_utf8_without_changing_bytes(self):
        for kind in ('text/markdown', 'text/plain'):
            with self.subTest(kind=kind):
                self.assertEqual(self.response(kind)['Content-Type'], kind + '; charset=utf-8')

    def test_binary_originals_and_explicit_charsets_are_unchanged(self):
        for kind in ('application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain; charset=utf-8'):
            with self.subTest(kind=kind):
                self.assertEqual(self.response(kind)['Content-Type'], kind)
