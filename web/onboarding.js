/* Local workspace setup conversation. Import results use the same calendar rules as Settings. */
(function(root){
 'use strict';
 const steps=['model','calendar','timetable','done'];
 const labels={model:'AI 模型',calendar:'校历',timetable:'课表'};
 const prompts={
  model:'先连接学习用的 AI 模型。如果接下来要发截图，请选支持图片的模型。',
  calendar:'请发学校的校历截图、PDF，或粘贴校历订阅链接。含周次的文件可用于识别教学周。',
  timetable:'请发你的课表截图、PDF，或粘贴学校提供的日历订阅链接。',
  done:'设置完成。可以回到学习页，从本周课表选一节课，或直接导入课件。'
 };
 const key=id=>'study-onboarding-'+id;
 const read=id=>{try{return JSON.parse(localStorage.getItem(key(id))||'null');}catch{return null;}};
 const remember=(id,step,open)=>localStorage.setItem(key(id),JSON.stringify({step,open}));
 const dialog=()=>document.querySelector('#study-onboarding');
 const refs=()=>root.AcademicReferences;
 let flow=null;
 const live=f=>flow===f&&S.user?.id===f.owner;
 const attr=disabled=>disabled?'disabled':'';
 function go(f,step){
  Object.assign(f,{step,file:null,url:'',review:null,error:'',promptSent:false});
  remember(f.owner,step,true);
 }
 function next(f){go(f,steps[steps.indexOf(f.step)+1]);}
 function say(f,author,text){f.messages.push({author,text});}
 function pause(f){
  if(f.busy)return;
  remember(f.owner,f.step==='model'?f.afterModel:f.step,false);
  flow=null;
  dialog().close();
  dialog().replaceChildren();
 }
 function profile(f){return f.ai?.services.find(service=>service.id===f.ai.defaults.learning?.id);}
 function modelFields(f){
  const current=profile(f);
  const providers=f.ai.providers;
  const provider=f.provider;
  return `<form data-onboarding-form="model" class="onboarding-model">
   <fieldset ${attr(f.busy)}>
    <label>服务商<select name="provider">${Object.entries(providers).map(([id,p])=>`<option value="${esc(id)}" ${id===provider?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label>API Key<input type="password" name="key" required autocomplete="off" placeholder="输入服务商的 API Key"></label>
    <label class="onboarding-address" ${provider==='custom'||current?.provider===provider&&current.base!==providers[provider].base?'':'hidden'}>接口地址
     <input type="url" name="base" value="${esc(current?.provider===provider?current.base:providers[provider].base)}" placeholder="https://example.com/v1"></label>
    <div><label for="onboarding-model-id">模型 ID</label><div class="onboarding-model-choice"><input id="onboarding-model-id" name="model" list="onboarding-models" required maxlength="200" value="${esc(f.ai.defaults.learning?.model||(provider==='deepseek'?'deepseek-flash':''))}" placeholder="选择或输入模型 ID">
     <button type="button" class="text-button" data-onboarding-action="discover">查找模型</button></div></div>
    <datalist id="onboarding-models"></datalist>
    <div class="onboarding-model-foot"><a data-onboarding-key-link href="${esc(providers[provider].key_url||'')}" ${providers[provider].key_url?'':'hidden'} target="_blank" rel="noopener noreferrer">获取 API Key ${icon('external-link')}</a>
     <button type="submit" class="primary">连接并继续</button></div>
   </fieldset></form>`;
 }
 function assetForm(f){
  const accept='.png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.pptx,.md,.txt';
  return `<form data-onboarding-form="asset" class="onboarding-composer">
   ${f.file?`<div class="onboarding-file">${icon('paperclip')}<span>${esc(f.file.name)}</span><button class="icon-button" type="button" data-onboarding-action="clear-file" aria-label="移除附件" ${attr(f.busy)}>${icon('x')}</button></div>`:''}
   <div class="onboarding-input-row">
    <input type="file" id="onboarding-file" accept="${accept}" hidden ${attr(f.busy)}>
    <button type="button" class="outline-button" data-onboarding-action="attach" ${attr(f.busy)}>${icon('paperclip')}添加附件</button>
    <input name="url" aria-label="${labels[f.step]}订阅链接" placeholder="粘贴${labels[f.step]}订阅链接" value="${esc(f.url)}" ${attr(f.busy)}>
    <button type="submit" class="primary" ${attr(f.busy)}>发送 ${icon('arrow-up')}</button>
   </div>
   <button type="button" class="text-button onboarding-skip" data-onboarding-action="skip" ${attr(f.busy)}>跳过${labels[f.step]}</button>
  </form>`;
 }
 function rowText(row){
  if(row.course)return [row.course,row.class_type,['','周一','周二','周三','周四','周五','周六','周日'][row.weekday],row.time,row.weeks?.length?'Week '+refs().formatWeeks(row.weeks):''].filter(Boolean).join(' · ');
  if(row.title)return [row.title,row.date,row.end?row.start+'–'+row.end:row.start,row.location].filter(Boolean).join(' · ');
  return [row.label||(row.week!=null?'Week '+row.week:({break:'假期',exam:'考试期',nonteaching:'非教学安排'}[row.kind]||'日期安排')),row.start+' 至 '+row.end].join(' · ');
 }
 function reviewRows(rows){
  if(!rows.length)return '';
  const list=values=>`<ul class="onboarding-result-list">${values.map(row=>`<li>${esc(rowText(row))}</li>`).join('')}</ul>`;
  return list(rows.slice(0,5))+(rows.length>5?`<details><summary>查看其余 ${rows.length-5} 项</summary>${list(rows.slice(5))}</details>`:'');
 }
 function reviewMarkup(f){
  const {result,subscription,filename,attachment}=f.review;
  const rows=subscription?[...result.calendar,...result.timetable,...result.events]:result.rows;
  const source=subscription?f.calendar.sources.find(s=>s.type==='subscription'&&s.kind===f.step&&s.url===result.source.url):refs().matchingSource(f.calendar,f.step,filename);
  return `<section class="onboarding-review" aria-label="核对导入结果">
   <strong>${esc(subscription?result.source.name:labels[f.step])}</strong>
   ${source?'<p>保存后会更新同一来源的安排。</p>':''}
   ${result.incomplete?'<p>有部分内容未能确认，请对照原件。</p>':''}
   ${result.reply||result.notice?`<p>${esc(result.reply||result.notice)}</p>`:''}
   ${/^image\/(png|jpeg|webp|gif)$/.test(attachment?.mime)?`<details class="onboarding-original"><summary>查看刚发送的图片</summary><img src="data:${attachment.mime};base64,${attachment.file}" alt="${esc(filename)}"></details>`:''}
   ${reviewRows(rows)}
   <div class="onboarding-review-actions"><button class="outline-button" data-onboarding-action="retry" ${attr(f.busy)}>重新发送</button>
    <button class="primary" data-onboarding-action="confirm" ${attr(f.busy)}>确认并保存</button></div>
  </section>`;
 }
 function draw(f){
  const el=dialog();
  el.innerHTML=`<header class="onboarding-header"><h2 id="onboarding-title">新手引导</h2>
    <button class="text-button" data-onboarding-action="pause" ${attr(f.busy)}>${f.step==='done'?'关闭':'稍后设置'}</button></header>
   <ol class="onboarding-steps" aria-label="设置步骤">${steps.slice(0,-1).map((step,i)=>`<li ${step===f.step?'aria-current="step"':''}><span>${i+1}</span>${labels[step]}</li>`).join('')}</ol>
   <div class="onboarding-chat" aria-label="引导对话">
    ${f.messages.map(m=>`<div class="onboarding-turn ${m.author==='user'?'onboarding-user':''}">${m.author==='user'?'':icon('sparkles')}<p>${esc(m.text)}</p></div>`).join('')}
    ${f.promptSent?'':`<div class="onboarding-turn">${icon('sparkles')}<p>${esc(prompts[f.step])}</p></div>`}
    ${f.review?reviewMarkup(f):''}
    ${f.busy?`<p class="onboarding-status" role="status">${icon('loader-circle')}${esc(f.busy)}</p>`:''}
    <p class="onboarding-error" role="alert" ${f.error?'':'hidden'}>${esc(f.error)}</p>
   </div>
   ${f.step==='model'?(f.ai?modelFields(f):f.error?'<button class="outline-button onboarding-retry" data-onboarding-action="reload">重试</button>':''):
    f.step==='done'?'<footer class="onboarding-finish"><button class="primary" data-onboarding-action="finish">开始学习</button></footer>':
    f.review?'':f.calendar?assetForm(f):f.error?'<button class="outline-button onboarding-retry" data-onboarding-action="reload">重试</button>':''}`;
  if(!el.open)el.showModal();
  icons();
  const chat=el.querySelector('.onboarding-chat');
  chat.scrollTop=f.review?chat.querySelector('.onboarding-review').offsetTop-chat.offsetTop:chat.scrollHeight;
  if(!f.busy&&!f.review&&f.step!=='model')el.querySelector('[name="url"],[data-onboarding-action="attach"],[data-onboarding-action="finish"]')?.focus({preventScroll:true});
 }
 function report(f,message,hint=false){
  if(!live(f))return;
  const box=dialog().querySelector('.onboarding-error');
  f.error=hint?'':message;box.hidden=!message;box.textContent=message;box.classList.toggle('onboarding-hint',hint);
 }
 async function load(f){
  f.busy='正在读取设置…';draw(f);
  try{
   if(f.step==='model'){f.ai=await api('/api/ai');f.provider=profile(f)?.provider||'deepseek';}
   else if(f.step!=='done')f.calendar=await api('/api/calendar');
  }catch(error){f.error=error.message;}
  finally{if(live(f)){f.busy='';draw(f);}}
 }
 async function open({automatic=false}={}){
  if(!S.user||S.demonstration||dialog().open||modal.open||S.busy||S.threadBusy)return;
  const owner=S.user.id,saved=read(owner);
  if(automatic&&(saved?!saved.open:owner!=='local'||S.settings.connected))return;
  let step=saved?.step==='exam'?'done':steps.includes(saved?.step)&&saved.step!=='done'?saved.step:'model';
  const afterModel=step==='model'?'calendar':step;
  if(!S.settings.connected)step='model';
  else if(step==='model')step='calendar';
  flow={owner,step,afterModel,messages:[],busy:'',error:'',file:null,url:'',review:null};
  remember(owner,afterModel,true);
  await load(flow);
 }
 function setProvider(f,form){
  const provider=form.elements.provider.value,current=profile(f),selected=f.ai.providers[provider];
  f.provider=provider;
  const reuse=current?.provider===provider;
  const address=form.elements.base;
  address.value=reuse?current.base:selected.base;
  address.closest('label').hidden=provider!=='custom'&&address.value===selected.base;
  form.elements.model.value=reuse?f.ai.defaults.learning.model:provider==='deepseek'?'deepseek-flash':'';
  form.elements.key.value='';
  form.querySelector('datalist').replaceChildren();
  const link=form.querySelector('[data-onboarding-key-link]');
  link.hidden=!selected.key_url;link.href=selected.key_url||'';
  report(f,'');
 }
 async function connect(f,form,discover){
  const fields=form.elements,provider=fields.provider.value,base=fields.base.value.trim();
  const current=[f.savedConnection,profile(f)].find(service=>service?.provider===provider&&service.base===base);
  const reuse=!!current;
  const payload={id:reuse?current.id:'',provider,base,key:fields.key.value,model:fields.model.value.trim()};
  if(!payload.key.trim()){report(f,'请填写 API Key。');fields.key.focus();return;}
  if(!base||!fields.base.checkValidity()){report(f,'请填写有效的 API 基础地址。');fields.base.focus();return;}
  if(!discover&&!payload.model){report(f,'请选择或填写模型 ID。');fields.model.focus();return;}
  f.busy=discover?'正在查找模型…':'正在验证连接…';
  const fieldset=form.querySelector('fieldset'),pause=dialog().querySelector('[data-onboarding-action="pause"]');
  fieldset.disabled=pause.disabled=true;report(f,f.busy,true);
  try{
   if(discover){
    const result=await api('/api/ai/models',payload);
    const models=result.models||[];
    form.querySelector('datalist').innerHTML=models.map(id=>`<option value="${esc(id)}">${esc(result.model_names?.[id]||id)}</option>`).join('');
    if(!fields.model.value&&models.length===1)fields.model.value=models[0];
    report(f,models.length?'可从模型 ID 输入框选择，也可以手动填写。':'没有返回模型，请手动填写模型 ID。',true);
    return;
   }
   // Keep every existing enabled model when reconnecting an account.
   const models=[...new Set([...(reuse?current.models:[]),payload.model])];
   f.ai=await api('/api/ai/save',{...payload,models,name:reuse?current.name:undefined,model_names:reuse?current.model_names:{}});
   const saved=f.ai.services.find(service=>service.id===f.ai.saved_id);
   f.savedConnection=saved;
   if(f.ai.defaults.learning?.id!==saved.id||f.ai.defaults.learning.model!==payload.model)
    f.ai=await api('/api/ai/default',{scope:'learning',id:saved.id,model:payload.model});
   fields.key.value='';
   const active=f.ai.services.find(service=>service.id===f.ai.defaults.learning?.id);
   if(!active?.verified_models?.includes(f.ai.defaults.learning.model))throw new Error('学习模型尚未连接，请重试。');
   S.settings={...S.settings,connected:true,has_key:true,model:f.ai.defaults.learning.model,
    translation_connected:f.ai.defaults.translation?S.settings.translation_connected:true};
   say(f,'assistant',prompts.model);
   say(f,'assistant','已连接 '+active.name+' · '+f.ai.defaults.learning.model+'。');
   go(f,f.afterModel);
   await load(f);
  }catch(error){report(f,error.message);}
  finally{if(live(f)){f.busy='';fieldset.disabled=pause.disabled=false;if(discover)fields.model.focus();}}
 }
 function selectFile(f,files){
  if(f.busy||f.review||!f.calendar||f.step==='done'||!files.length)return;
  if(files.length!==1){report(f,'请一次发送一份文件。');return;}
  f.file=files[0];f.url='';f.error='';draw(f);
 }
 async function send(f){
  if(!f.file&&!f.url){report(f,'请添加文件或粘贴订阅链接。');return;}
  f.busy=f.file?'正在识别附件…':'正在读取订阅…';
  f.error='';
  if(!f.promptSent){say(f,'assistant',prompts[f.step]);f.promptSent=true;}
  say(f,'user',f.file?f.file.name:labels[f.step]+'订阅链接');draw(f);
  try{
   if(f.file){
    const attachment=await refs().attachment(f.file);
    const result=await api('/api/calendar/import',{kind:f.step,attachments:[attachment]});
    if(!result.rows.length)throw new Error(result.reply||'没有识别到安排，请换一张清晰的图片或文件。');
    f.review={result,attachment,filename:attachment.filename};
   }else{
    const url=f.url.replace(/^webcal:\/\//i,'https://');
    const existing=f.calendar.sources.find(row=>row.type==='subscription'&&row.kind===f.step&&row.url===url);
    const result=await refs().readSubscription(existing||{url,kind:f.step});
    if(!result.calendar.length&&!result.timetable.length&&!result.events.length)throw new Error('订阅中没有读到安排，请核对链接。');
    f.review={result,subscription:true};
   }
  }catch(error){f.error=error.message;}
  finally{if(live(f)){f.busy='';draw(f);}}
 }
 async function confirm(f){
  f.busy='正在保存…';f.error='';draw(f);
  try{
   const {result,subscription,attachment,filename}=f.review;
   const draft={...structuredClone(f.calendar),referenceFiles:[]};
   if(subscription)refs().stageSubscription(draft,result,draft.sources.find(s=>s.type==='subscription'&&s.kind===f.step&&s.url===result.source.url));
   else refs().stageImport(draft,f.step,result,[attachment],filename);
   const {referenceFiles,...document}=draft;
   f.calendar=await api('/api/calendar',{...document,reference_files:referenceFiles});
   say(f,'assistant','已保存'+labels[f.step]+'。');
   next(f);
   root.StudyLearningHome?.updateCalendar(f.calendar);
  }catch(error){
   f.error=error.message;
   if(error.status===409){
    try{const latest=await api('/api/calendar');if(latest.etag!==f.calendar.etag){f.calendar=latest;f.error='日历在别处更新过。已读取最新版，请重新核对，再确认保存。';}}
    catch{/* Keep the reviewed import available for retry. */}
   }
  }finally{if(live(f)){f.busy='';draw(f);}}
 }
 function install(){
  const el=dialog();
  el.addEventListener('cancel',event=>{event.preventDefault();if(flow)pause(flow);});
  el.addEventListener('submit',async event=>{
   event.preventDefault();event.stopPropagation();
   const f=flow;if(!f||f.busy)return;
   if(event.target.dataset.onboardingForm==='model')await connect(f,event.target,false);
   else await send(f);
  });
  el.addEventListener('click',async event=>{
   const action=event.target.closest('[data-onboarding-action]')?.dataset.onboardingAction;
   const f=flow;if(!action||!f||f.busy)return;
   if(action==='attach'){el.querySelector('#onboarding-file').click();return;}
   if(action==='discover'){await connect(f,el.querySelector('form'),true);return;}
   if(action==='confirm'){await confirm(f);return;}
   if(action==='pause'||action==='finish'){pause(f);return;}
   if(action==='reload'){await load(f);return;}
   if(action==='skip'){if(!f.promptSent)say(f,'assistant',prompts[f.step]);say(f,'assistant','已跳过'+labels[f.step]+'，之后可以在学习设置里补上。');next(f);}
   if(action==='clear-file'){f.file=null;f.error='';}
   if(action==='retry'){f.review=null;f.error='';}
   draw(f);
  });
  el.addEventListener('change',event=>{
   const f=flow;if(!f||f.busy)return;
   const input=event.target;
   if(input.id==='onboarding-file')selectFile(f,[...input.files]);
   if(input.name==='provider')setProvider(f,input.form);
  });
  el.addEventListener('input',event=>{
   if(!flow||event.target.name!=='url')return;
   flow.url=event.target.value.trim();
   if(flow.url&&flow.file){flow.file=null;el.querySelector('.onboarding-file')?.remove();}
  });
  el.addEventListener('paste',event=>{
   if(!el.querySelector('[data-onboarding-form="asset"]'))return;
   const files=[...(event.clipboardData?.files||[])].filter(file=>file.type.startsWith('image/'));
   if(files.length){event.preventDefault();selectFile(flow,files);}
  });
  el.addEventListener('dragover',event=>{if(el.querySelector('[data-onboarding-form="asset"]'))event.preventDefault();});
  el.addEventListener('drop',event=>{
   if(!el.querySelector('[data-onboarding-form="asset"]'))return;
   event.preventDefault();selectFile(flow,[...(event.dataTransfer?.files||[])]);
  });
 }
 root.StudyOnboarding={install,open,isOpen:()=>dialog().open};
})(window);
