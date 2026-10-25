import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from http.cookiejar import CookieJar
from urllib.request import build_opener,HTTPCookieProcessor,Request
from urllib.error import HTTPError
import accounts
import ai_services
import server as app

class Accounts(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name)
        self.store=accounts.Store(self.base/'local',app.ROOT,self.base/'legacy-vault',self.base/'old-provider.json')
    def tearDown(self):self.tmp.cleanup()
    def register(self,email):return self.store.action('register',{'email':email,'password':'test-password-123'},'')
    def test_real_password_sessions_logout_and_persistence(self):
        result,token=self.register('Alice@Example.com');user=result['user']
        self.assertEqual(user['email'],'alice@example.com');self.assertTrue(user['legacy'])
        with self.store.db() as c:
            row=c.execute('SELECT password FROM users').fetchone()
            self.assertTrue(row[0].startswith('scrypt:'));self.assertNotIn('test-password',row[0])
            self.assertNotEqual(c.execute('SELECT token FROM sessions').fetchone()[0],token)
        reopened=accounts.Store(self.base/'local',app.ROOT,self.base/'legacy-vault',self.base/'old-provider.json')
        self.assertEqual(reopened.current(token)['id'],user['id'])
        with self.assertRaisesRegex(accounts.AuthError,'邮箱或密码'):self.store.action('login',{'email':'alice@example.com','password':'wrong'},'')
        self.store.action('logout',{},token);self.assertIsNone(self.store.current(token))
        _,new=self.store.action('login',{'email':'alice@example.com','password':'test-password-123'},'')
        self.assertIsNotNone(self.store.current(new))
        with self.assertRaises(accounts.AuthError):self.register('alice@example.com')
    def test_account_engines_isolate_files_and_credentials(self):
        a,ta=self.register('a@example.com');b,tb=self.register('b@example.com')
        ea=self.store.engine(a['user']);eb=self.store.engine(b['user'])
        self.assertEqual(ea.VAULT,self.base/'legacy-vault');self.assertNotEqual(ea.VAULT,eb.VAULT)
        c=ea.seed_demo(True)
        with self.assertRaises(eb.Problem):eb.get_course(c['id'])
        ea.KEY='fixture-only';self.assertEqual(eb.KEY,'')
        ea.ai_memory()['x']={'key':'fixture-only'};self.assertNotIn('x',eb.ai_memory())
        ea.write_text(ea.VAULT/'keep.md','existing');self.assertFalse((eb.VAULT/'keep.md').exists())
    def test_password_rotation_revokes_other_sessions(self):
        a,t=self.register('a@example.com');_,other=self.store.action('login',{'email':'a@example.com','password':'test-password-123'},'')
        _,new=self.store.action('password',{'old':'test-password-123','password':'changed-password'},t)
        self.assertIsNone(self.store.current(t));self.assertIsNone(self.store.current(other));self.assertIsNotNone(self.store.current(new))
    def test_expiry_and_throttle(self):
        _,t=self.register('a@example.com')
        with self.store.db() as c:c.execute('UPDATE sessions SET expires=0')
        self.assertIsNone(self.store.current(t))
        for _ in range(10):
            try:self.store.action('login',{'email':'missing@example.com','password':'wrong'},'')
            except accounts.AuthError:pass
        with self.assertRaises(accounts.AuthError) as error:self.store.action('login',{'email':'missing@example.com','password':'wrong'},'')
        self.assertEqual(error.exception.status,429)
    def test_http_guards_and_identity_switch(self):
        with patch.object(app,'AUTH',self.store):
            http=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);threading.Thread(target=http.serve_forever,daemon=True).start()
            base=f'http://127.0.0.1:{http.server_port}';cookies=CookieJar();client=build_opener(HTTPCookieProcessor(cookies))
            def post(path,data,user=None,origin=None):
                headers={'Content-Type':'application/json','X-Study-App':'1'}
                if user:headers['X-Study-User']=user
                if origin:headers['Origin']=origin
                with client.open(Request(base+path,json.dumps(data).encode(),headers)) as response:return json.load(response)
            try:
                with self.assertRaises(HTTPError) as error:client.open(base+'/api/state')
                self.assertEqual(error.exception.code,401)
                a=post('/api/auth/register',{'email':'one@example.com','password':'test-password'})['user']
                with client.open(base+'/api/state') as response:self.assertEqual(json.load(response)['user']['id'],a['id'])
                cookie=next(iter(cookies));self.assertIn('HttpOnly',cookie._rest);self.assertEqual(cookie._rest['SameSite'],'Strict')
                b=post('/api/auth/register',{'email':'two@example.com','password':'test-password'})['user']
                with self.assertRaises(HTTPError) as error:post('/api/demo',{},a['id'])
                self.assertEqual(error.exception.code,409)
                with self.assertRaises(HTTPError) as error:post('/api/demo',{},b['id'],'https://evil.example')
                self.assertEqual(error.exception.code,403)
                post('/api/auth/logout',{},b['id'])
                with self.assertRaises(HTTPError) as error:client.open(base+'/api/library')
                self.assertEqual(error.exception.code,401)
            finally:http.shutdown();http.server_close()

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
