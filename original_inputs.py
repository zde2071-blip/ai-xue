"""Lossless original inputs; no OCR, text extraction, or silent fallback."""
import base64
import copy
from pathlib import Path

MIMES={'.pdf':'application/pdf','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'}
MAX_BYTES=15*1024*1024


def attach(cfg,messages,originals,fail):
    result=copy.deepcopy(messages)
    parts=[];total=0
    for file in originals:
        name=Path(file['filename']).name;raw=file['raw'];suffix=Path(name).suffix.lower()
        total+=len(raw)
        if not raw or len(raw)>MAX_BYTES or total>30*1024*1024:
            raise fail('原件为空或过大，请缩小关联材料范围后重试。')
        heading='原件：'+name+('；原件页码：'+file['pages'] if file.get('pages') else '')
        if suffix in ('.md','.txt'):
            try:text=raw.decode('utf-8-sig')
            except UnicodeError:raise fail('文字原件需要 UTF-8 编码。') from None
            parts.append({'type':'text','text':heading+'\n'+text});continue
        mime=MIMES.get(suffix)
        if not mime:raise fail('当前尚不支持直传这种原件格式，请使用 PDF、PPTX、DOCX、图片或文字文件。')
        encoded=base64.b64encode(raw).decode()
        parts.append({'type':'text','text':heading})
        if mime.startswith('image/'):
            parts.append({'type':'image_url','image_url':{'url':f'data:{mime};base64,{encoded}'}})
        else:
            provider=cfg['provider']
            supported=provider=='openai' or suffix=='.pdf' and provider in ('claude','gemini','custom')
            if not supported:
                label='DeepSeek Flash' if provider=='deepseek' else '当前服务'
                raise fail(label+' 不支持 '+suffix[1:].upper()+' 原件，请在 AI 服务中切换到支持该文件的模型后重试。')
            parts.append({'type':'file','file':{'filename':name,'file_data':f'data:{mime};base64,{encoded}'}})
    if not parts:raise fail('没有可发送的课件原件，请检查关联材料。')
    last=next((row for row in reversed(result) if row['role']=='user'),None)
    if last is None:raise fail('缺少本次学习要求。')
    if isinstance(last['content'],str) and all(part['type']=='text' for part in parts):
        last['content']+='\n\n'+'\n\n'.join(part['text'] for part in parts)
    else:
        last['content']=([{'type':'text','text':last['content']}] if isinstance(last['content'],str) else last['content'])+parts
    return result


def select_pages(name,raw,pages):
    """Only send pages explicitly linked by the user; keep their original numbering."""
    if not pages:return raw
    import io
    wanted=[]
    for span in pages.split(','):
        pair=[int(x.strip()) for x in span.split('-')]
        wanted.extend(range(pair[0],pair[-1]+1))
    wanted=sorted(set(wanted));suffix=Path(name).suffix.lower()
    out=io.BytesIO()
    if suffix=='.pdf':
        from pypdf import PdfReader,PdfWriter
        reader=PdfReader(io.BytesIO(raw));writer=PdfWriter()
        if not wanted or wanted[0]<1 or wanted[-1]>len(reader.pages):raise ValueError('关联页码超出原件范围。')
        for number in wanted:writer.add_page(reader.pages[number-1])
        writer.write(out)
    elif suffix=='.pptx':
        from pptx import Presentation
        deck=Presentation(io.BytesIO(raw))
        if not wanted or wanted[0]<1 or wanted[-1]>len(deck.slides):raise ValueError('关联页码超出原件范围。')
        for index in reversed(range(len(deck.slides))):
            if index+1 not in wanted:
                slide_id=deck.slides._sldIdLst[index];deck.part.drop_rel(slide_id.rId);deck.slides._sldIdLst.remove(slide_id)
        deck.save(out)
    else:raise ValueError('这种原件不支持按页关联。')
    return out.getvalue()
