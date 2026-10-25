import {EditorState,StateField,Compartment,EditorSelection,Facet} from '@codemirror/state';
import {EditorView,Decoration,WidgetType,keymap,drawSelection,highlightSpecialChars} from '@codemirror/view';
import {defaultKeymap,history,historyKeymap} from '@codemirror/commands';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxTree,bracketMatching} from '@codemirror/language';
import {searchKeymap,highlightSelectionMatches} from '@codemirror/search';
const liveMode=new Compartment();
const previewEnabled=Facet.define({combine:values=>values.some(Boolean)});
class PreviewWidget extends WidgetType {
 constructor(raw,from,render,block=false){super();this.raw=raw;this.from=from;this.render=render;this.block=block;}
 eq(other){return this.raw===other.raw&&this.from===other.from;}
 toDOM(view){const el=document.createElement(this.block?'div':'span');el.className=this.block?'cm-rendered-block':'cm-rendered-inline';el.innerHTML=this.render(this.raw).trim();el.addEventListener('mousedown',e=>{e.preventDefault();view.dispatch({selection:{anchor:this.from+1},scrollIntoView:true});view.focus();});return el;}
 ignoreEvent(){return false;}
}
function decorations(state,render){
 const ranges=[],hidden=[],atomic=[];const doc=state.doc;const selection=state.selection.ranges;
 const active=(from,to)=>selection.some(r=>{const a=doc.lineAt(r.from).from,b=doc.lineAt(r.to).to;return from<=b&&to>=a;});
 const hide=(from,to,widget,block=false)=>{if(to>from){const r=Decoration.replace({widget,block}).range(from,to);ranges.push(r);atomic.push(r);hidden.push([from,to]);}};
 const prefix=doc.toString().match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0];if(prefix)hide(0,prefix.length,undefined,true);
 for(const m of doc.toString().matchAll(/^<!-- block:[\w-]+ -->\n?/gm))hide(m.index,m.index+m[0].trimEnd().length,undefined,true);
 const isHidden=(from,to)=>hidden.some(([a,b])=>from>=a&&to<=b);
 syntaxTree(state).iterate({enter(n){
  const {name,from,to}=n;if(isHidden(from,to))return false;
  if(/^ATXHeading[1-6]$/.test(name)){ranges.push(Decoration.line({class:'cm-heading cm-h'+name.slice(-1)}).range(doc.lineAt(from).from));}
  if(name==='StrongEmphasis'||name==='Emphasis'||name==='Strikethrough'||name==='InlineCode')ranges.push(Decoration.mark({class:{StrongEmphasis:'cm-strong',Emphasis:'cm-em',Strikethrough:'cm-strike',InlineCode:'cm-inline-code'}[name]}).range(from,to));
  if(name==='Blockquote'){for(let i=doc.lineAt(from).number;i<=doc.lineAt(to).number;i++)ranges.push(Decoration.line({class:'cm-quote'}).range(doc.line(i).from));}
  if(name==='FencedCode'){for(let i=doc.lineAt(from).number;i<=doc.lineAt(to).number;i++)ranges.push(Decoration.line({class:'cm-code-line'}).range(doc.line(i).from));}
  if(name==='Link')ranges.push(Decoration.mark({class:'cm-link'}).range(from,to));
  if(name==='Table'&&!active(from,to)){hide(from,to,new PreviewWidget(doc.sliceString(from,to),from,render,true),true);return false;}
  if(['HeaderMark','EmphasisMark','StrikethroughMark','CodeMark','QuoteMark'].includes(name)&&!active(from,to)){const space=['HeaderMark','QuoteMark'].includes(name)?doc.sliceString(to,doc.lineAt(to).to).match(/^[ \t]+/)?.[0].length||0:0;hide(from,to+space);}
 }});
 // Math stays an editable part of the same Markdown document; only inactive math is rendered.
 const text=doc.toString();for(const m of text.matchAll(/\$\$[\s\S]+?\$\$|(?<!\\)\$[^$\n]+?\$/g)){
  const from=m.index,to=from+m[0].length;if(isHidden(from,to)||active(from,to))continue;
  let syntax=syntaxTree(state).resolveInner(from,1),inCode=false;while(syntax){if(['FencedCode','CodeBlock','InlineCode'].includes(syntax.name))inCode=true;syntax=syntax.parent;}if(inCode)continue;
  hide(from,to,new PreviewWidget(m[0],from,render,m[0].includes('\n')),m[0].includes('\n'));
 }
 return {visual:Decoration.set(ranges,true),atomic:Decoration.set(atomic,true)};
}
function liveExtension(render){const field=StateField.define({create:state=>decorations(state,render),update:(value,tr)=>tr.docChanged||tr.selection?decorations(tr.state,render):value,provide:f=>EditorView.decorations.from(f,v=>v.visual)});return [previewEnabled.of(true),field,EditorView.atomicRanges.of(view=>view.state.field(field).atomic)];}
function wrap(mark){return view=>{const {from,to}=view.state.selection.main;view.dispatch({changes:{from,to,insert:mark+view.state.sliceDoc(from,to)+mark},selection:{anchor:from+mark.length,head:to+mark.length},userEvent:'input'});return true;};}
export function create({parent,content,onChange,render,source=false,state:previous}){
 const initial=content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0].length||0;
 const extensions=[history(),drawSelection(),highlightSpecialChars(),markdown({base:markdownLanguage}),bracketMatching(),highlightSelectionMatches(),EditorView.lineWrapping,
  keymap.of([{key:'Mod-a',run:view=>{const prefix=view.state.facet(previewEnabled)?view.state.doc.toString().match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0].length||0:0;view.dispatch({selection:{anchor:prefix,head:view.state.doc.length}});return true;}},{key:'Mod-b',run:wrap('**')},{key:'Mod-i',run:wrap('*')},...defaultKeymap,...historyKeymap,...searchKeymap]),
  EditorView.contentAttributes.of({'aria-label':'连续编辑笔记',spellcheck:'true'}),
  EditorView.updateListener.of(update=>{if(update.docChanged)onChange(update.state.doc.toString());}),
  liveMode.of(source?[]:liveExtension(render)),
  EditorState.transactionFilter.of(tr=>{if(!tr.docChanged||!tr.startState.facet(previewEnabled))return tr;const prefix=tr.startState.doc.toString().match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0].length||0;let touches=false;tr.changes.iterChangedRanges((from,to)=>{if(from<prefix)touches=true;});return touches?[]:tr;}),
  EditorView.theme({'&':{fontSize:'16px',color:'#333'},'.cm-content':{fontFamily:'inherit',lineHeight:'1.95',padding:'0 0 160px'},'.cm-scroller':{fontFamily:'inherit',overflow:'visible'},'.cm-line':{padding:'0 2px'},'&.cm-focused':{outline:'none'},'.cm-cursor':{borderLeftColor:'#222'},'.cm-selectionBackground, &.cm-focused .cm-selectionBackground':{backgroundColor:'#dce6ef'},'.cm-panels':{background:'#fafafa',color:'#444'},'.cm-heading':{fontWeight:'600',lineHeight:'1.6'},'.cm-h1':{fontSize:'30px'},'.cm-h2':{fontSize:'23px'},'.cm-h3':{fontSize:'19px'},'.cm-strong':{fontWeight:'650'},'.cm-em':{fontStyle:'italic'},'.cm-strike':{textDecoration:'line-through'},'.cm-inline-code':{fontFamily:'monospace',background:'#f3f3f3'},'.cm-quote':{borderLeft:'2px solid #ccc',paddingLeft:'16px',color:'#777',background:'#fafafa'},'.cm-code-line':{background:'#f7f7f7',fontFamily:'monospace',fontSize:'14px'},'.cm-link':{color:'#555',textDecoration:'underline'},'.cm-rendered-inline p':{display:'inline',margin:'0'},'.cm-rendered-block':{padding:'12px 0'},'.cm-rendered-block table':{borderCollapse:'collapse',width:'100%'},'.cm-rendered-block td,.cm-rendered-block th':{padding:'8px 12px',borderBottom:'1px solid #ddd'}})
 ];
 const view=new EditorView({parent,state:previous&&previous.doc.toString()===content?previous:EditorState.create({doc:content,selection:{anchor:source?0:initial},extensions})});
 view.dispatch({effects:liveMode.reconfigure(source?[]:liveExtension(render))});
 return {view,destroy:()=>view.destroy(),setSource(value){view.dispatch({effects:liveMode.reconfigure(value?[]:liveExtension(render))});view.focus();},focus:()=>view.focus()};
}
