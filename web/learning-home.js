/* Start learning from an import or a recent conversation, without browsing folders. */
(function(root){
 'use strict';
 function records(courses,entries,{query=''}={}){
  const byId=new Map(courses.map(c=>[c.id,c])),seen=new Set(),rows=[];
  for(const row of entries){
   const course=byId.get(row.unit_id),identity=course?'unit:'+course.id:row.id;if(seen.has(identity))continue;seen.add(identity);
   if(row.available===false||course?.status==='completed')continue;
   const block=course?((course.status!=='planning'&&course.blocks?.find(b=>b.id===course.active&&!course.completed?.includes(b.id)))||course.blocks?.find(b=>!course.completed?.includes(b.id))):null;
   const location=course?.status==='planning'?'待开始':block?.title||(course?.blocks?.length&&course.blocks.every(b=>course.completed?.includes(b.id))?'待整理笔记':'尚未开始');
   const title=course?.title||row.title.replace(/\.(md|txt|pdf|pptx|docx)$/i,'');
   const keywords=[title,row.course,row.class_type,...(row.weeks||[]).map(w=>'Week '+w)].join(' ').toLocaleLowerCase();
   if(!query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(q=>keywords.includes(q)))continue;
   rows.push({...row,title,location,updated:course?.updated_at||course?.created_at||row.created_at||''});
  }
  return rows.sort((a,b)=>b.updated.localeCompare(a.updated)||a.title.localeCompare(b.title,'zh-CN',{numeric:true}));
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={records};return;}
 let config=null,owner='',query='',expanded=false,opening=false;
 function resetOwner(){const next=S.user?.id||'guest';if(next===owner)return;owner=next;query='';expanded=false;}
 function markup({scope,entries}){
  resetOwner();const filtered=entries,available=records(S.courses,filtered),items=records(S.courses,filtered,{query}),visible=expanded||query?items:items.slice(0,5),empty=!available.length&&!query;
  const search=`<label class="learning-history-search">${icon('search')}<input id="learning-history-search" aria-label="搜索学习记录" placeholder="搜索学习记录" value="${esc(query)}"></label>`;
  const rows=visible.map(r=>{
   const location=['待开始','尚未开始'].includes(r.location)?'待开始':r.location==='待整理笔记'?r.location:'接着学：'+r.location;
   return `<button type="button" class="learning-record" data-action="nav-select" data-id="${esc(r.id)}" aria-label="${esc(r.title)}" aria-haspopup="menu"><span class="learning-record-mark">${icon('messages-square')}</span><span class="learning-record-title"><strong>${esc(r.title)}</strong><small><span class="learning-record-course">${esc(r.course||'未设置课程')}</span><span class="learning-record-location">${esc(location)}</span></small></span>${icon('arrow-up-right')}</button>`;
  }).join('');
  return `<section class="learning-home ${empty?'is-empty':'has-learning'}" aria-label="学习首页"><header class="learning-home-toolbar">${search}</header><div class="learning-home-content"><section class="learning-import" aria-label="导入课件" data-learning-drop><div class="learning-import-copy"><h1>导入课件</h1><p>拖入文件，或<button type="button" class="text-button" data-learning-action="paste">粘贴内容</button></p></div><button type="button" class="outline-button learning-choose" data-learning-action="choose" title="PDF、PPTX、Word、文字或图片，最大 15 MB">${icon('plus')}选择课件</button><input id="learning-home-file" type="file" aria-label="选择新课件" accept=".pdf,.pptx,.docx,.md,.txt,.png,.jpg,.jpeg,.webp" hidden></section>${empty?'':`<section class="learning-recents" aria-label="学习记录"><header><h2>继续学习</h2></header><div class="learning-record-list">${rows||`<p class="learning-no-records">${query?'没有找到相关记录':'暂无未完成的学习'}</p>`}</div>${!expanded&&!query&&items.length>5?'<button type="button" class="learning-more" data-learning-action="more">显示更多</button>':''}</section>`}</div></section>`;
 }
 async function openImport(file,paste=false){
  if(opening||S.busy||S.threadBusy)return;opening=true;
  try{
   if(file&&(!file.size||file.size>15*1024*1024))throw new Error('请选择 15 MB 以内的非空课件。');
   S.libraryCourse='';await showResourceImport();const form=document.querySelector('#resource-upload-form');if(!form)return;
   if(file){const transfer=new DataTransfer();transfer.items.add(file);form.elements.attachment.files=transfer.files;await recognizeUpload(file);}
   if(paste){const section=form.querySelector('details.or-paste');if(section)section.open=true;form.elements.text?.focus();}
  }catch(error){toast(error.message);}finally{opening=false;}
 }
 root.StudyLearningHome={markup,install(options){config=options;
  document.addEventListener('click',async event=>{const button=event.target.closest('[data-learning-action]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();if(S.busy||S.threadBusy)return;
   if(button.dataset.learningAction==='choose')document.querySelector('#learning-home-file')?.click();
   else if(button.dataset.learningAction==='paste')await openImport(null,true);
   else if(button.dataset.learningAction==='more'){expanded=true;render();}
  },true);
  document.addEventListener('change',async event=>{if(event.target.id!=='learning-home-file')return;const file=event.target.files[0];event.target.value='';if(file)await openImport(file);},true);
  document.addEventListener('input',event=>{if(event.target.id!=='learning-history-search')return;const start=event.target.selectionStart,end=event.target.selectionEnd;query=event.target.value;render();const next=document.querySelector('#learning-history-search');next?.focus();next?.setSelectionRange(start,end);},true);
  document.addEventListener('dragover',event=>{const target=event.target.closest('[data-learning-drop]');if(!target)return;event.preventDefault();target.classList.add('dragging');});
  document.addEventListener('dragleave',event=>{const target=event.target.closest('[data-learning-drop]');if(target&&!target.contains(event.relatedTarget))target.classList.remove('dragging');});
  document.addEventListener('drop',async event=>{const target=event.target.closest('[data-learning-drop]');if(!target)return;event.preventDefault();target.classList.remove('dragging');if(event.dataTransfer.files.length>1){toast('请每次导入一份课件。');return;}const file=event.dataTransfer.files[0];if(file)await openImport(file);});
 }};
})(typeof window==='undefined'?{}:window);
