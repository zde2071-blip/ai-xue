/* Each exam has its own materials, extracted information and quiz attempts. */
(function(root){
 'use strict';
 const code=value=>String(value||'').trim().replace(/^([a-z]{2,6})\s*(\d{2,4})(?![a-z0-9]).*$/i,(_,a,b)=>(a+b).toUpperCase());
 const when=r=>r.date?(r.date_end?`${r.date} 至 ${r.date_end}`:[r.date,r.start].filter(Boolean).join(' ')):(r.timing||'日期待确认');
 if(typeof module!=='undefined'&&module.exports){module.exports={code,when};return;}
 let D=null,loading=false,error='',examId='',semester='',dialog=null,saving=false,tab='materials',paperSession=null,viewedAttempt='';
 const E=v=>esc(v),I=v=>icon(v);
 async function load(){if(loading)return;loading=true;try{D=await api('/api/preparation');error='';}catch(e){error=e.message;}finally{loading=false;render();requestAnimationFrame(focusCalendar);}}
 function focusCalendar(){root.ExamCalendar.updateCurrentLine();const box=document.querySelector('.prep-page .exam-grid-scroll');if(!box)return;const day=root.AcademicCalendar.today(),row=[...box.querySelectorAll('[data-exam-week-start]')].find(r=>r.dataset.examWeekStart<=day&&r.dataset.examWeekEnd>=day);if(row)box.scrollTop+=row.getBoundingClientRect().top-box.getBoundingClientRect().top-52;}
 function notes(){const owners=new Map((S.courses||[]).map(c=>[c.id,c]));return (S.resources||[]).filter(r=>r.kind==='notes').map(r=>{const c=owners.get(r.unit_id||r.course_id)||{},tags=r.tags||c.tags;return {...r,code:code(r.tags?.course||c.tags?.course||c.course_label||r.course_title),weeks:[...new Set([...(tags?.weeks||r.weeks||[]),...(r.sessions||c.sessions||[]).map(s=>s.week).filter(Number.isInteger)])]};});}
 function originals(refs){return refs?.length?`<div class="prep-originals">原件：${refs.map(r=>`<a href="/api/academic-references/${E(r.id)}" target="_blank" rel="noopener">${E(r.filename)}</a>`).join('')}</div>`:'';}

 const tabs=[['materials','原始材料'],['exam','考试基本信息'],['mock','模拟题'],['summary','知识点总结']];
 const questionKinds={single:'单选',multiple:'多选',blank:'填空',written:'简答'};
 const currentExam=()=>D?.exams.find(r=>r.id===examId);
 const currentWorkspace=()=>D?.workspaces?.[examId]||{};
 const disabled=()=>saving?'disabled':'';
 const formatOf=filename=>{
  const ext=filename.split('.').pop().toLowerCase();
  return ({docx:'Word',pptx:'PowerPoint',txt:'文字',md:'Markdown'})[ext]||ext.toUpperCase();
 };
 const noteList=exam=>notes().filter(r=>r.code.toLowerCase()===code(exam.course).toLowerCase());
 const markdown=text=>'<div class="markdown">'+md(text)+'</div>';
 const workspaceUpdate=(action,data)=>api('/api/preparation/workspace',{exam_id:examId,etag:D.etag,action,...data});
 async function update(run,done){
  if(saving)return;
  const activeId=examId,activeTab=tab,previousAttempt=viewedAttempt;
  const repaint=keepPosition=>{
   const top=document.querySelector('.prep-workspace')?.scrollTop||0;
   render();
   if(keepPosition)document.querySelector('.prep-workspace')?.scrollTo(0,top);
  };
  saving=true;repaint(true);
  try{D=await run();if(examId===activeId)done?.();}
  catch(e){
   if(e.status===409){try{D=await api('/api/preparation');}catch{}}
   toast(e.message);
  }finally{saving=false;repaint(examId===activeId&&tab===activeTab&&previousAttempt===viewedAttempt);}
 }
 const noteWeeks=note=>note.weeks.length?'第 '+note.weeks.join('、')+' 周':'';
 function materialsPanel(exam,workspace){
  const choices=new Set(workspace.notes||[]),list=noteList(exam).filter(r=>choices.has(r.id)),files=workspace.materials||[];
  return '<section class="prep-section prep-material-section"><header><h2>复习笔记</h2><button class="outline-button" data-prep="choose-notes" aria-haspopup="dialog" '+disabled()+'>'+I('list-checks')+'选择笔记</button></header>'+
   (list.length?'<ul class="prep-files">'+list.map(r=>'<li><div>'+E(r.title)+(r.available===false?'<small>文件已移走</small>':r.weeks.length?'<small>'+E(noteWeeks(r))+'</small>':'')+'</div>'+
    (r.available===false?'':'<button class="text-button" data-prep="note" data-id="'+E(r.id)+'">查看笔记</button>')+'</li>').join('')+'</ul>':'')+
   '</section><section class="prep-section prep-material-section"><header><h2>外部材料</h2><button class="outline-button" data-prep="materials" '+disabled()+'>'+I('plus')+'添加材料</button></header>'+
   (files.length?'<ul class="prep-files">'+files.map(r=>'<li><a href="/api/preparation/files/'+encodeURIComponent(r.id)+'" target="_blank" rel="noopener">'+E(r.filename)+'</a><small>'+E(formatOf(r.filename))+'</small></li>').join('')+'</ul>':'')+'</section>';
 }
 function syncNotePicker(d){
  const picker=document.querySelector('.prep-note-picker');
  for(const checkbox of picker.querySelectorAll('[data-prep-note]'))checkbox.checked=d.chosen.has(checkbox.dataset.prepNote);
  for(const checkbox of picker.querySelectorAll('[data-prep-week]')){
   const rows=d.notes.filter(note=>note.weeks.includes(Number(checkbox.dataset.prepWeek)));
   const count=rows.filter(note=>d.chosen.has(note.id)).length;
   checkbox.checked=count===rows.length;
   checkbox.indeterminate=count>0&&count<rows.length;
  }
  const counter=picker.querySelector('[data-prep-picked]');
  if(counter)counter.textContent='已选 '+d.chosen.size+' 篇';
 }
 function drawNotePicker(d){
  if(!d.notes.length){
   modalContent('选择笔记','<p class="muted prep-picker-empty">暂无可选笔记</p>');
   return;
  }
  const weeks=[...new Set(d.notes.flatMap(r=>r.weeks))].sort((a,b)=>a-b);
  const blocked=d.busy?'disabled':'';
  modalContent('选择笔记','<div class="prep-dialog prep-note-picker">'+
   (weeks.length?'<div class="prep-weeks" aria-label="按周选择">'+weeks.map(week=>'<label><input type="checkbox" data-prep-week="'+week+'" '+blocked+'>第 '+week+' 周</label>').join('')+'</div>':'')+
   '<div class="prep-notes">'+d.notes.map(r=>'<div class="prep-note"><label><input type="checkbox" data-prep-note="'+E(r.id)+'" '+blocked+'><span>'+E(r.title)+(r.weeks.length?'<small>'+E(noteWeeks(r))+'</small>':'')+'</span></label></div>').join('')+'</div>'+
   (d.error?'<p role="alert" class="error-message">'+E(d.error)+'</p>':'')+
   '<footer class="prep-picker-footer"><span class="muted" data-prep-picked aria-live="polite"></span><button class="outline-button" data-prep="cancel" '+blocked+'>取消</button><button class="primary" data-prep="save-notes" '+blocked+'>'+(d.busy?'正在保存…':'完成')+'</button></footer></div>');
  syncNotePicker(d);
 }
 function scoreRows(rows){
  return rows.length?'<ul class="prep-scores">'+rows.map(row=>'<li><div><strong>'+E(row.title)+'</strong><span>'+E(row.points||'分值未注明')+'</span></div>'+
   (row.evidence?'<small>'+E(row.evidence)+'</small>':'')+scoreRows(row.children||[])+'</li>').join('')+'</ul>':'';
 }
 function generateButton(mode,label,available){
  return '<button class="outline-button" data-prep="generate" data-mode="'+mode+'" '+(saving||!available?'disabled':'')+'>'+I('sparkles')+(saving?'正在整理…':label)+'</button>';
 }
 function examPanel(exam,workspace){
  const a=workspace.analysis||{},extracted=Object.keys(a).length>0,fromCalendar=(value)=>value?value+'（日历）':'未提供';
  const time=when(exam)+(exam.date&&exam.start&&exam.end&&!exam.date_end?'–'+exam.end:'');
  const fields=[
   ['时间',a.time||fromCalendar(time)],['地点',a.location||fromCalendar(exam.location)],
   ['时长',a.duration||fromCalendar(exam.duration)],
   ['要求与提醒',a.requirements||(exam.requirements?fromCalendar(exam.requirements):extracted?'无（外部材料未注明）':'未提供')],
  ];
  return '<section class="prep-section"><header><h2>基本信息</h2>'+generateButton('exam',extracted?'重新提取':'从外部材料提取',workspace.materials?.length)+'</header>'+
   (!workspace.materials?.length?'<p class="muted">添加外部材料后即可提取考试信息。</p>':'')+
   '<dl class="prep-basic">'+fields.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+E(value)+'</dd></div>').join('')+'</dl>'+
   (a.evidence?'<details class="prep-evidence"><summary>查看来源依据</summary><p>'+E(a.evidence)+'</p></details>':'')+'</section>'+
   '<section class="prep-section"><header><h2>分值构成</h2></header><dl class="prep-basic"><div><dt>课程占比</dt><dd>'+E(a.weight||fromCalendar(exam.weight))+'</dd></div><div><dt>卷面总分</dt><dd>'+E(a.total||'未提供')+'</dd></div></dl>'+
   (scoreRows(a.scores||[])||'<p class="muted">'+(extracted?'外部材料未注明具体分值。':'提取后在这里查看各题型或各部分的分值。')+'</p>')+'</section>';
 }
 function answerText(question,value){
  return Array.isArray(value)?value.map(index=>question.options[index]).join('、'):value;
 }
 function practiceQuestion(q,index){
  const value=paperSession.answers[q.id];
  const response=q.options.length?q.options.map((option,i)=>'<label class="prep-option"><input type="'+(q.type==='single'?'radio':'checkbox')+'" name="'+q.id+'" data-question="'+q.id+'" value="'+i+'" '+(value?.includes(i)?'checked':'')+'><span>'+String.fromCharCode(65+i)+'.</span>'+markdown(option)+'</label>').join(''):
   q.type==='blank'?'<input type="text" class="prep-answer" data-question="'+q.id+'" aria-label="第 '+(index+1)+' 题答案" value="'+E(value||'')+'" maxlength="12000">':
   '<textarea class="prep-answer" rows="4" data-question="'+q.id+'" aria-label="第 '+(index+1)+' 题答案" maxlength="12000">'+E(value||'')+'</textarea>';
  return '<fieldset class="prep-question"><legend>第 '+(index+1)+' 题 · '+questionKinds[q.type]+'</legend>'+markdown(q.prompt)+response+'</fieldset>';
 }
 function resultPanel(attempt,workspace){
  const paper=workspace.mock_papers?.find(p=>p.id===attempt.paper_id);
  const label=attempt.graded?'答对 '+attempt.correct+' / '+attempt.graded+' 道可自动判分题':'本次作答暂无可自动判分题';
  return '<section class="prep-section"><header><h2>'+E(attempt.paper_title)+'</h2><button class="text-button" data-prep="paper-list">返回试卷与记录</button></header>'+
   '<p>'+E(label)+' · 已答 '+attempt.answered+' / '+attempt.questions.length+' 题</p>'+attempt.questions.map((q,i)=>{
    const status=!q.response?.length?'未作答':q.correct===true?'正确':q.correct===false?'错误':'未自动判分';
    return '<article class="prep-result"><h3>第 '+(i+1)+' 题 · '+status+'</h3>'+markdown(q.prompt)+
     '<div class="prep-result-line"><span>我的答案</span>'+markdown(answerText(q,q.response)||'未作答')+'</div>'+
     (q.answer?.length?'<div class="prep-result-line"><span>参考答案</span>'+markdown(answerText(q,q.options.length?q.answer:q.answer.join('、')))+'</div>':'')+
     (q.explanation?markdown(q.explanation):'')+'</article>';
   }).join('')+(paper?'<button class="outline-button" data-prep="start-paper" data-id="'+E(paper.id)+'">重新作答</button>':'')+'</section>';
 }
 function mockPanel(workspace){
  const papers=workspace.mock_papers||[],attempts=workspace.attempts||[],paper=papers.find(p=>p.id===paperSession?.paperId);
  const attempt=attempts.find(a=>a.id===viewedAttempt);
  if(attempt)return resultPanel(attempt,workspace);
  if(paper&&paper.version===paperSession.version){
   return '<section class="prep-section"><header><h2>'+E(paper.title)+'</h2><button class="text-button" data-prep="paper-list">返回试卷与记录</button></header>'+
    '<form id="prep-quiz">'+paper.questions.map(practiceQuestion).join('')+'<button class="primary" type="submit" '+disabled()+'>'+(saving?'正在提交…':'提交作答')+'</button></form></section>';
  }
  return '<section class="prep-section"><header><h2>试卷</h2>'+generateButton('mock',workspace.mock_scan?'重新识别模拟题':'识别模拟题',workspace.materials?.length)+'</header>'+
   (!workspace.materials?.length?'<p class="muted">先在原始材料中添加模拟题或样题文件。</p>':workspace.mock_scan?.found===0?'<p class="muted">本次识别未发现可作答的模拟题。</p>':!papers.length?'<p class="muted">从外部材料识别原题后，可以在这里选择试卷。</p>':'')+
   '<ul class="prep-files">'+papers.map(p=>'<li><div><strong>'+E(p.title)+'</strong><small>'+E(p.source)+' · '+p.questions.length+' 题</small></div><button class="outline-button" data-prep="start-paper" data-id="'+E(p.id)+'">开始作答</button></li>').join('')+'</ul></section>'+
   '<section class="prep-section"><header><h2>作答记录</h2></header>'+
   (attempts.length?'<ul class="prep-files">'+attempts.slice().reverse().map(a=>'<li><div><strong>'+E(a.paper_title)+'</strong><small>'+E(a.submitted_at?.replace('T',' ').slice(0,16)||'')+' · '+(a.graded?'答对 '+a.correct+' / '+a.graded+' 道':'未自动判分')+'</small></div><button class="text-button" data-prep="result" data-id="'+E(a.id)+'">查看结果</button></li>').join('')+'</ul>':'<p class="muted">提交试卷后在这里查看记录。</p>')+
   (workspace.practice||[]).map(r=>'<details class="prep-result"><summary>'+E(r.question)+'</summary>'+markdown(r.answer||'')+(r.feedback?markdown(r.feedback):'')+(r.next?markdown(r.next):'')+'</details>').join('')+'</section>';
 }
 function summaryPanel(workspace){
  const summary=workspace.summary?.markdown,available=workspace.notes?.length||workspace.materials?.length;
  return '<section class="prep-section"><header><h2>复习笔记</h2><div class="prep-actions">'+
   (summary?'<button class="outline-button" data-prep="download-summary">下载笔记</button>':'')+
   generateButton('summary',summary?'重新生成笔记':'生成复习笔记',available)+'</div></header>'+
   (summary?markdown(summary):'<p class="muted">'+(available?'根据已选复习笔记和外部材料整理课程知识点。':'先选择本课程的复习笔记或添加外部材料。')+'</p>')+'</section>';
 }
 function markup(){
  if(!D&&!loading&&!error)queueMicrotask(load);
  if(!D)return '<section class="prep-page"><p>'+E(error||'正在读取…')+'</p>'+(error?'<button data-prep="reload">重试</button>':'')+'</section>';
  const periods=D.semesters||[];
  if(!periods.some(p=>p.key===semester)){
   const today=root.AcademicCalendar.today();
   semester=periods.find(p=>p.start<=today&&p.end>=today)?.key||D.exams.find(r=>periods.some(p=>p.key===r.semester))?.semester||periods[0]?.key||'';
  }
  const exam=currentExam(),workspace=currentWorkspace();
  if(!exam){
   requestAnimationFrame(()=>root.ExamCalendar.updateCurrentLine());
   const hasExams=D.exams.some(r=>!semester||r.semester===semester);
   return '<section class="prep-page prep-overview">'+root.ExamCalendar.grid(D.calendar,semester,{preparation:true})+
    (hasExams?'':'<p class="prep-empty">请先在学习设置中添加考试信息。</p>')+'</section>';
  }
  const panel={materials:()=>materialsPanel(exam,workspace),exam:()=>examPanel(exam,workspace),mock:()=>mockPanel(workspace),summary:()=>summaryPanel(workspace)}[tab]();
  return '<section class="prep-page prep-workspace"><header class="prep-header"><div><button class="text-button" data-prep="back">← 考试日历</button><h1>'+E(code(exam.course)+' · '+exam.title)+'</h1></div></header>'+
   '<nav class="prep-tabs" aria-label="备考内容">'+tabs.map(([key,label])=>'<button type="button" data-prep="tab" data-tab="'+key+'" '+(tab===key?'aria-current="page"':'')+'>'+label+'</button>').join('')+
   '</nav><div class="prep-content">'+panel+'</div></section>';
 }
 function openExam(id){
  examId=id;tab='materials';paperSession=null;viewedAttempt='';render();
  if(id)document.querySelector('.prep-page')?.scrollTo(0,0);
  else requestAnimationFrame(focusCalendar);
 }
 async function workspaceAction(action,button){
  if(action==='open-exam'){if(D?.exams.some(r=>r.id===button.dataset.examId))openExam(button.dataset.examId);return true;}
  if(action==='back'){openExam('');return true;}
  const exam=currentExam(),workspace=currentWorkspace();
  if(!exam)return false;
  const id=button.dataset.id;
  if(action==='tab'){tab=button.dataset.tab;render();return true;}
  if(action==='choose-notes'){
   const notes=noteList(exam).filter(r=>r.available!==false);
   const chosen=new Set(notes.filter(r=>workspace.notes?.includes(r.id)).map(r=>r.id));
   dialog={mode:'notes',notes,chosen,examId,etag:D.etag};
   drawDialog();
   return true;
  }
  if(action==='note'){
   const note=noteList(exam).find(r=>r.id===id);
   if(note){const result=await api('/api/library/'+encodeURIComponent(id));if(currentExam()?.id===exam.id)modalContent(E(note.title),'<div class="markdown">'+(result.text===null?'<a href="/api/library/'+encodeURIComponent(id)+'/file" target="_blank" rel="noopener">打开笔记</a>':md(result.text,result.relative_path))+'</div>');}
   return true;
  }
  if(action==='materials'){dialog={mode:'materials',files:[],etag:D.etag,examId};drawDialog();return true;}
  if(action==='generate'){
   const mode=button.dataset.mode;
   await update(()=>api('/api/preparation/generate',{exam_id:exam.id,etag:D.etag,mode}),()=>toast('已保存整理结果'));
   return true;
  }
  if(action==='start-paper'){
   const paper=workspace.mock_papers?.find(p=>p.id===id);
   if(paper){paperSession={paperId:id,version:paper.version,attemptId:crypto.randomUUID(),answers:{}};viewedAttempt='';render();}
   return true;
  }
  if(action==='paper-list'||action==='result'){paperSession=null;viewedAttempt=id||'';render();return true;}
  if(action==='download-summary'){
   const text=workspace.summary?.markdown;
   if(text)downloadNote(new Blob([text],{type:'text/markdown;charset=utf-8'}),code(exam.course)+' '+exam.title+' 知识点总结','md');
   return true;
  }
  return false;
 }
 function input(key,label,value,type='text'){return `<label><span>${label}</span><input data-exam-field="${key}" type="${type}" value="${E(value||'')}"></label>`;}
 function drawDialog(){const d=dialog;if(!d)return;
 if(d.mode==='notes'){drawNotePicker(d);return;}
 const files=`<label class="prep-upload">${I('upload')}选择多个文件<input type="file" data-prep-files multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.pptx,.md,.txt" ${d.busy?'disabled':''}></label><ul class="reference-file-list">${d.files.map((f,i)=>`<li><span>${i+1}. ${E(f.filename)}</span><button type="button" data-prep="remove-file" data-index="${i}" ${d.busy?'disabled':''}>移除</button></li>`).join('')}</ul>`;
 let body='';
 if(d.mode==='materials')body=`${files}<label class="prep-paste">粘贴文字<textarea id="prep-material-text" rows="4" placeholder="老师通知、邮件或例题正文" ${d.busy?'disabled':''}>${E(d.text||'')}</textarea></label><label class="prep-paste">文字材料名称<input id="prep-material-name" value="${E(d.textName||'')}" placeholder="选填" maxlength="120" ${d.busy?'disabled':''}></label>`;
 else if(!d.rows)body=`<p class="muted">考试安排、老师通知、Module Handbook 可一起上传；连续截图按选择顺序读取。</p>${files}<textarea id="prep-instructions" rows="3" placeholder="补充说明或更正，例如 ISA104 改为第 10 周周二">${E(d.text)}</textarea>`;
 else body=`${!d.manager&&!d.source_id?`<label class="field">所属学期<select id="prep-import-semester">${(D.semesters||[]).map(p=>`<option value="${p.key}" ${p.key===(d.semester||semester)?'selected':''}>${E(root.ExamCalendar.label(p.key))}</option>`).join('')}</select></label>`:''}${d.rows.length===1?originals(d.rows[0].originals):''}<p class="muted">核对后保存。资料未提供的信息可留空。</p><div class="prep-draft">${d.rows.map((r,i)=>`<details class="prep-draft-item" ${i===0?'open':''}><summary>${E(r.course||'新考核')} · ${E(r.title||'考试信息')}<small>${E(when(r))}</small></summary><fieldset data-exam-index="${i}"><div class="prep-fields">${input('course','课程代码',r.course)}${input('title','考试／考核名称',r.title)}${input('date','具体日期／范围开始',r.date,'date')}${input('date_end','范围结束（非范围留空）',r.date_end,'date')}${input('start','开始时间',r.start,'time')}${input('end','结束时间',r.end,'time')}${input('timing','教学周／日期说明',r.timing)}${input('location','地点',r.location)}${input('duration','时长',r.duration)}${input('question_types','题型',r.question_types)}${input('scope','考试范围',r.scope)}${input('requirements','要求与提醒',r.requirements)}${input('weight','占比',r.weight)}</div>${r.evidence?`<details><summary>原文依据</summary><p>${E(r.evidence)}</p></details>`:''}<button type="button" class="text-button" data-prep="remove-exam" data-index="${i}">移除此项</button></fieldset></details>`).join('')}</div>`;
 modalContent(d.mode==='materials'?'添加备考材料':d.rows?'核对考试信息':'AI 导入',`<div class="prep-dialog">${body}<p id="prep-error" role="alert" class="error-message">${E(d.error||'')}</p><footer><button class="outline-button" data-prep="cancel" ${d.busy?'disabled':''}>取消</button><button class="primary" data-prep="${d.mode==='materials'?'save-materials':d.rows?'save-exams':'recognize'}" ${d.busy?'disabled':''}>${d.busy?'正在处理…':d.mode==='materials'||d.rows?'保存':'识别'}</button></footer></div>`);icons();
 }
 async function choose(files){const d=dialog;if(!d||d.busy)return;try{if(files.length+d.files.length>10)throw Error('每次最多 10 份文件。');const additions=await Promise.all(files.map(f=>root.AcademicReferences.attachment(f)));if([...d.files,...additions].reduce((n,f)=>n+f.file.length,0)>18*1024*1024)throw Error('文件总量过大，请分批导入。');if(dialog!==d)return;d.files.push(...additions);d.error='';}catch(e){d.error=e.message;}drawDialog();}
 async function act(action,button){
 if(action==='reload')return load();
 if(await workspaceAction(action,button))return;
 if(action==='edit'){const r=D?.exams.find(r=>r.id===button.dataset.id);if(!r)return;dialog={mode:'manual',files:[],rows:[{...r}],source_id:r.source_id,etag:D.calendar_etag};drawDialog();return;}
 const d=dialog;if(!d||d.busy)return;
 if(action==='cancel'){document.querySelector('#modal').close();dialog=null;return;}
 if(action==='remove-file'){d.files.splice(Number(button.dataset.index),1);drawDialog();return;}
 if(action==='remove-exam'){d.rows.splice(Number(button.dataset.index),1);drawDialog();return;}
 d.busy=true;d.error='';drawDialog();
 try{
 if(action==='recognize'){
  if(!d.files.length&&!d.text?.trim())throw Error('请选择文件或填写考试信息。');
  const r=await api('/api/calendar/import',{kind:'exam',attachments:d.files,text:d.text||''});
  if(!r.assessments?.length)throw Error(r.reply||'未读到课程和考试信息，请补充说明。');
  d.rows=r.assessments;d.semester=r.semester||semester;d.error=r.incomplete?r.reply:'';
 }else if(action==='save-exams'){
  if(!d.rows?.length)throw Error('请至少保留一项考试或考核。');
  if(d.manager){
   const doc=JSON.parse(JSON.stringify(root.StudySchedule.document())),id=crypto.randomUUID(),rows=d.rows.map(r=>({...r,id:r.id||crypto.randomUUID()}));
   const period=root.ExamCalendar.periods(doc).find(p=>p.key===d.manager.calendarView?.semester);doc.sources.push({id,name:'考试信息',kind:'exam',type:'import',assessments:rows,...(period?{semester:period.key,calendar_source_id:period.calendar_source_id}:{})});
   for(const r of rows)if(r.date&&!r.date_end)doc.events.push({id:r.id,title:r.course+' · '+r.title,kind:'exam',date:r.date,start:r.start&&r.end?r.start:'',end:r.start&&r.end?r.end:'',location:r.location||'',source_id:id});
   await api('/api/calendar',doc);await root.StudySchedule.prepare({keepView:true});
  }else D=await api('/api/preparation/exams',{etag:d.etag,assessments:d.rows,source_id:d.source_id,semester:d.rows?.[0]?.semester||d.semester||semester,attachments:d.files});
 }else if(action==='save-notes'){
  D=await api('/api/preparation/workspace',{exam_id:d.examId,etag:d.etag,action:'notes',notes:[...d.chosen]});
 }else if(action==='save-materials'){
  const attachments=[...d.files],text=d.text?.trim();
  if(text){
   const name=(d.textName?.trim()||'文字材料').replace(/[\\/:*?"<>|]/g,'-').replace(/\.txt$/i,'');
   attachments.push(await root.AcademicReferences.attachment(new File([text],(name||'文字材料')+'.txt',{type:'text/plain'})));
  }
  if(!attachments.length)throw Error('请选择文件或粘贴文字。');
  if(attachments.length>10||attachments.reduce((total,file)=>total+file.file.length,0)>18*1024*1024)throw Error('文件总量过大，请分批导入。');
  D=await api('/api/preparation/workspace',{exam_id:d.examId,etag:d.etag,action:'materials',kind:'other',attachments});
 }
 if(action.startsWith('save-')){document.querySelector('#modal').close();dialog=null;render();toast('已保存');return;}
 }catch(e){d.error=e.message;}finally{d.busy=false;if(dialog===d)drawDialog();}
 }
 document.addEventListener('click',event=>{const button=event.target.closest('[data-prep]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();act(button.dataset.prep,button).catch(e=>toast(e.message));},true);
 document.addEventListener('input',event=>{
  const el=event.target,question=el.dataset.question;
  if(question&&paperSession){
   const answers=paperSession.answers;
   if(el.type==='radio')answers[question]=[Number(el.value)];
   else if(el.type==='checkbox'){
    const choices=new Set(answers[question]||[]),value=Number(el.value);
    if(el.checked)choices.add(value);else choices.delete(value);
    answers[question]=[...choices];
   }else answers[question]=el.value;
  }
  if(!dialog||dialog.busy)return;
  if(el.id==='prep-instructions'||el.id==='prep-material-text')dialog.text=el.value;
  if(el.id==='prep-material-name')dialog.textName=el.value;
  if(el.id==='prep-import-semester')dialog.semester=el.value;
  const field=el.dataset.examField;
  if(field)dialog.rows[Number(el.closest('[data-exam-index]').dataset.examIndex)][field]=el.value;
 });
 document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.hasAttribute('data-prep-files')){await choose([...el.files]);return;}
  const d=dialog;
  if(d?.mode!=='notes'||d.busy||!el.matches('[data-prep-week],[data-prep-note]'))return;
  const ids=el.dataset.prepNote?[el.dataset.prepNote]:d.notes.filter(r=>r.weeks.includes(Number(el.dataset.prepWeek))).map(r=>r.id);
  for(const id of ids){if(el.checked)d.chosen.add(id);else d.chosen.delete(id);}
  syncNotePicker(d);
 });
 document.addEventListener('paste',event=>{
  if(!dialog||!['materials','ai'].includes(dialog.mode)||dialog.rows||dialog.busy||!event.target.closest('#modal'))return;
  const files=[...(event.clipboardData?.files||[])];
  if(files.length){event.preventDefault();choose(files);}
 });
 document.querySelector('#modal').addEventListener('close',()=>{dialog=null;});
 document.addEventListener('click',async event=>{const button=event.target.closest('[data-exam-detail]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();await load();await act('edit',{dataset:{id:button.dataset.examDetail}});},true);
 document.addEventListener('submit',async event=>{
  if(event.target.id!=='prep-quiz')return;
  event.preventDefault();
  if(!paperSession)return;
  const session=paperSession;
  await update(()=>workspaceUpdate('attempt',{paper_id:session.paperId,paper_version:session.version,attempt_id:session.attemptId,answers:session.answers}),()=>{
   if(paperSession===session){paperSession=null;viewedAttempt=session.attemptId;}
  });
 });
 root.addEventListener('resize',()=>root.ExamCalendar.updateCurrentLine());
 setInterval(()=>root.ExamCalendar.updateCurrentLine(),60000);
 root.ExamPreparation={markup,enter(){semester=root.StudySchedule.manager()?.calendarView?.semester||'';openExam('');return load();},manualInCalendar(manager){dialog={mode:'manual',rows:[{course:'',title:''}],files:[],manager};drawDialog();}};
})(typeof window==='undefined'?{}:window);
