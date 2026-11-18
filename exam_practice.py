"""Normalize material-backed mock papers and record independent attempts."""

import hashlib
import json
import unicodedata


TYPES = {'single', 'multiple', 'blank', 'written'}


def clip(value, limit):
    return value.strip()[:limit] if isinstance(value, str) else ''


def identifier(*values):
    return hashlib.sha256(json.dumps(values, ensure_ascii=False).encode()).hexdigest()[:24]


def clean_papers(value, filenames):
    if not isinstance(value, list):
        raise ValueError('AI 没有返回可读取的模拟题清单。')
    papers = {}
    for row in value[:20]:
        if not isinstance(row, dict):
            continue
        source = clip(row.get('source'), 150)
        title = clip(row.get('title'), 160)
        questions = row.get('questions')
        if source not in filenames or not title or not isinstance(questions, list):
            continue
        paper_id = identifier(source, title.casefold())
        cleaned = []
        for question in questions[:150]:
            if not isinstance(question, dict):
                continue
            kind = question.get('type')
            prompt = clip(question.get('prompt'), 12000)
            if not isinstance(kind, str) or kind not in TYPES or not prompt:
                continue
            position = len(cleaned)
            raw_options = question.get('options')
            options = [clip(option, 3000) for option in raw_options[:12]] if isinstance(raw_options, list) else []
            choices = kind in ('single', 'multiple')
            if choices and (len(options) < 2 or not all(options)):
                continue
            raw_answer = question.get('answer')
            answer = []
            if isinstance(raw_answer, list):
                if choices:
                    valid = all(type(option) is int and 0 <= option < len(options) for option in raw_answer)
                    if valid and (kind != 'single' or len(raw_answer) == 1):
                        answer = sorted(set(raw_answer))
                elif kind == 'blank':
                    answer = list(dict.fromkeys(filter(None, (clip(part, 1000) for part in raw_answer[:20]))))
            cleaned.append({
                'id': identifier(paper_id, position, prompt), 'type': kind, 'prompt': prompt,
                'options': options if choices else [], 'answer': answer,
                'explanation': clip(question.get('explanation'), 4000),
            })
        if cleaned:
            paper = {'id': paper_id, 'title': title, 'source': source, 'questions': cleaned}
            paper['version'] = identifier(cleaned)
            papers[paper_id] = paper
    return list(papers.values())


def public_paper(paper):
    return {**paper, 'questions': [
        {key: question[key] for key in ('id', 'type', 'prompt', 'options')}
        for question in paper['questions']
    ]}


def normalize_answer(text):
    return ' '.join(unicodedata.normalize('NFKC', text).casefold().split())


def grade(paper, answers):
    if not isinstance(answers, dict) or not answers.keys() <= {q['id'] for q in paper['questions']}:
        raise ValueError('作答与当前试卷不符，请重新打开试卷。')
    rows = []
    for q in paper['questions']:
        expected = q['answer']
        value = answers.get(q['id'], [] if q['options'] else '')
        if q['options']:
            if (not isinstance(value, list) or len(value) > len(q['options'])
                    or any(type(n) is not int or not 0 <= n < len(q['options']) for n in value)
                    or q['type'] == 'single' and len(value) > 1):
                raise ValueError('选择题的作答格式有误。')
            value = sorted(set(value))
            correct = value == expected if expected else None
        else:
            if not isinstance(value, str):
                raise ValueError('作答必须是文字。')
            value = clip(value, 12000)
            correct = normalize_answer(value) in {normalize_answer(x) for x in expected} if expected else None
        rows.append({**q, 'response': value, 'correct': correct})
    return {
        'questions': rows,
        'correct': sum(row['correct'] is True for row in rows),
        'graded': sum(row['correct'] is not None for row in rows),
        'answered': sum(bool(row['response']) for row in rows),
    }
