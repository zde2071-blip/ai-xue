# Adapted from Time Mate app/backend/core/ai_services.py; provider metadata, discovery and safe diagnostics reused.
"""Provider metadata and small adapters; no credentials are persisted here."""
import json, re, ssl
from urllib.request import Request, build_opener, HTTPSHandler, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse, urlencode
try:
 import certifi
except ImportError:
 certifi=None
class UserFacingError(Exception):
 pass

PROVIDERS = {
 'openai': {'key_label':'OpenAI','key_url':'https://platform.openai.com/api-keys','name':'GPT','base':'https://api.openai.com/v1'},
 'deepseek': {'key_label':'DeepSeek','key_url':'https://platform.deepseek.com/','name':'DeepSeek','base':'https://api.deepseek.com'},
 'qwen': {'key_label':'阿里云百炼','key_url':'https://bailian.console.aliyun.com/','name':'通义千问','base':'https://dashscope.aliyuncs.com/compatible-mode/v1','hint':'地区和业务空间必须与 Key 一致。专属域名或其他地区请在高级设置中修改。'},
 'zhipu': {'key_label':'智谱','key_url':'https://open.bigmodel.cn/','name':'GLM','base':'https://open.bigmodel.cn/api/paas/v4','hint':'使用按量计费 API Key。若无法获取列表，请手动填写已开通的模型 ID。'},
 'doubao': {'key_label':'火山方舟','key_url':'https://console.volcengine.com/ark','name':'豆包','base':'https://ark.cn-beijing.volces.com/api/v3','hint':'若无法获取列表，请手动填写已开通的模型 ID 或推理接入点 ID（ep-…）。'},
 'kimi': {'key_label':'Kimi','key_url':'https://platform.kimi.com/','name':'Kimi','base':'https://api.moonshot.cn/v1'},
 'gemini': {'key_label':'Google AI Studio','key_url':'https://aistudio.google.com/apikey','name':'Gemini','base':'https://generativelanguage.googleapis.com/v1beta/openai'},
 'claude': {'key_label':'Claude','key_url':'https://platform.claude.com/','name':'Claude','base':'https://api.anthropic.com/v1','protocol':'anthropic'},
 'custom': {'name':'其他兼容服务','base':'','hint':'填写支持 Chat Completions 的 HTTPS 基础地址和模型 ID。'},
}
class AIServiceError(UserFacingError):
 """Only fixed, safe diagnostics; never provider response bodies or credentials."""
 code="ai_service_error"

class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): raise AIServiceError('接口发生跳转，请核对高级设置中的地址。')

def infer_provider(base):
 return next((k for k,v in PROVIDERS.items() if v['base'] and v['base'].rstrip('/')==base.rstrip('/')),'custom')

def validate(cfg,model=True):
 if cfg.get('provider') not in PROVIDERS: raise AIServiceError('请选择模型服务商。')
 p=urlparse(cfg.get('base',''))
 if (p.scheme!='https' and not (p.scheme=='http' and p.hostname in ('localhost','127.0.0.1','::1'))) or not p.hostname or p.username or p.password or p.query or p.fragment:
  raise AIServiceError('请填写不含查询参数的 HTTPS 接口基础地址。')
 if not cfg.get('key'): raise AIServiceError('请填写当前服务商的 API Key。')
 if model and not cfg.get('model'): raise AIServiceError('请先选择模型，或手动填写模型 ID。')

def request_json(cfg,path,payload=None):
 validate(cfg,model=False)
 headers={'Content-Type':'application/json'}
 if cfg['provider']=='claude':headers.update({'x-api-key':cfg['key'],'anthropic-version':'2023-06-01'})
 else:headers['Authorization']='Bearer '+cfg['key']
 req=Request(cfg['base'].rstrip('/')+path,data=json.dumps(payload).encode() if payload is not None else None,headers=headers)
 try:
  opener=build_opener(NoRedirect(),HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where() if certifi else None)))
  with opener.open(req,timeout=60) as response:return json.loads(response.read(2_000_000))
 except HTTPError as e:
  # Never reflect a provider error body: it can contain credentials or request content.
  messages={400:'请求或模型参数不受支持，请核对模型和接口。',401:'API Key 无效，或与当前服务商、地区不匹配。',402:'账户余额不足或未开通付费服务。',403:'没有调用权限，请检查地区、模型开通状态和 Key 权限。',404:'接口或模型不存在；可尝试手动填写已开通的模型 ID。',429:'服务商限流或额度不足，请检查余额与限额后再试。'}
  raise AIServiceError(messages.get(e.code,'服务商暂时无法完成请求，请稍后再试。')+f'（HTTP {e.code}）') from None
 except (URLError,TimeoutError): raise AIServiceError('连接超时或网络不可达，请检查网络和接口地址。') from None
 except (json.JSONDecodeError,UnicodeDecodeError): raise AIServiceError('服务商返回了无法识别的数据，请核对接口地址。') from None

class ModelCatalog(list):
 def __init__(self, models, names=None):
  super().__init__(models)
  self.names = names or {}

