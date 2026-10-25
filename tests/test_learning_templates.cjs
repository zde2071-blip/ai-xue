const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {draftOf,changed,promptMarkup,choicesMarkup,historyFor,addOptions,navigationMarkup,actionMenuMarkup,scopedProposal}=require('../web/learning-templates.js');
const sample={id:'concepts',name:'知识点总结',prompt:'自由写下我的要求\n不要分字段。'};
test('one free prompt replaces all rigid template fields',()=>{const draft=draftOf(sample);assert.deepEqual(draft,{name:sample.name,prompt:sample.prompt});assert.equal(changed(sample,draft),false);draft.prompt+='新要求';assert.equal(changed(sample,draft),true);const html=promptMarkup(draft);assert.equal((html.match(/<textarea/g)||[]).length,1);assert.doesNotMatch(html,/numbering|lesson_sections|note_sections|<h2/);assert.doesNotMatch(html,/知识点总结/);});
test('new types accept a name without duplicating saved template labels',()=>{assert.match(promptMarkup({name:'错题复盘',prompt:'反例'},true),/aria-label="模板名称"/);assert.doesNotMatch(promptMarkup(sample,false),/template-name/);assert.match(choicesMarkup([{id:'tpl_example',name:'错题复盘'}],'tpl_example'),/value="tpl_example" selected/);});
test('free text and imported proposal names remain inert',()=>{const html=promptMarkup({name:'<img src=x>',prompt:'</textarea><script>bad</script>'},true);assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(choicesMarkup([{id:'tpl_a',name:'<img src=x>'}]),/<img/);});
test('one assistant carries recent conversation without mutating it',()=>{const messages=Array.from({length:15},(_,i)=>({role:i%2?'assistant':'user',content:String(i)}));assert.equal(historyFor(messages).length,10);assert.equal(messages.length,15);assert.equal(historyFor(messages)[0].content,'5');});
test('imports speech and prompt revisions share one assistant endpoint and require explicit apply',()=>{const source=fs.readFileSync(path.join(__dirname,'../web/learning-templates.js'),'utf8');assert.match(source,/\/api\/templates\/assist/);assert.match(source,/data-template-action="apply"/);assert.match(source,/data-template-action="voice"/);assert.match(source,/data-template-action="attach"/);assert.match(source,/webkitSpeechRecognition/);assert.match(source,/V\.undo=draftOf\(V\.draft\)/);assert.doesNotMatch(source,/outlineMarkup|editorMarkup|逐块讲解<\/h/);});
test('third sidebar destination and runtime styles remain wired',()=>{const root=path.resolve(__dirname,'..');assert.match(fs.readFileSync(path.join(root,'web/classified-navigation.js'),'utf8'),/aria-label="学习设置"/);assert.match(fs.readFileSync(path.join(root,'web/index.html'),'utf8'),/learning-templates\.js/);});

test('option input supports batch teaching weeks and rejects invalid ranges',()=>{
 assert.deepEqual(addOptions('weeks','2, 3–5，2'),['2','3','4','5']);assert.deepEqual(addOptions('class_type','Studio,实训课'),['Studio','实训课']);assert.throws(()=>addOptions('weeks','0'));assert.throws(()=>addOptions('weeks','5–2'));assert.throws(()=>addOptions('weeks','1–61'));
});

test('secondary navigation contains semester settings and the two existing destinations without nested fields',()=>{
 const templates=[{id:'concepts',name:'知识点总结'},{id:'tpl_custom',name:'自建类型'}];
 for(const mode of ['academic','information','prompts']){
  const html=navigationMarkup(mode,'class_type',templates,'tpl_custom');
  assert.equal((html.match(/<button/g)||[]).length,3);assert.match(html,new RegExp(`data-mode="${mode}" class="settings-section selected"`));
  assert.doesNotMatch(html,/课程名称|课程类型|教学周|自定义标签|知识点总结|自建类型|settings-subitems|data-template-action=/);
 }
});

test('addition method menus name the target and separate manual entry from AI recognition',()=>{const html=actionMenuMarkup('添加',{label:'手动添加',icon:'plus',attributes:'data-settings-action="add"'},{label:'用 AI 识别',icon:'sparkles',attributes:'data-settings-action="add-ai"'},{ariaLabel:'添加课程类型'});assert.match(html,/aria-label="添加课程类型"/);assert.match(html,/<summary/);assert.match(html,/手动添加/);assert.match(html,/用 AI 识别/);assert.equal((html.match(/<button/g)||[]).length,2);});
test('AI additions change only the active information field and preserve the raw proposal',()=>{const p={groups:{course:['ADS102'],class_type:['Studio'],weeks:['2']},note_types:['错题复盘'],evidence:{},reply:'识别结果'};const before=JSON.stringify(p);assert.deepEqual(scopedProposal(p,'class_type').groups,{course:[],class_type:['Studio'],weeks:[]});assert.deepEqual(scopedProposal(p,'class_type').note_types,[]);assert.deepEqual(scopedProposal(p,'note_kind').note_types,['错题复盘']);assert.deepEqual(scopedProposal(p,'note_kind').groups,{course:[],class_type:[],weeks:[]});assert.equal(JSON.stringify(p),before);});
