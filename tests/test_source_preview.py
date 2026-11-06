import io
import shutil
import unittest
from pathlib import Path
from unittest.mock import patch
import source_preview

class SourcePreview(unittest.TestCase):
 def test_text_and_images_cannot_inject_html(self):
  body,mime=source_preview.preview_bytes('notes.md',b'<script>alert(1)</script>')
  self.assertIn(b'&lt;script&gt;',body);self.assertNotIn(b'<script>',body);self.assertTrue(mime.startswith('text/html'))
 def test_pdf_is_original_bytes(self):
  raw=b'%PDF-1.7 test';self.assertEqual(source_preview.preview_bytes('file.pdf',raw),(raw,'application/pdf'))
 def test_office_failure_is_clear(self):
  with patch('source_preview.shutil.which',return_value=None),patch('source_preview.Path.is_file',return_value=False):
   with self.assertRaisesRegex(ValueError,'LibreOffice'):source_preview.preview_bytes('missing.doc',b'unique-test')
 @unittest.skipUnless(shutil.which('soffice') or Path('/Applications/LibreOffice.app').exists(),'LibreOffice not installed')
 def test_real_presentation_preserves_page_content(self):
  from pptx import Presentation
  from pypdf import PdfReader
  prs=Presentation();slide=prs.slides.add_slide(prs.slide_layouts[1]);slide.shapes.title.text='Source preview test';slide.placeholders[1].text='Original equation: 1 + 2 = 3'
  stream=io.BytesIO();prs.save(stream);raw=stream.getvalue();body,mime=source_preview.preview_bytes('lesson.pptx',raw)
  self.assertEqual(mime,'application/pdf');self.assertTrue(body.startswith(b'%PDF-'));self.assertIn('Original equation',PdfReader(io.BytesIO(body)).pages[0].extract_text());self.assertEqual(stream.getvalue(),raw);self.assertIn(b'page-1',source_preview.pdf_viewer(body,'test'));self.assertTrue(source_preview.pdf_page(body,0).startswith(b'\x89PNG'));
  with self.assertRaises(ValueError):source_preview.pdf_page(body,9)

 @unittest.skipUnless(shutil.which('soffice') or Path('/Applications/LibreOffice.app').exists(),'LibreOffice not installed')
 def test_real_word_preview_keeps_original_text(self):
  import zipfile
  from pypdf import PdfReader
  stream=io.BytesIO()
  with zipfile.ZipFile(stream,'w') as archive:
   archive.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
   archive.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
   archive.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Original Word material</w:t></w:r></w:p></w:body></w:document>')
  body,mime=source_preview.preview_bytes('lecture.docx',stream.getvalue());self.assertEqual(mime,'application/pdf');self.assertIn('Original Word material',PdfReader(io.BytesIO(body)).pages[0].extract_text())
