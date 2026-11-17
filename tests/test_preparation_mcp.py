import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('prep_mcp',Path(__file__).parents[1]/'tools'/'preparation_mcp.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class MCPTest(unittest.TestCase):
 def test_protocol_and_write_use_same_api_with_version(self):
  bridge=m.Bridge('http://127.0.0.1:8829')
  self.assertIn('tools',bridge.dispatch({'method':'initialize'})['capabilities'])
  self.assertEqual(len(bridge.dispatch({'method':'tools/list'})['tools']),8)
  with patch.object(bridge,'api',return_value={'etag':'new'}) as call:
   result=bridge.call('save_analysis',{'exam_id':'test','etag':'current','analysis':{'total':'100'}})
   self.assertEqual(result['etag'],'new');self.assertEqual(call.call_args.args[1]['etag'],'current');self.assertEqual(call.call_args.args[1]['action'],'analysis')
 def test_reject_remote_service_and_unrelated_file(self):
  with self.assertRaises(ValueError):m.Bridge('https://example.com')
  bridge=m.Bridge('http://localhost:8829')
  with patch.object(bridge,'api',return_value={'materials':[]}):
   result=bridge.dispatch({'method':'tools/call','params':{'name':'read_material','arguments':{'exam_id':'test','material_id':'other'}}})
  self.assertTrue(result['isError'])
  self.assertTrue(bridge.dispatch({'method':'tools/call','params':{'name':'save_analysis','arguments':{}}})['isError'])
