"""Evidence-based document classification. No dates are converted to teaching weeks."""
import re
from pathlib import Path

KINDS={'originals','notes','exercises'}
ROLES={'material','timetable','syllabus'}

def normalize_fields(data, *, partial=False):
    result={}
    if not partial or 'week' in data or 'weeks' in data:
        raw=data.get('weeks',data.get('week'))
        if raw in (None,''): values=[]
        elif isinstance(raw,list):values=raw
        elif isinstance(raw,str):
            values=[]
            for chunk in re.split(r'[,，、\s]+',raw.strip()):
                if not chunk:continue
                m=re.fullmatch(r'(\d{1,2})\s*[-–至]\s*(\d{1,2})',chunk)
                if m:
                    a,b=map(int,m.groups())
                    if a>b or b-a>59:raise ValueError('周次范围无效。')
                    values.extend(range(a,b+1))
                else:values.append(chunk)
        else:values=[raw]
        weeks=[]
        for value in values:
            if isinstance(value,bool) or not re.fullmatch(r'\d{1,2}',str(value)) or not 1<=int(value)<=60:raise ValueError('周次应为 1–60，可用逗号或范围连接。')
            if int(value) not in weeks:weeks.append(int(value))
        weeks.sort();result.update(week=weeks[0] if weeks else None,weeks=weeks)
    for key,limit in [('class_type',60),('topic',150),('chapter',100)]:
        if not partial or key in data:result[key]=str(data.get(key) or '').strip()[:limit]
    if 'kind' in data:
        if data['kind'] not in KINDS:raise ValueError('资料类型无效。')
        result['kind']=data['kind']
    return result

def rules(name,text):
    fields={};sources={};conflicts=[]
    pieces=[('文件名',Path(name).stem),('正文',text[:16000])]
    patterns={
      'week':r'(?i)(?:(?<![a-zA-Z])week[\s_.-]*|第\s*)(\d{1,2})(?:\s*[-–至]\s*(\d{1,2}))?\s*(?:周|(?=$|[^\da-zA-Z]))',
      'class_type':r'(?i)(?<![a-zA-Z])(lecture|tutorial|lab(?:oratory)?|seminar|workshop|exam|exercise)(?![a-zA-Z])|讲座|讲义|习题课|实验课|研讨课|真题|期末试卷',
      'chapter':r'(?i)\bchapter\s*\d+(?:\.\d+)*|第[一二三四五六七八九十百零\d]+(?:章|节|单元)'}
    for label,content in pieces:
        for key,pattern in patterns.items():
            matches=list(re.finditer(pattern,content))
            if not matches:continue
            values=[]
            for match in matches:
                if key=='week':
                    a=int(match.group(1));b=int(match.group(2) or a)
                    if not 1<=a<=b<=60:continue
                    value=list(range(a,b+1))
                elif key=='class_type':
                    raw=match.group().lower();value={'lecture':'Lecture','tutorial':'Tutorial','lab':'Lab','laboratory':'Lab','seminar':'Seminar','workshop':'Workshop','exam':'Exam','exercise':'Exercise','讲座':'Lecture','讲义':'Lecture','习题课':'Tutorial','实验课':'Lab','研讨课':'Seminar','真题':'Exam','期末试卷':'Exam'}[raw]
                else:value=match.group().strip()
                if value not in [v[0] for v in values]:values.append((value,match.group()))
            if key=='week' and len(values)>1:
                observed=recognize_sessions(name,'') if label=='文件名' else recognize_sessions('',content)
                pairs=observed['sessions'];all_weeks={week for value,_ in values for week in value}
                if pairs and all(row['week'] is not None for row in pairs) and {row['week'] for row in pairs}==all_weeks:
                    values=[(sorted(all_weeks),'；'.join(evidence for _,evidence in values))]
            if len(values)!=1:
                if values:
                    conflicts.append(key);target='weeks' if key=='week' else key
                    ambiguity={'source':label,'evidence':'；'.join(e for _,e in values)[:480],'status':'conflict','alternatives':[{'value':v,'source':label,'evidence':e} for v,e in values]}
                    if target not in sources:sources[target]=ambiguity
                    else:sources[target].setdefault('alternatives',[]).extend(ambiguity['alternatives'])
                continue
            value,evidence=values[0]
            target='weeks' if key=='week' else key
            if target in fields:
                if fields[target]!=value:conflicts.append(key)
                continue
            fields[target]=value;sources[target]={'source':label,'evidence':evidence[:180]}
    # Topic only from an explicit document heading, never fabricated from file dates.
    heading=next((line.lstrip('# ').strip() for line in text.splitlines()[:18] if re.match(r'^\s*#{1,2}\s+\S',line)),None)
    if heading and not any(x in heading.lower() for x in ['timetable','课表','syllabus','教学大纲']):
        fields['topic']=heading[:150];sources['topic']={'source':'正文','evidence':heading[:180]}
    low=(name+'\n'+text[:2500]).lower()
    role='timetable' if any(x in low for x in ['timetable','课程表','课表','class schedule']) else 'syllabus' if any(x in low for x in ['syllabus','教学大纲','教学进度表']) else 'material'
    if 'class_type' in fields and fields['class_type']=='Exam':fields['kind']='exercises';sources['kind']=dict(sources['class_type'])
    if 'weeks' in fields:fields['week']=fields['weeks'][0]
    session_result=recognize_sessions(name,text)
    if session_result['sessions']:
        fields['sessions']=session_result['sessions'];sources['sessions']=session_result['source']
    if session_result['conflict']:conflicts.append('sessions')
    conflicts=list(dict.fromkeys(conflicts))
    for key,value in sources.items():
        value['status']='conflict' if key in conflicts or key=='weeks' and 'week' in conflicts else 'unconfirmed'
    # Keep a human-readable conflicting observation, not just a boolean flag.
    for conflict in conflicts:
        key='weeks' if conflict=='week' else conflict
        if key in sources:sources[key].setdefault('alternatives',session_result.get('alternatives',[]) if key=='sessions' else [{'source':'正文','evidence':text[:240]}])
    return {'fields':fields,'sources':sources,'conflicts':conflicts,'role':role}

