import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import ai_services
import server as app


class LocalWorkspace(unittest.TestCase):
    def test_new_workspace_has_no_account_database(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'provider.json'
            with patch.object(app, 'CONFIG', config):
                self.assertEqual(app.workspace_profile(), {'id': 'local', 'name': '', 'avatar': ''})
                self.assertEqual(list(config.parent.iterdir()), [])

    def test_legacy_profile_preserves_id_and_never_rewrites_accounts(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'provider.json'
            legacy = config.with_name('accounts.db')
            with sqlite3.connect(legacy) as db:
                db.execute('CREATE TABLE users (id, name, avatar, legacy, email, password)')
                db.execute('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)',
                           ('legacy-id', '旧昵称', '', 1, 'local@example.test', 'legacy hash'))
                db.execute('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)',
                           ('other-id', '其他旧资料', '', 0, 'other@example.test', 'legacy hash'))
            before = legacy.read_bytes()
            with patch.object(app, 'CONFIG', config):
                self.assertEqual(app.workspace_profile(), {'id': 'legacy-id', 'name': '旧昵称', 'avatar': ''})
                self.assertEqual(app.save_workspace_profile({'name': '新昵称'})['user']['name'], '新昵称')
                self.assertEqual(app.workspace_profile()['id'], 'legacy-id')
                self.assertEqual(legacy.read_bytes(), before)

    def test_invalid_profile_photo_does_not_replace_current_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'provider.json'
            with patch.object(app, 'CONFIG', config):
                app.save_workspace_profile({'name': '本机用户'})
                with self.assertRaises(app.Problem):
                    app.save_workspace_profile({'name': '其他', 'avatar': 'https://example.test/photo.png'})
                self.assertEqual(app.workspace_profile()['name'], '本机用户')


class AIServices(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.saved=(app.CONFIG,app.KEY,app.PROVIDER,app.VERIFIED)
        app.CONFIG=Path(self.tmp.name)/'provider.json';app.KEY='';app.VERIFIED=False
        app.PROVIDER={'base_url':'https://api.deepseek.com','model':'deepseek-chat'}
        self.mock=patch.object(ai_services,'chat_messages',return_value='OK');self.call=self.mock.start()
    def tearDown(self):
        self.mock.stop();app.CONFIG,app.KEY,app.PROVIDER,app.VERIFIED=self.saved;self.tmp.cleanup()
    def save(self,**kw):
        return app.ai_route('/api/ai/save',{'provider':'custom','name':'Test','base':'http://127.0.0.1:9/v1','key':'fixture-only','model':'a','models':['a','b'],**kw})
    def test_defaults_and_translation_scope(self):
        first=self.save();second=self.save(name='Second',model='b');ident=second['saved_id']
        app.ai_route('/api/ai/default',{'scope':'translation','id':ident,'model':'b'})
        self.assertEqual(app.active_ai()['model'],'a');self.assertEqual(app.active_ai('translation')['model'],'b')
        app.ai_route('/api/ai/default',{'scope':'translation','id':''});self.assertEqual(app.active_ai('translation')['model'],'a')
        self.assertNotIn('fixture-only',app.CONFIG.read_text());self.assertNotIn('fixture-only',json.dumps(app.ai_state()))
        saved=json.loads(app.CONFIG.read_text());app.AI_MEMORY[str(app.CONFIG.resolve())]={};app.KEY='';app.VERIFIED=False
        self.assertFalse(app.active_ai()['connected']);self.assertEqual(len(app.ai_state()['services']),2)
    def test_failed_save_does_not_mutate_configuration(self):
        result=self.save();before=app.CONFIG.read_text()
        self.call.side_effect=ai_services.AIServiceError('fixture failure')
        with self.assertRaises(app.Problem):self.save(id=result['saved_id'],key='wrong')
        self.assertEqual(app.CONFIG.read_text(),before);self.assertEqual(app.active_ai()['key'],'fixture-only')
    def test_key_not_reused_on_different_host(self):
        ident=self.save()['saved_id']
        with self.assertRaises(app.Problem):self.save(id=ident,base='https://different.example/v1',key='')
        self.assertEqual(app.active_ai()['base'],'http://127.0.0.1:9/v1')
    def test_disconnect_and_protect_default(self):
        ident=self.save()['saved_id']
        with self.assertRaises(app.Problem):app.ai_route('/api/ai/remove',{'id':ident})
        with self.assertRaises(app.Problem):self.save(id=ident,models=['b'],model='b')
        app.ai_route('/api/ai/disconnect',{'id':ident});self.assertFalse(app.active_ai()['key'])
    def test_discovery_preserves_display_names(self):
        with patch.object(ai_services,'request_json',return_value={'data':[{'id':'x','display_name':'Model X'}]}):
            result=app.ai_route('/api/ai/models',{'provider':'custom','base':'http://localhost:9/v1','key':'fixture-only'})
        self.assertEqual(result,{'models':['x'],'model_names':{'x':'Model X'}})
    def test_native_claude_transport(self):
        self.mock.stop()
        try:
            cfg={'provider':'claude','base':'https://api.anthropic.com/v1','key':'fixture','model':'test'}
            with patch.object(ai_services,'request_json',return_value={'content':[{'type':'text','text':'result'}]}) as send:
                self.assertEqual(ai_services.chat_messages(cfg,[{'role':'system','content':'teach'},{'role':'user','content':'hi'}]),'result')
                self.assertEqual(send.call_args.args[1],'/messages');self.assertEqual(send.call_args.args[2]['system'],'teach')
        finally:self.mock.start()
