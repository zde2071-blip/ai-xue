"""Local accounts adapted from Time Mate backend/cloud.py.
Reuses its SQLite sessions, scrypt hashes, throttling and per-user engine pattern.
No Time Mate account database, credentials, or mail service is copied.
"""
import hashlib
import hmac
import importlib.util
import re
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path

class AuthError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def valid_email(value):
    value = str(value or '').strip().casefold()
    if len(value)>254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
        raise AuthError('请输入有效邮箱地址。')
    return value

def password_hash(value):
    if not isinstance(value, str) or not 8<=len(value)<=128:
        raise AuthError('密码需为 8–128 个字符。')
    salt=secrets.token_hex(16)
    hashed=hashlib.scrypt(value.encode(),salt=salt.encode(),n=32768,r=8,p=1,maxmem=64*1024*1024).hex()
    return 'scrypt:32768:8:1$'+salt+'$'+hashed

def check_password_hash(stored, value):
    if not isinstance(value,str) or len(value)>128:
        return False
    try:
        method,salt,expected=stored.split('$')
        if method!='scrypt:32768:8:1': return False
        hashed=hashlib.scrypt(value.encode(),salt=salt.encode(),n=32768,r=8,p=1,maxmem=64*1024*1024).hex()
        return hmac.compare_digest(hashed,expected)
    except (ValueError,TypeError): return False

class Store:
    def __init__(self,directory,root,vault,config):
        self.directory=Path(directory)
        self.directory.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.root=Path(root); self.vault=Path(vault); self.config=Path(config)
        self.engines={}; self.lock=threading.RLock()
        with self.db() as c:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,name TEXT NOT NULL,avatar TEXT NOT NULL,legacy INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS attempts(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires REAL NOT NULL);
            ''')
        (self.directory/'accounts.db').chmod(0o600)
        self.dummy_hash=password_hash(secrets.token_urlsafe(32))

    @contextmanager
    def db(self):
        c=sqlite3.connect(self.directory/'accounts.db',timeout=15);c.row_factory=sqlite3.Row
        try:
            with c: yield c
        finally:c.close()

    def limited(self,bucket,limit=10):
        stamp=time.time()
        with self.db() as c:
            c.execute('BEGIN IMMEDIATE')
            c.execute('DELETE FROM attempts WHERE expires<?',(stamp,))
            c.execute('INSERT INTO attempts VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1',(digest(bucket),stamp+900))
            return c.execute('SELECT count FROM attempts WHERE bucket=?',(digest(bucket),)).fetchone()[0]>limit

    @staticmethod
    def public(user):
        return {k:user[k] for k in ('id','email','name','avatar','legacy')}

    def current(self,token):
        if not token or len(token)>128:return None
        with self.db() as c:
            c.execute('DELETE FROM sessions WHERE expires<?',(time.time(),))
            row=c.execute('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=?',(digest(token),)).fetchone()
            return self.public(row) if row else None

    def first_run(self):
        with self.db() as c:return not c.execute('SELECT 1 FROM users LIMIT 1').fetchone()

    def new_session(self,uid,old=''):
        token=secrets.token_urlsafe(32)
        with self.db() as c:
            c.execute('DELETE FROM sessions WHERE token=? OR expires<?',(digest(old),time.time()))
            c.execute('INSERT INTO sessions VALUES (?,?,?)',(digest(token),uid,time.time()+30*86400))
        return token

    def action(self,action,data,token):
        if action in ('register','login'):
            email=valid_email(data.get('email'))
            if self.limited('global',100) or self.limited('account:'+email):
                raise AuthError('操作过于频繁，请 15 分钟后重试。',429)
            if action=='register':
                hashed=password_hash(data.get('password'));uid=secrets.token_hex(16)
                try:
                    with self.db() as c:
                        c.execute('BEGIN IMMEDIATE')
                        legacy=int(not c.execute('SELECT 1 FROM users LIMIT 1').fetchone())
                        c.execute('INSERT INTO users VALUES (?,?,?,?,?,?)',(uid,email,hashed,email.split('@')[0][:32],'',legacy))
                except sqlite3.IntegrityError:raise AuthError('这个邮箱已注册，请直接登录。') from None
            else:
                with self.db() as c:user=c.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
                if not check_password_hash(user['password'] if user else self.dummy_hash,data.get('password','')) or not user:
                    raise AuthError('邮箱或密码不正确。')
                uid=user['id']
            new=self.new_session(uid,token)
            return {'user':self.current(new)},new
        user=self.current(token)
        if not user:raise AuthError('请先登录。',401)
        if action=='logout':
            with self.db() as c:c.execute('DELETE FROM sessions WHERE token=?',(digest(token),))
            return {'ok':True},''
        if action=='profile':
            name=str(data.get('name','')).strip()[:32]
            avatar=data.get('avatar','')
            if not isinstance(avatar,str) or len(avatar)>2800000 or (avatar and not re.fullmatch(r'data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+',avatar)):
                raise AuthError('头像格式无效或超过 2 MB。')
            with self.db() as c:c.execute('UPDATE users SET name=?,avatar=? WHERE id=?',(name,avatar,user['id']))
            return {'user':self.current(token)},None
        if action=='password':
            with self.db() as c:row=c.execute('SELECT password FROM users WHERE id=?',(user['id'],)).fetchone()
            if self.limited('password:'+user['id']) or not check_password_hash(row['password'],data.get('old','')):
                raise AuthError('当前密码不正确，或尝试次数过多。')
            hashed=password_hash(data.get('password'))
            with self.db() as c:
                c.execute('UPDATE users SET password=? WHERE id=?',(hashed,user['id']))
                c.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],))
            return {'ok':True},self.new_session(user['id'])
        raise AuthError('账户操作不存在。',404)

    def engine(self,user):
        # Same architecture as Time Mate: one module instance per account.
        with self.lock:
            uid=user['id']
            if uid not in self.engines:
                spec=importlib.util.spec_from_file_location('study_user_'+uid,self.root/'server.py')
                engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
                base=self.directory/'users'/uid
                engine.VAULT=self.vault if user['legacy'] else base/'知识库'
                engine.CONFIG=self.config if user['legacy'] else base/'provider.json'
                engine.initialize()
                self.engines[uid]=engine
            return self.engines[uid]
