import unittest
from datetime import date
from unittest.mock import patch
import calendar_subscription as c
import server as app
import test_calendar_store

ICS=b'''BEGIN:VCALENDAR\r
VERSION:2.0\r
X-WR-CALNAME:School\r
BEGIN:VEVENT\r
UID:course\r
DTSTART;TZID=Asia/Shanghai:20261102T090000\r
DTEND;TZID=Asia/Shanghai:20261102T103000\r
RRULE:FREQ=WEEKLY;COUNT=3\r
EXDATE;TZID=Asia/Shanghai:20261109T090000\r
SUMMARY:Math\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:holiday\r
DTSTART;VALUE=DATE:20261106\r
DTEND;VALUE=DATE:20261109\r
SUMMARY:Holiday\r
END:VEVENT\r
END:VCALENDAR\r
'''
class SubscriptionTests(unittest.TestCase):
    def test_recurrence_exceptions_timezone_and_exclusive_all_day_end(self):
        result=c.parse_calendar(ICS,'school',today=date(2026,11,6))
        self.assertEqual([r['date'] for r in result['events']],['2026-11-02','2026-11-16'])
        self.assertEqual(result['events'][0]['start'],'09:00')
        self.assertEqual(result['calendar'][0]['end'],'2026-11-08')
        self.assertTrue(all(r['source_id']=='school' for r in result['events']))
    def test_campus_feed_empty_timezone_date_uses_known_iana_zone(self):
        zone=b'BEGIN:VTIMEZONE\r\nTZID:Asia/Shanghai\r\nBEGIN:STANDARD\r\nDTSTART:\r\nTZOFFSETFROM:+0800\r\nTZOFFSETTO:+0800\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n'
        raw=ICS.replace(b'BEGIN:VEVENT',zone+b'BEGIN:VEVENT',1)
        result=c.parse_calendar(raw,'school',today=date(2026,11,6))
        self.assertEqual(result['events'][0]['start'],'09:00')
    def test_refresh_has_stable_ids_and_does_not_write(self):
        with patch.object(c,'fetch_calendar',return_value=ICS):
            data={'url':'webcal://example.com/calendar','source_id':'school','name':'School'}
            one=c.subscribe(app.__dict__,data);two=c.subscribe(app.__dict__,data)
        self.assertEqual(one['events'],two['events']);self.assertEqual(one['source']['url'],'https://example.com/calendar')
    def test_invalid_content_private_urls_and_transport_errors(self):
        with self.assertRaises(ValueError):c.parse_calendar(b'<html>login</html>','school')
        with patch.object(c.socket,'getaddrinfo',return_value=[(2,1,6,'',('127.0.0.1',80))]):
            with self.assertRaises(ValueError):c.public_url('http://example.com/cal')
        with patch.object(c,'fetch_calendar',side_effect=RuntimeError('private subscription token')):
            with self.assertRaises(app.Problem) as error:c.subscribe(app.__dict__,{'url':'https://example.com/calendar'})
        self.assertNotIn('token',str(error.exception))

class SourceStorageTests(unittest.TestCase):
    setUp=test_calendar_store.CalendarStoreTest.setUp
    tearDown=test_calendar_store.CalendarStoreTest.tearDown
    save=test_calendar_store.CalendarStoreTest.save
    def test_source_visibility_color_and_refresh_round_trip(self):
        doc=self.store.document()
        source={'id':'school','name':'School','kind':'timetable','type':'subscription','url':'https://example.com/calendar','visible':False,'color':'#527eac'}
        rows=c.parse_calendar(ICS,'school',today=date(2026,11,6))
        saved=self.save(doc,sources=[source],events=rows['events'],calendar=rows['calendar'])
        self.assertEqual(saved['sources'],[source]);self.assertEqual(saved,self.store.document())
        self.assertEqual(saved['events'][0]['source_id'],'school')
        with self.assertRaises(app.Problem):self.save(saved,sources=[])
