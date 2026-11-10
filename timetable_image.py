"""Read timetable screenshots with weekday columns and colored class blocks."""
import io
import json
import re
import statistics
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

DAYS = ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')
OCR_CODE_LOOKALIKES = str.maketrans('АВСЕНКМОРТХІУ', 'ABCEHKMOPTXIY')
COURSE = re.compile(r'\b([A-Z]{2,6})\s*(\d{2,4})(?![A-Z0-9])', re.I)
TIME = re.compile(r'(?<!\d)([01]?\d|2[0-3]):([0-5]\d)\s*[-–—~]\s*([01]?\d|2[0-3]):([0-5]\d)(?!\d)')
WEEK = re.compile(r'\bWeeks?\s*[:：]?\s*([\d,，、\s–—-]+)', re.I)


def week_numbers(value):
    weeks = set()
    for part in re.split(r'[,，、]', value):
        span = re.fullmatch(r'\s*(\d{1,2})(?:\s*[-–—]\s*(\d{1,2}))?\s*', part)
        if not span:
            return None
        start = int(span[1])
        end = int(span[2] or span[1])
        if not 1 <= start <= end <= 60:
            return None
        weeks.update(range(start, end + 1))
    return sorted(weeks)


def class_from_card(lines, day):
    parts = [unicodedata.normalize('NFKC', row['text']).strip()
             for row in sorted(lines, key=lambda row: (row['y'], row['x']))]
    code = next((match for part in parts[:2] if (match := COURSE.match(part.translate(OCR_CODE_LOOKALIKES)))), None)
    # The classroom type is printed beside or immediately below the course code.
    header = ' '.join(parts[:2])
    kind = re.search(r'\b(Comp\s*\.?\s*Lab|Lecture|Tutorial|Lab|Seminar|Workshop|Studio|Practical)\b', header, re.I)
    times = [match for part in parts if (match := TIME.search(part))]
    week_lines = [i for i, part in enumerate(parts) if WEEK.search(part)]
    if not code or not kind or len(times) != 1 or len(week_lines) != 1:
        return None
    index = week_lines[0]
    value = WEEK.search(parts[index])[1]
    if index+1 < len(parts) and re.fullmatch(r'[\d,，、\s–—-]+', parts[index+1]):
        value += parts[index+1] if value.rstrip().endswith((',', '，', '、', '-', '–', '—')) else ','+parts[index+1]
    weeks = week_numbers(value)
    start_hour, start_minute, end_hour, end_minute = map(int, times[0].groups())
    start, end = f'{start_hour:02}:{start_minute:02}', f'{end_hour:02}:{end_minute:02}'
    if not weeks or start >= end:
        return None
    class_type = re.sub(r'\s+', '', kind[1])
    if class_type.replace('.', '').casefold() == 'complab':
        class_type = 'Comp.Lab'
    return {'course': (code[1]+code[2]).upper(), 'class_type': class_type, 'weekday': day,
            'weeks': weeks, 'time': start+'–'+end}


def boxes(paths, cache):
    command = ['/usr/bin/swift', '-module-cache-path', str(cache),
               str(Path(__file__).resolve().parent/'tools'/'ocr.swift'), '--boxes', *map(str, paths)]
    output = subprocess.run(command, capture_output=True, check=True, timeout=60)
    return json.loads(output.stdout)


def header_columns(image, observations):
    marker = next((row for row in observations if row['text'].strip().casefold() == 'time'), None)
    if marker is None:
        return None
    y = round((marker['y'] - marker['height']*.7)*image.height)
    if y < 2:
        return None
    gray = image.convert('L')
    runs = []
    for x in range(image.width):
        if all(gray.getpixel((x, row)) < 95 for row in range(y-2, y+3)):
            if runs and x-runs[-1] < 4:
                continue
            runs.append(x)
    if len(runs) not in (8, 9):
        return None
    ordinary = round(statistics.median(b-a for a,b in zip(runs[1:],runs[2:])))
    if len(runs) == 8:
        runs.append(min(image.width, runs[-1]+ordinary))
    if ordinary < 35 or not .3*ordinary < runs[1]-runs[0] < .9*ordinary:
        return None
    return runs[1:], y, round((marker['y']+marker['height']*2)*image.height), ordinary


def colored_cards(image, edges, top, ordinary):
    red, green, blue = image.split()
    high = ImageChops.lighter(ImageChops.lighter(red,green),blue)
    low = ImageChops.darker(ImageChops.darker(red,green),blue)
    mask = ImageChops.multiply(ImageChops.subtract(high,low).point(lambda n: 255 if n >= 25 else 0),
                               low.point(lambda n: 255 if n >= 105 else 0))
    pixels = mask.load()
    cards = []
    for day, (left, right) in enumerate(zip(edges, edges[1:]), 1):
        subdivisions = max(1, round((right-left)/ordinary))
        for i in range(subdivisions):
            a = round(left+(right-left)*i/subdivisions)
            b = round(left+(right-left)*(i+1)/subdivisions)
            xs = list(range(a+5,b-5,3))
            start = last = None
            for y in range(top, image.height):
                if sum(bool(pixels[x,y]) for x in xs) > len(xs)*.53:
                    if start is None:
                        start = y
                    last = y
                elif last is not None and y-last > 6:
                    if last-start >= 20:
                        cards.append((day, (a+2,start-3,b-2,last+4)))
                    start = last = None
    return cards


def recognize(raw, *, headings=None):
    if sys.platform != 'darwin':
        return None
    try:
        with tempfile.TemporaryDirectory(prefix='study-timetable-') as temp:
            folder = Path(temp)
            with Image.open(io.BytesIO(raw)) as opened:
                if opened.width*opened.height > 20_000_000:
                    return None
                image = ImageOps.exif_transpose(opened).convert('RGB')
            image.thumbnail((1600, 4000), Image.Resampling.LANCZOS)
            path = folder/'table.png'
            image.save(path)
            observations, = boxes([path], Path(tempfile.gettempdir())/'ai-xue-swift-cache')
            header = header_columns(image, observations)
            if not header:
                return None
            edges, top, bottom, ordinary = header
            if headings is not None:
                above = sorted((row for row in observations if row['y'] * image.height < top),
                               key=lambda row: (row['y'], row['x']))
                headings.append('\n'.join(row['text'] for row in above))
            cards = colored_cards(image, edges, bottom, ordinary)
            if not cards or len(cards) > 100:
                return None
            # Read headers as well, so a colored table with another column order
            # cannot be mistaken for a Monday-to-Sunday timetable.
            crops = [(a,top,b,bottom) for a,b in zip(edges,edges[1:])] + [bounds for _,bounds in cards]
            paths = []
            for i,bounds in enumerate(crops):
                crop = ImageOps.autocontrast(ImageOps.grayscale(image.crop(bounds)))
                crop = crop.resize((crop.width*3,crop.height*3), Image.Resampling.LANCZOS)
                path = folder/f'{i}.png'
                crop.save(path)
                paths.append(path)
            results = boxes(paths, Path(tempfile.gettempdir())/'ai-xue-swift-cache')
            if len(results) != len(paths):
                return None
            for label, parts in zip(DAYS,results[:7]):
                if not any(row['text'].strip().upper().startswith(label) for row in parts):
                    return None
            rows = [class_from_card(lines,day) for (day,_),lines in zip(cards,results[7:])]
            return rows if rows and all(rows) and len(rows)==len(cards) else None
    except (OSError, ValueError, Image.DecompressionBombError, subprocess.SubprocessError):
        return None
