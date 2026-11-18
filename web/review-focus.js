/* Review keeps the document primary; tools appear only when requested. */
(function(root){
 'use strict';
 root.StudyReview={install(){
  const base={header,readingToolbar,selectionToolbar,notePage,render,renderDrawer,openThread,showReadingComment};
  const R={key:'',tools:false,left:false,selected:'',draft:null,error:''};
  const prefs={left:260,right:340};let layoutUser='',drag=null;
  let readingPane=null;
  const readingKey=()=>`study-review-position-${S.user?.id||'guest'}`;
  function rememberReading(){
   if(!readingPane)return;
   const {content,courseId,noteId,key}=readingPane,top=content.scrollTop;
   if(top===readingPane.top)return;
   readingPane.top=top;
   try{localStorage.setItem(key,JSON.stringify({courseId,noteId,top}));}catch{}
  }
  root.StudyReview.lastPosition=()=>{
   try{
    const saved=JSON.parse(localStorage.getItem(readingKey()));
    if(typeof saved?.courseId==='string'&&typeof saved.noteId==='string'&&Number.isFinite(saved.top)&&saved.top>=0)return saved;
   }catch{}
   return null;
  };
  root.StudyReview.restorePosition=position=>{
   requestAnimationFrame(()=>{
    if(readingPane?.courseId!==position.courseId||readingPane.noteId!==position.noteId)return;
    readingPane.content.scrollTo({top:position.top,behavior:'instant'});
   });
  };
  window.addEventListener('pagehide',rememberReading);
  const reviewing=()=>['note','unit-review'].includes(S.view);
  function touch(){loadPrefs();const key=S.course?.id+'/'+(S.note?.id||'empty');if(R.key!==key){R.key=key;R.tools=true;R.left=false;R.selected='';R.draft=null;R.error='';}}
  function loadPrefs(){const user=S.user?.id||'local';if(layoutUser===user)return;layoutUser=user;Object.assign(prefs,{left:260,right:340});try{const saved=JSON.parse(localStorage.getItem('study-review-layout-'+user)||'{}');for(const [key,min,max] of [['left',200,600],['right',240,640]]){if(Number.isFinite(saved[key]))prefs[key]=Math.min(max,Math.max(min,saved[key]));}}catch{}readingSize=16;}
  function savePrefs(){try{localStorage.setItem('study-review-layout-'+layoutUser,JSON.stringify(prefs));}catch{}}
  function applyPrefs(){const available=document.querySelector('.main')?.clientWidth||window.innerWidth;if(window.innerWidth>850){const limit=Math.max(440,available-340);let excess=(R.left?prefs.left:0)+(document.body.classList.contains('discussion-open')?prefs.right:0)-limit;if(excess>0&&document.body.classList.contains('discussion-open')){const cut=Math.min(excess,prefs.right-240);prefs.right-=cut;excess-=cut;}if(excess>0&&R.left)prefs.left=Math.max(200,prefs.left-excess);}const style=document.body.style;style.setProperty('--review-left',prefs.left+'px');style.setProperty('--review-right',prefs.right+'px');document.querySelector('#note-body')?.style.setProperty('--reading-size','16px');readingSize=16;document.querySelectorAll('[data-review-resize]').forEach(el=>el.setAttribute('aria-valuenow',prefs[el.dataset.reviewResize]));}
  function handle(side){return `<div class="review-resizer" data-review-resize="${side}" role="separator" tabindex="0" aria-orientation="vertical" aria-label="调整${side==='left'?'批注栏':'AI 栏'}宽度" aria-valuemin="${side==='left'?200:240}" aria-valuemax="${side==='left'?600:640}" aria-valuenow="${prefs[side]}" title="拖动调整宽度，双击还原"></div>`;}
  function mountDrawer(){if(S.view!=='note')return;const layout=document.querySelector('.review-document-body'),root=document.querySelector('#drawer-root');if(layout&&root&&document.body.classList.contains('discussion-open'))layout.append(root);}
  function closeMenu(focus=false){const menu=document.querySelector('.review-menu');if(menu){menu.open=false;if(focus)menu.querySelector('summary')?.focus();}}
  function menuItem(command,label,glyph,disabled=false){return `<button type="button" role="menuitem" data-action="review-command" data-command="${command}" ${disabled?'disabled':''}>${icon(glyph)}<span>${label}</span></button>`;}
  header=function(){
   if(!reviewing()){R.key='';R.tools=false;R.left=false;R.draft=null;return base.header();}
   touch();const c=S.course,waiting=S.busy||S.threadBusy,hasNote=!!S.note,editing=!!S.editing,aiOpen=!!document.body?.classList?.contains('discussion-open');
   const items=[menuItem('find','查找正文','search',!hasNote||editing),menuItem('tags','标签与详细信息','tag',editing||waiting),menuItem('export','导出…','download',!hasNote||editing)].join('');
   return `<header class="review-focus-header"><span class="review-document-title">${esc([c.tags?.course||c.course_label,S.note?.title||c.title].filter(Boolean).join(' / '))}</span><div class="review-header-actions"><button class="icon-button ${R.left?'selected':''}" data-action="review-panel" aria-label="批注" aria-expanded="${R.left}" title="批注" ${!hasNote||editing?'disabled':''}>${icon('message-square-text')}</button><button class="icon-button ${aiOpen?'selected':''}" data-action="review-ai" aria-label="AI 对话" aria-expanded="${aiOpen}" title="${aiOpen?'收起 AI 对话':'AI 对话'}" ${waiting||!hasNote||editing?'disabled':''}>${icon('sparkles')}</button><button type="button" class="icon-button" data-action="review-mode" data-mode="${editing?'read':'edit'}" aria-label="${editing?'编辑':'阅读'}" title="${editing?'编辑 · 点击切换到阅读':'阅读 · 点击切换到编辑'}" ${!hasNote||waiting?'disabled':''}>${icon(editing?'square-pen':'book-open')}</button><details class="review-menu"><summary class="icon-button" role="button" aria-label="更多工具" aria-haspopup="menu" aria-expanded="false" title="更多">${icon('ellipsis')}</summary><div class="review-menu-content" role="menu" aria-label="笔记工具">${items}</div></details></div></header>`;
  };
  const inks={black:'黑色',blue:'蓝色',red:'红色'};
  function colorTool(tool,label,glyph,key){
   const highlight=tool==='highlight';
   const palette=highlight?markColors:inks;
   const swatch=highlight?'color-swatch color-':'ink-swatch ink-';
   const current=highlight?readingColor:underlineColor;
   const id=`review-${tool}-colors-${key}`;
   return `<div class="review-color-tool" data-review-tool="${tool}"><button type="button" data-review-palette aria-label="${label}" aria-expanded="false" aria-controls="${id}" title="${label}">${icon(glyph)}${icon('chevron-down')}</button><div class="review-color-palette" id="${id}" role="group" aria-label="${label}颜色" hidden>${Object.entries(palette).map(([color,name])=>`<button type="button" data-review-color="${color}" class="${swatch+color}${color===current?' chosen':''}" aria-label="${name}${label}" aria-pressed="${color===current}" title="${name}${label}"></button>`).join('')}</div></div>`;
  }
  function reviewToolbar(key='bar'){
   const tool=(action,glyph,label,showLabel=false)=>`<button type="button" data-action="${action}" data-requires-selection aria-label="${label}" title="${label}" disabled>${icon(glyph)}${showLabel?label:''}</button>`;
   return `<div class="reading-toolbar review-reading-toolbar" role="toolbar" aria-label="阅读工具"><div class="reading-tool-group">${colorTool('highlight','荧光笔','highlighter',key)}${colorTool('underline','下划线','underline',key)}${tool('strike','strikethrough','删除线')}${tool('clear-mark','eraser','清除标记')}</div><div class="reading-tool-group">${tool('pronounce','volume-2','发音',true)}${tool('translate','languages','翻译',true)}</div></div>`;
  }
  readingToolbar=function(){if(reviewing()){touch();if(S.editing||!R.tools)return '';}return S.view==='note'?reviewToolbar():base.readingToolbar();};
  selectionToolbar=function(){
   if(S.view!=='note')return base.selectionToolbar();
   return reviewToolbar('selection');
  };
  notePage=function(){return base.notePage().replace(/<div class="note-metadata">[\s\S]*?<\/div>/,'');};
  root.StudyReview.toolsVisible=()=>R.tools;
  const comments=()=> (S.course?.highlights||[]).filter(m=>m.target===S.note?.id&&m.style==='comment');
  const threads=()=> S.note?.discussions||[];
  const conciseSummary=text=>String(text||'').replace(/^疑问[：:][\s\S]*?关键解释[：:]\s*/,'').replace(/\s*未解决[：:]\s*无[。. ]*$/,'');
  const blockTitle=id=>S.course?.blocks?.find(b=>b.id===id)?.title||'笔记';
  function panel(){
   let content='';
   if(R.draft){
    content=`<form id="review-comment-form"><blockquote class="comment-quote">${esc(R.draft.quote)}</blockquote><textarea name="comment" aria-label="批注内容" maxlength="2000" required placeholder="写下你的理解或疑问…">${esc(R.draft.comment||'')}</textarea><div class="error-message" role="alert">${esc(R.error)}</div><div class="review-comment-actions">${R.draft.id?'<button type="button" data-action="review-delete-comment">删除</button>':''}<button type="button" data-action="review-cancel-comment">取消</button><button type="submit" class="primary">保存</button></div></form>`;
   }else{
    const manual=comments().map(m=>`<article class="review-annotation"><button class="review-annotation-open" data-action="review-comment" data-id="${esc(m.id)}"><blockquote>${esc(m.quote)}</blockquote><p>${esc(m.comment)}</p></button></article>`).join('');
    const discussions=threads().map(t=>{
     const selected=R.selected===t.id;
     return `<article class="review-annotation ${selected?'selected':''}"><button class="review-annotation-open" data-action="review-thread" data-id="${esc(t.id)}" aria-expanded="${selected}"><span class="review-annotation-location">${esc(t.anchor_status==='unlocated'?'未定位':blockTitle(t.block_id))}</span><strong>${esc(t.title)}</strong></button>${selected?`${t.quote?`<blockquote>${esc(t.quote)}</blockquote>`:''}${t.summary?`<div class="markdown review-annotation-summary">${md(conciseSummary(t.summary))}</div>`:''}<details class="review-thread-history" ${!t.summary?'open':''}><summary>对话</summary>${(t.messages||[]).map(m=>`<div class="review-annotation-message"><span>${m.role==='user'?'我':'AI'}</span><div class="markdown">${md(m.content)}</div></div>`).join('')}</details><button class="text-button" data-action="review-continue" data-id="${esc(t.id)}">继续追问 ${icon('arrow-up-right')}</button>`:''}</article>`;
    }).join('');
    content=manual+discussions||'<p class="review-annotations-empty">暂无批注</p>';
   }
   return `<aside class="review-annotations" aria-label="笔记批注"><header><span>批注</span><button class="icon-button" data-action="review-close-panel" aria-label="收起批注" title="收起批注">${icon('x')}</button></header><div class="review-annotations-scroll">${content}</div>${handle('left')}</aside>`;
  }
  function openAnnotations(id=''){touch();R.left=true;R.draft=null;R.error='';R.selected=id;render();document.querySelector('.review-annotation.selected')?.scrollIntoView({block:'nearest'});}
  function selectThread(id){R.draft=null;R.selected=R.selected===id?'':id;render();}
  function editComment(mark){
   const draft=mark?{...mark}:{...selectionAnchor,target:S.note?.id};if(!draft.quote)return;
   touch();R.left=true;R.draft=draft;R.error='';document.querySelector('#selection-tools').hidden=true;window.getSelection()?.removeAllRanges();render();document.querySelector('#review-comment-form textarea')?.focus();
  }
  render=function(){
   rememberReading();
   const previousReading=readingPane;
   readingPane=null;
   const drawerRoot=document.querySelector('#drawer-root');if(drawerRoot&&document.querySelector('#app')?.contains(drawerRoot))document.body.append(drawerRoot);
   document.body.classList.toggle('review-active',S.view==='note');
   base.render();
   if(S.view!=='note')return;applyPrefs();
   const content=document.querySelector('.main>.content-scroll');if(!content)return;
   const layout=document.createElement('div');layout.className='review-reading-layout';content.before(layout);layout.innerHTML=root.StudyNavigation.reviewTreeMarkup?.()||'';const pane=document.createElement('section');pane.className='review-document-pane';const heading=document.querySelector('.main>.review-focus-header');if(heading)pane.append(heading);const tools=document.querySelector('.main>.reading-toolbar');if(tools)pane.append(tools);
   if(!S.editing)pane.insertAdjacentHTML('beforeend',readingFindMarkup());
   const body=document.createElement('div');body.className='review-document-body';body.innerHTML=!S.editing&&R.left?panel():'';body.append(content);pane.append(body);layout.append(pane);mountDrawer();icons();
   if(!S.editing&&S.note&&S.course){
    const courseId=S.course.id,noteId=S.note.id,key=readingKey();
    if(previousReading?.key===key&&previousReading.courseId===courseId&&previousReading.noteId===noteId){
     content.scrollTo({top:previousReading.top,behavior:'instant'});
    }
    readingPane={content,courseId,noteId,key,top:undefined};
   }
  };
  renderDrawer=function(){base.renderDrawer();if(S.view!=='note')return;
   const drawer=document.querySelector('.discussion-drawer');if(!drawer)return;
   const toggle=document.querySelector('[data-action="review-ai"]');if(toggle){toggle.setAttribute('aria-expanded','true');toggle.classList.add('selected');toggle.title='收起 AI 对话';}
   drawer.setAttribute('aria-label','AI 对话');const title=drawer.querySelector('.drawer-heading>span');if(title)title.textContent='AI';
   const close=drawer.querySelector('[data-action="close-drawer"]');if(close)close.setAttribute('aria-label','关闭 AI 对话');
   const context=drawer.querySelector('.drawer-context');if(context){if(S.thread||S.pendingQuote){context.querySelector('span')?.remove();}else context.remove();}
   drawer.querySelector('.thread-empty')?.remove();drawer.querySelector('.composer-caption')?.remove();
   drawer.insertAdjacentHTML('afterbegin',handle('right'));mountDrawer();applyPrefs();icons();
  };
  openThread=async function(id){if(S.view!=='note')return base.openThread(id);openAnnotations(id);};
  showReadingComment=function(mark){if(S.view!=='note')return base.showReadingComment(mark);editComment(mark);};
  root.StudyReview.annotationPanel=panel;
  document.addEventListener('click',async event=>{
   if(S.view!=='note')return;
   const button=event.target.closest('[data-action]');if(!button)return;
   const action=button.dataset.action;
   if(!['review-mode','review-ai','review-panel','review-close-panel','review-comment','review-thread','review-continue','review-cancel-comment','review-delete-comment','block-annotations','note-threads'].includes(action))return;
   event.preventDefault();event.stopImmediatePropagation();
   if(button.disabled)return;
   try{
    if(action==='review-mode'){
     if(S.busy||S.threadBusy||!S.note)return;
     if(button.dataset.mode==='edit'){
      R.tools=false;R.left=false;R.draft=null;selectionAnchor=null;
      document.querySelector('#selection-tools')?.setAttribute('hidden','');
      window.getSelection()?.removeAllRanges();stopPronunciation();beginEditing();
     }else{
      if(S.editing&&!await saveEditingNote())return;
      S.editing=false;R.tools=true;render();
     }
    }
    else if(action==='review-ai'){if(S.threadBusy)return;if(document.body.classList.contains('discussion-open'))closeDrawer();else{S.selectedNoteBlock=null;openDiscussion();}}
    else if(action==='review-panel'){R.left=!R.left;render();}
    else if(action==='review-close-panel'){R.left=false;render();}
    else if(action==='review-comment'){editComment(comments().find(m=>m.id===button.dataset.id));}
    else if(action==='review-thread'){selectThread(button.dataset.id);}
    else if(action==='review-continue'){const thread=threads().find(t=>t.id===button.dataset.id);if(thread)openDiscussion(thread.quote,thread);}
    else if(action==='review-cancel-comment'){R.draft=null;R.error='';render();}
    else if(action==='review-delete-comment'){const mark=R.draft;if(!mark?.id)return;button.disabled=true;updateCourse(await api(courseUrl('highlight'),{...mark,style:'remove',remove_ids:[mark.id]}));R.draft=null;render();}
    else if(action==='block-annotations'){const t=threads().find(t=>t.block_id===button.dataset.id&&t.anchor_status!=='unlocated');openAnnotations(t?.id);}
    else openAnnotations();
   }catch(error){R.error=error.message;if(R.draft)render();else toast(error.message);}
  },true);
  document.addEventListener('input',event=>{if(event.target.matches('#review-comment-form textarea')&&R.draft)R.draft.comment=event.target.value;});
  document.addEventListener('submit',async event=>{
   if(event.target.id!=='review-comment-form')return;event.preventDefault();event.stopImmediatePropagation();
   const button=event.target.querySelector('[type="submit"]');if(button.disabled||!R.draft)return;button.disabled=true;
   const mark={...R.draft,style:'comment',comment:event.target.elements.comment.value};
   try{updateCourse(await api(courseUrl('highlight'),mark));R.draft=null;R.error='';selectionAnchor=null;render();}catch(error){R.error=error.message;render();}
  },true);

  function resize(side,value){const main=document.querySelector('.main'),available=main?.clientWidth||window.innerWidth;const other=side==='left'?(document.body.classList.contains('discussion-open')?prefs.right:0):(R.left?prefs.left:0);const min=side==='left'?200:240,max=Math.max(min,Math.min(side==='left'?600:640,available-other-340));prefs[side]=Math.round(Math.max(min,Math.min(max,value)));applyPrefs();}
  document.addEventListener('pointerdown',event=>{const grip=event.target.closest('[data-review-resize]');if(!grip||S.view!=='note')return;event.preventDefault();drag={side:grip.dataset.reviewResize,start:event.clientX,width:prefs[grip.dataset.reviewResize],grip,pointer:event.pointerId};grip.setPointerCapture(event.pointerId);document.body.classList.add('review-resizing');},true);
  document.addEventListener('pointermove',event=>{if(!drag)return;resize(drag.side,drag.width+(event.clientX-drag.start)*(drag.side==='left'?1:-1));});
  function finishResize(){if(!drag)return;try{drag.grip.releasePointerCapture(drag.pointer);}catch{}drag=null;document.body.classList.remove('review-resizing');savePrefs();}
  document.addEventListener('pointerup',finishResize);document.addEventListener('pointercancel',finishResize);
  document.addEventListener('dblclick',event=>{const grip=event.target.closest('[data-review-resize]');if(!grip)return;prefs[grip.dataset.reviewResize]=grip.dataset.reviewResize==='left'?260:340;applyPrefs();savePrefs();});
  document.addEventListener('keydown',event=>{const grip=event.target.closest?.('[data-review-resize]');if(!grip||!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;event.preventDefault();const side=grip.dataset.reviewResize;resize(side,event.key==='Home'?(side==='left'?260:340):prefs[side]+(event.key==='ArrowRight'?16:-16)*(side==='left'?1:-1));savePrefs();},true);

  window.addEventListener('resize',()=>{if(S.view==='note'){if(R.left)resize('left',prefs.left);if(document.body.classList.contains('discussion-open'))resize('right',prefs.right);}});

  function showFind(){const find=document.querySelector('.review-document-pane .reading-find');if(find){find.hidden=false;find.querySelector('input').focus();}}
  function setPalette(tool,open){
   tool.querySelector('[data-review-palette]').setAttribute('aria-expanded',String(open));
   tool.querySelector('.review-color-palette').hidden=!open;
  }
  function closePalettes(except){
   document.querySelectorAll('.review-color-tool:has([aria-expanded="true"])').forEach(tool=>{if(tool!==except)setPalette(tool,false);});
  }
  document.addEventListener('click',async event=>{
   const button=event.target.closest('[data-review-palette],[data-review-color]');
   if(!button||S.view!=='note'||S.editing)return;
   const tool=button.closest('.review-color-tool');
   if(button.hasAttribute('data-review-palette')){
    closePalettes(tool);
    setPalette(tool,button.getAttribute('aria-expanded')!=='true');
    return;
   }
   const style=tool.dataset.reviewTool,color=button.dataset.reviewColor;
   if(style==='highlight')readingColor=color;else underlineColor=color;
   for(const swatch of document.querySelectorAll(`[data-review-tool="${style}"] [data-review-color]`)){
    const chosen=swatch.dataset.reviewColor===color;
    swatch.classList.toggle('chosen',chosen);
    swatch.setAttribute('aria-pressed',String(chosen));
   }
   closePalettes();
   try{if(selectionAnchor)await addMark(style,color);}catch(error){toast(error.message);}
   if(event.detail===0)document.querySelector(`[data-review-tool="${style}"] [data-review-palette]`)?.focus();
  },true);
  document.addEventListener('click',async event=>{
   const button=event.target.closest('[data-action="review-command"]');if(!button)return;
   event.preventDefault();event.stopImmediatePropagation();closeMenu();
   if(button.disabled)return;
   try{switch(button.dataset.command){
    case 'find':showFind();break;
    case 'tags':await root.StudyUnits.showTags();break;
    case 'export':showNoteExport();break;
   }}catch(error){toast(error.message);}
  },true);
  document.addEventListener('pointerdown',event=>{
   if(!event.target.closest('.review-menu'))closeMenu();
   if(!event.target.closest('.review-color-tool'))closePalettes();
  },true);
  document.addEventListener('toggle',event=>{if(event.target.matches?.('.review-menu'))event.target.querySelector('summary')?.setAttribute('aria-expanded',String(event.target.open));},true);
  document.addEventListener('keydown',event=>{
   if(S.view==='note'&&!S.editing&&(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='f'){event.preventDefault();event.stopImmediatePropagation();showFind();return;}
   const palette=document.querySelector('[data-review-palette][aria-expanded="true"]');
   if(palette&&event.key==='Escape'){
    event.preventDefault();event.stopImmediatePropagation();closePalettes();palette.focus();return;
   }
   const menu=document.querySelector('.review-menu[open]');if(!menu)return;
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeMenu(true);return;}
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const items=[...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')],i=items.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}
  },true);
 }};
})(typeof window==='undefined'?{}:window);