def list_models(cfg):
 data=request_json(cfg,'/models')
 items=list(data.get('data',[]))
 if cfg['provider']=='claude':
  for _ in range(9):
   if not data.get('has_more') or not data.get('last_id'):break
   data=request_json(cfg,'/models?'+urlencode({'after_id':data['last_id']}));items.extend(data.get('data',[]))
 models=sorted({x['id'] for x in items if isinstance(x,dict) and isinstance(x.get('id'),str)})
 # Model listing is discovery, not a guarantee of chat permissions/capabilities.
 if not models:raise AIServiceError('没有获取到模型，请手动填写服务商控制台中的模型 ID。')
 names={}
 for item in items:
  if not isinstance(item,dict) or item.get('id') not in models:continue
  for field in ('display_name','displayName','name'):
   name=item.get(field)
   if isinstance(name,str) and name.strip() and len(name)<=200 and not any(ord(c)<32 for c in name):
    names[item['id']]=name.strip();break
 return ModelCatalog(models,names)

def complete(cfg,prompt,data,max_tokens=4096,images=None):
 validate(cfg)
 user=json.dumps(data,ensure_ascii=False)
 images=images or []
 compatible_content=([{'type':'text','text':user}]+[{'type':'image_url','image_url':{'url':image['dataUrl']}} for image in images]) if images else user
 if cfg['provider']=='claude':
  content=[{'type':'text','text':user}]
  for image in images:
   header,encoded=image['dataUrl'].split(',',1)
   content.append({'type':'image','source':{'type':'base64','media_type':header[5:].split(';')[0],'data':encoded}})
  result=request_json(cfg,'/messages',{'model':cfg['model'],'max_tokens':max_tokens,'system':prompt,'messages':[{'role':'user','content':content if images else user}]})
  if result.get('stop_reason')=='max_tokens':raise AIServiceError('模型回答达到输出额度上限，结果不完整。')
  content=''.join(x.get('text','') for x in result.get('content',[]) if x.get('type')=='text')
 else:
  payload={'model':cfg['model'],'messages':[{'role':'system','content':prompt},{'role':'user','content':compatible_content}],'max_tokens':max_tokens,'stream':False}
  # Email extraction/translation needs a final answer, not a reasoning trace.
  # DeepSeek enables thinking by default, which shares the output token limit.
  if cfg['provider']=='deepseek':payload['thinking']={'type':'disabled'}
  result=request_json(cfg,'/chat/completions',payload)
  try:
   choice=result['choices'][0];message=choice['message'];content=message.get('content')
  except (KeyError,IndexError,TypeError,AttributeError):raise AIServiceError('模型接口返回结构异常，没有收到回答。') from None
  reason=choice.get('finish_reason')
  if reason=='length':
   if message.get('reasoning_content') and not content:
    raise AIServiceError('模型在思考阶段耗尽输出额度，尚未生成最终回答。')
   raise AIServiceError('模型回答达到输出额度上限，结果不完整。')
  if reason=='content_filter':raise AIServiceError('模型服务商拦截了本次回答，未生成可用结果。')
  if reason=='insufficient_system_resource':raise AIServiceError('模型服务商计算资源不足，请稍后重试。')
  if not content and message.get('reasoning_content'):
   raise AIServiceError('模型只返回了思考内容，没有最终回答；请检查思考模式兼容性。')
 if not isinstance(content,str) or not content.strip():raise AIServiceError('模型接口返回了空回答，请稍后重试。')
 try:return json.loads(re.sub(r'^```(?:json)?\s*|\s*```$','',content.strip()))
 except ValueError:raise AIServiceError('模型没有返回所需格式，请重试或更换模型。') from None


def chat_messages(cfg,messages,max_tokens=6500,json_mode=False):
 validate(cfg)
 if cfg['provider']=='claude':
  system='\n'.join(m['content'] for m in messages if m['role']=='system')
  history=[]
  for message in messages:
   if message['role']=='system':continue
   row=dict(message)
   if isinstance(row.get('content'),list):
    blocks=[]
    for part in row['content']:
     if part.get('type')=='image_url':
      url=part.get('image_url',{}).get('url','')
      if not re.fullmatch(r'data:image/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+',url):raise AIServiceError('图片内容无效，请重新选择。')
      header,encoded=url.split(',',1)
      blocks.append({'type':'image','source':{'type':'base64','media_type':header[5:].split(';')[0],'data':encoded}})
     else:blocks.append(part)
    row['content']=blocks
   history.append(row)
  result=request_json(cfg,'/messages',{'model':cfg['model'],'system':system,'messages':history,'max_tokens':max_tokens})
  if result.get('stop_reason')=='max_tokens':raise AIServiceError('回答达到输出上限，请缩小当前问题后重试。')
  content=''.join(x.get('text','') for x in result.get('content',[]) if x.get('type')=='text')
 else:
  payload={'model':cfg['model'],'messages':messages,'max_tokens':max_tokens,'temperature':0.4,'stream':False}
  if json_mode:payload['response_format']={'type':'json_object'}
  if cfg['provider']=='deepseek':payload['thinking']={'type':'disabled'}
  result=request_json(cfg,'/chat/completions',payload)
  try:
   choice=result['choices'][0];content=choice['message'].get('content')
  except (KeyError,IndexError,AttributeError,TypeError):raise AIServiceError('模型返回格式无法读取，请检查接口兼容性。') from None
  if choice.get('finish_reason')=='length':raise AIServiceError('回答达到输出上限，请缩小当前问题后重试。')
 if not isinstance(content,str) or not content.strip():raise AIServiceError('模型返回了空回答，请重试或更换模型。')
 return content