def identify_course(name,text,courses):
    content=(name+'\n'+text[:8000]).casefold()
    matches=[]
    for c in courses:
        code=re.search(r'(?i)\b[A-Z]{2,6}\s*\d{2,4}\b',c['title'])
        title=c['title'].casefold()
        if (code and re.search(r'(?i)(?<!\w)'+re.escape(code.group()).replace(r'\ ',r'\s*')+r'(?!\w)',content)) or len(title)>=3 and title in content:matches.append(c)
    if len(matches)==1:return matches[0]['id']
    return None


SESSION_TYPE=r'(Lecture|Tutorial|Lab(?:oratory)?|Exercise|Seminar|Workshop|Exam)'
SESSION_RE=re.compile(r'(?i)(?<![a-zA-Z])'+SESSION_TYPE+r'[\s_.:#-]*(\d{1,3})(?!\d)')
WEEK_RE=re.compile(r'(?i)(?:(?<![a-zA-Z])week[\s_.-]*|第\s*)(\d{1,2})(?:\s*[-–至]\s*(\d{1,2}))?\s*(?:周|(?=$|[^\da-zA-Z]))')

def normalize_sessions(raw):
    if raw is None:return []
    if not isinstance(raw,list) or len(raw)>100:raise ValueError('课次应为列表，最多 100 项。')
    rows=[]
    for row in raw:
        if not isinstance(row,dict):raise ValueError('课次信息无效。')
        result={}
        for key,limit,label in [('week',60,'周次'),('number',999,'课次')]:
            value=row.get(key)
            if value in (None,''):result[key]=None
            elif isinstance(value,bool) or not re.fullmatch(r'\d{1,3}',str(value)) or not 1<=int(value)<=limit:raise ValueError(label+'无效。')
            else:result[key]=int(value)
        result['class_type']=str(row.get('class_type') or '').strip()[:60]
        if result['week'] is None and result['number'] is None and not result['class_type']:continue
        if result not in rows:rows.append(result)
    return rows

def recognize_sessions(name,text):
    """Pair only an explicit single week with an ordinal in the same local clause.

    Two independent ranges/lists must never be zipped: unknown pairings stay null.
    File metadata does not retroactively assign a week to unrelated body sessions.
    """
    observations=[]
    for source,content in [('文件名',Path(name).stem),('正文',text[:16000])]:
        rows=[];evidence=[]
        for clause in re.split(r'[\n;；|]+',content):
            sessions=list(SESSION_RE.finditer(clause));weeks=list(WEEK_RE.finditer(clause))
            for match in sessions:
                kind=match.group(1).title();kind='Lab' if kind=='Laboratory' else kind
                week=None
                # A single local week applies only when not expressed as a range.
                if len(weeks)==1 and not weeks[0].group(2):week=int(weeks[0].group(1))
                elif len(weeks)>1:
                    preceding=[w for w in weeks if w.end()<=match.start()]
                    following=[s for s in sessions if s.start()<match.start()]
                    w=preceding[-1] if preceding else None
                    if w and not w.group(2) and (not following or w.start()>following[-1].end()):week=int(w.group(1))
                if week is not None and not 1<=week<=60:week=None
                row={'week':week,'class_type':kind,'number':int(match.group(2))}
                if row['number'] and row not in rows:rows.append(row);evidence.append(clause.strip()[:240])
        if rows:observations.append({'source':source,'sessions':rows,'evidence':'；'.join(dict.fromkeys(evidence))[:480]})
    if not observations:return {'sessions':[],'source':{},'conflict':False,'alternatives':[]}
    first=observations[0];conflict=any(o['sessions']!=first['sessions'] for o in observations[1:])
    return {'sessions':first['sessions'],'source':{'source':first['source'],'evidence':first['evidence']},'conflict':conflict,'alternatives':observations[1:]}
