const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {draftOf,changed,promptMarkup,choicesMarkup,historyFor,navigationMarkup,timetableNavigation,actionMenuMarkup,defaultTypeFor,suggestDefault}=require('../web/learning-templates.js');
const sample={id:'concepts',name:'知识点总结',prompt:'自由写下我的要求\n不要分字段。'};
test('old prompts open in two independent drafts and only the active prompt is shown',()=>{
 const draft=draftOf(sample);
 assert.deepEqual(draft,{name:sample.name,learning_prompt:sample.prompt,notes_prompt:sample.prompt});
 assert.equal(changed(sample,draft),false);
 draft.notes_prompt='使用表格整理';
 assert.equal(changed(sample,draft),true);
 assert.doesNotMatch(promptMarkup(draft),/使用表格整理/);
 assert.match(promptMarkup(draft,false,'notes_prompt'),/使用表格整理/);
});
test('new types accept a name without duplicating saved template labels',()=>{assert.match(promptMarkup({name:'错题复盘',prompt:'反例'},true),/aria-label="模板名称"/);assert.doesNotMatch(promptMarkup(sample,false),/template-name/);assert.match(choicesMarkup([{id:'tpl_example',name:'错题复盘'}],'tpl_example'),/value="tpl_example" selected/);});
test('free text and imported proposal names remain inert',()=>{const html=promptMarkup({name:'<img src=x>',prompt:'</textarea><script>bad</script>'},true);assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(choicesMarkup([{id:'tpl_a',name:'<img src=x>'}]),/<img/);});
test('one assistant carries recent conversation without mutating it',()=>{const messages=Array.from({length:15},(_,i)=>({role:i%2?'assistant':'user',content:String(i)}));assert.equal(historyFor(messages).length,10);assert.equal(messages.length,15);assert.equal(historyFor(messages)[0].content,'5');});
test('imports speech and prompt revisions share one assistant endpoint and require explicit apply',()=>{const source=fs.readFileSync(path.join(__dirname,'../web/learning-templates.js'),'utf8');assert.match(source,/\/api\/templates\/assist/);assert.match(source,/data-template-action="apply"/);assert.match(source,/data-template-action="voice"/);assert.match(source,/data-template-action="attach"/);assert.match(source,/webkitSpeechRecognition/);assert.match(source,/V\.undo=draftOf\(V\.draft\)/);assert.doesNotMatch(source,/outlineMarkup|editorMarkup|逐块讲解<\/h/);});
test('third sidebar destination and runtime styles remain wired',()=>{const root=path.resolve(__dirname,'..');assert.match(fs.readFileSync(path.join(root,'web/classified-navigation.js'),'utf8'),/aria-label="学习设置"/);assert.match(fs.readFileSync(path.join(root,'web/index.html'),'utf8'),/learning-templates\.js/);});

test('addition method menus name the target and separate manual entry from AI recognition',()=>{const html=actionMenuMarkup('添加',{label:'手动添加',icon:'plus',attributes:'data-settings-action="add"'},{label:'用 AI 识别',icon:'sparkles',attributes:'data-settings-action="add-ai"'},{ariaLabel:'添加课程类型'});assert.match(html,/aria-label="添加课程类型"/);assert.match(html,/<summary/);assert.match(html,/手动添加/);assert.match(html,/用 AI 识别/);assert.equal((html.match(/<button/g)||[]).length,2);});
test('import selects the configured template and preserves an explicit manual choice',()=>{const form={elements:{class_type:{value:' Tutorial '},learning_kind:{value:'',dataset:{}}}};suggestDefault(form,{Tutorial:'solutions',Studio:'tpl_custom'});assert.equal(form.elements.learning_kind.value,'solutions');form.elements.class_type.value='Studio';suggestDefault(form,{Studio:'tpl_custom'});assert.equal(form.elements.learning_kind.value,'tpl_custom');form.elements.learning_kind.value='concepts';form.elements.learning_kind.dataset.userEdited='true';suggestDefault(form,{Studio:'tpl_custom'});assert.equal(form.elements.learning_kind.value,'concepts');});

test('calendar and timetable settings are the two secondary destinations',()=>{
 const calendar=navigationMarkup('calendar',()=>'', '<div>日历来源</div>',true,'<button>加号</button>');
 assert.equal((calendar.match(/data-settings-action="mode"/g)||[]).length,2);
 assert.match(calendar,/data-mode="calendar" class="settings-section selected"/);
 assert.match(calendar,/日历来源/);
 assert.doesNotMatch(calendar,/课堂分类|讲解与笔记|三级导航/);
 assert.match(navigationMarkup('prompts'),/data-mode="courses" class="settings-section selected"/);
});
test('course settings and template contents use the tertiary sidebar',()=>{
 const rows=[{id:'a',name:'知识点总结'},{id:'b',name:'题目讲解'}];
 const expanded=timetableNavigation('prompts',rows,'a');
 assert.match(expanded,/aria-label="课表设置三级导航"/);
 assert.equal((expanded.match(/data-settings-action="mode"/g)||[]).length,3);
 assert.ok(expanded.indexOf('data-mode="rules"')<expanded.indexOf('aria-label="讲解与笔记方案"'));
 assert.match(expanded,/data-template-action="select" data-id="b"/);
 assert.match(expanded,/settings-branch-add"><button[^>]+aria-label="新建模板"/);
 const collapsed=timetableNavigation('prompts',rows,'a','',()=>'',false);
 assert.doesNotMatch(collapsed,/aria-label="讲解与笔记方案"/);
 assert.match(collapsed,/aria-expanded="false"/);
 assert.doesNotMatch(timetableNavigation('courses',rows,'a'),/aria-label="讲解与笔记方案"/);
});
