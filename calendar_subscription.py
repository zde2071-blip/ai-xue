"""Read-only iCalendar subscriptions. Fetches produce a draft, never a vault write."""
import hashlib
import ipaddress
import socket
import re
import uuid
from datetime import date, datetime, time, timedelta
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from zoneinfo import ZoneInfo

MAX_BYTES = 5 * 1024 * 1024


def subscription_url(value):
    if not isinstance(value, str) or len(value) > 4096:
        raise ValueError('请输入有效的日历订阅地址。')
    value = value.strip()
    if value.lower().startswith('webcal://'):
        value = 'https://' + value[9:]
    parts = urlsplit(value)
    if parts.scheme not in ('http', 'https') or not parts.hostname or parts.username or parts.password or parts.fragment:
        raise ValueError('请使用 http、https 或 webcal 日历订阅地址。')
    return value


def public_url(value):
    value = subscription_url(value)
    parts = urlsplit(value)
    addresses = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == 'https' else 80), type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('订阅地址需要是公开的日历链接。')
    return value


class PublicRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, public_url(newurl))


def fetch_calendar(url):
    req = Request(public_url(url), headers={'Accept': 'text/calendar', 'User-Agent': 'AI-Xue-Calendar/1.0'})
    with build_opener(PublicRedirect()).open(req, timeout=20) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('订阅内容超过 5 MB，请使用较小的日历。')
    return raw


def parse_calendar(raw, source_id, today=None, timezone='Asia/Shanghai'):
    import icalendar
    import recurring_ical_events
    if b'BEGIN:VCALENDAR' not in raw[:1024].upper():
        raise ValueError('链接未返回日历文件，请使用 ICS 订阅地址，而不是网页地址。')
    # Some campus feeds emit an incomplete VTIMEZONE with an empty DTSTART.
    # Drop only that broken definition when its TZID is a known IANA zone.
    text = raw.decode('utf-8-sig')
    def repair_zone(match):
        block=match.group(0)
        if re.search(r'^DTSTART:\s*$',block,re.M):
            zone=re.search(r'^TZID:([^\r\n]+)',block,re.M)
            if zone:
                try:ZoneInfo(zone[1].strip())
                except (KeyError,ValueError):return block
                return ''
        return block
    text=re.sub(r'BEGIN:VTIMEZONE\r?\n.*?END:VTIMEZONE\r?\n',repair_zone,text,flags=re.S)
    cal = icalendar.Calendar.from_ical(text)
    tz = ZoneInfo(timezone)
    today = today or datetime.now(tz).date()
    first, last = date(today.year-1, 1, 1), date(today.year+2, 1, 1)
    # Bound recurrence expansion; sub-daily calendars are not school timetables.
    for item in cal.walk('VEVENT'):
        rule = item.get('RRULE')
        if rule and str(rule.get('FREQ', [''])[0]) in ('SECONDLY', 'MINUTELY', 'HOURLY'):
            raise ValueError('暂不支持一天内高频重复的订阅。')
    rows, ranges = [], []
    for item in recurring_ical_events.of(cal).after(first):
        start = item.decoded('DTSTART')
        if isinstance(start, datetime):
            start = start.replace(tzinfo=tz) if start.tzinfo is None else start.astimezone(tz)
        start_day = start.date() if isinstance(start, datetime) else start
        if start_day >= last:
            break
        if str(item.get('STATUS', '')).upper() == 'CANCELLED':
            continue
        end = item.decoded('DTEND', start + (timedelta(hours=1) if isinstance(start, datetime) else timedelta(days=1)))
        if isinstance(end, datetime):
            end = end.replace(tzinfo=tz) if end.tzinfo is None else end.astimezone(tz)
        title = str(item.get('SUMMARY', '未命名安排'))[:150]
        location = str(item.get('LOCATION', ''))[:120]
        key = hashlib.sha256((source_id + str(item.get('UID', '')) + str(start)).encode()).hexdigest()[:32]
        if not isinstance(start, datetime):
            ranges.append({'kind':'nonteaching','week':None,'start':start.isoformat(),'end':max(start,end-timedelta(days=1)).isoformat(),'label':title[:80],'source_id':source_id})
        else:
            # Split overnight events at midnight to preserve the existing day/time model.
            cursor = start
            while cursor < end:
                boundary = datetime.combine(cursor.date()+timedelta(days=1), time(), tz)
                stop = min(end, boundary)
                rows.append({'id':key+'_'+str(len(rows)), 'title':title, 'kind':'event','date':cursor.date().isoformat(),'start':cursor.strftime('%H:%M'),'end':'23:59' if stop==boundary else stop.strftime('%H:%M'),'location':location,'source_id':source_id})
                cursor = stop
                if len(rows)>5000:raise ValueError('订阅安排超过 5000 项，请缩小订阅范围。')
        if len(rows)+len(ranges)>5000:
            raise ValueError('订阅安排超过 5000 项，请缩小订阅范围。')
    return {'events':rows,'calendar':ranges,'timetable':[], 'name':str(cal.get('X-WR-CALNAME','订阅日历'))[:150], 'notice':f'已读取 {first.year}–{last.year-1} 年的安排。'}


def subscribe(host, data):
    try:
        url = subscription_url(data.get('url'))
        source_id = data.get('source_id') or uuid.uuid4().hex
        import re
        if not isinstance(source_id,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',source_id):
            raise ValueError('日历来源无效。')
        result = parse_calendar(fetch_calendar(url),source_id)
        name = data.get('name') or result.pop('name')
        if not isinstance(name,str) or len(name)>150:raise ValueError('日历名称过长。')
        return {**result,'source':{'id':source_id,'name':name,'kind':'timetable','type':'subscription','url':url,'visible':True,'updated_at':datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(timespec='seconds')}}
    except ValueError as error:
        raise host['Problem'](str(error),422) from None
    except Exception:
        # URLs may carry subscription tokens; never echo transport/parser exceptions.
        raise host['Problem']('无法读取订阅，请检查链接是否可访问并返回有效的 ICS 日历。',422) from None
