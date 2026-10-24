"""Evidence-based experience constraints; regex rules and fixtures are shared with the UI."""
import json
import re
from pathlib import Path
from .requirements import candidate_clauses, SECTIONS

RULES = json.loads((Path(__file__).parents[1] / 'config/experience-rules.json').read_text())
PATTERNS = [(row['kind'], re.compile(row['pattern'], re.I)) for row in RULES['patterns']]
WORDS = re.compile(r'\b(' + '|'.join(RULES['words']) + r')\b', re.I)
OPTIONAL = re.compile(RULES['optional'], re.I)
DURATION_PREFIX = re.compile(RULES['duration_prefix'], re.I)
REQUIRED = re.compile(SECTIONS['required'], re.I)
PREFERRED = re.compile(SECTIONS['preferred'], re.I)
JUNIOR = re.compile(RULES['junior'], re.I)
JUNIOR_EXCLUDED = re.compile(RULES['junior_excluded'], re.I)


def analyze_experience(description):
    required, preferred = [], []
    conditional = False
    for original, section in candidate_clauses(description):
        # Keep a required minimum separate from a preferred number on the same line.
        for fragment in re.split(RULES['fragment_split'], original, flags=re.I):
            text = WORDS.sub(lambda m: str(RULES['words'][m.group(0).lower()]), fragment)
            if re.search(r'\b(?:company|organisation|organization|team)\s+has\b|\bfounded\b', text, re.I):
                continue
            if re.search(RULES['exclude'], text, re.I) and not re.search(r'\bexperience\b', text, re.I) and not JUNIOR.search(text):
                continue
            optional = bool(PREFERRED.search(section) or OPTIONAL.search(text))
            rows, spans = [], []
            for kind, pattern in PATTERNS:
                for match in pattern.finditer(text):
                    start, end = match.span()
                    if any(start < right and end > left for left, right in spans):
                        continue
                    if DURATION_PREFIX.search(text[max(0, start - 80):start]):
                        continue
                    after = text[end:end + 60]
                    if re.match(r"\s*(?:long\s+)?(?:degree|course|contract|tenure|warranty|bond|bachelor|master|phd|ago|old)\b", after, re.I):
                        continue
                    if (not REQUIRED.search(section) and not optional and not re.search(r'\b(?:experience|experienced|overall|candidate|minimum|maximum|requires?|needs?|freshers?)\b', text, re.I)
                            and not re.fullmatch(r'[\d\s.\-–—+]+(?:years?|yrs?|yoe|months?|mos?)\.?', text.strip(), re.I)
                            and kind == 'exact'):
                        continue
                    groups = match.groups()
                    factor = lambda unit: 1 / 12 if str(unit).lower().startswith(('month', 'mo')) else 1
                    if kind == 'range':
                        lo = float(groups[0]) * factor(groups[1] or groups[3])
                        hi = float(groups[2]) * factor(groups[3])
                        if '+' in match.group(0) and hi >= lo:
                            hi = None
                    else:
                        value = float(groups[0]) * factor(groups[1])
                        lo, hi = (0, value) if kind == 'upper' else (value, None) if kind == 'lower' else (value, value)
                    rows.append(dict(min=round(lo, 6), max=None if hi is None else round(hi, 6), kind='lower' if kind == 'range' and hi is None else kind, evidence=fragment.strip(), section=section))
                    spans.append((start, end))
            if len(rows) > 1 and re.search(r'\bor\b', text, re.I) and not optional:
                conditional = True
            if not rows and JUNIOR.search(text) and not JUNIOR_EXCLUDED.search(text):
                rows.append(dict(min=0, max=None, kind='junior', evidence=fragment.strip(), section=section))
            (preferred if optional else required).extend(rows)
    def unique(rows):
        return list({(row['min'], row['max'], row['kind'], row['evidence'], row['section']): row for row in rows}.values())
    required, preferred = unique(required), unique(preferred)
    result = dict(min=None, max=None, label='Unknown', status='unknown', required=required, preferred=preferred)
    numeric = [row for row in required if row['kind'] != 'junior']
    constraints = numeric or required
    if not constraints:
        return result
    if conditional:
        return dict(result, status='conditional', label='Conditional experience — verify')
    overall = [row for row in numeric if re.search(RULES['overall_scope'], row['evidence'], re.I)]
    if len(overall)>1 and max(row['min'] for row in overall)>min(float('inf') if row['max'] is None else row['max'] for row in overall):
        return dict(result, status='conflict', label='Conflicting experience — verify')
    lower = [row['min'] for row in constraints if row['kind'] == 'lower']
    upper = [row['max'] for row in constraints if row['kind'] == 'upper']
    if lower and upper:
        constraints = [row for row in constraints if row['kind'] != 'lower'] + [dict(min=max(lower), max=min(upper), kind='range')]
    if any(row['max'] is not None and row['min'] > row['max'] for row in constraints):
        return dict(result, status='conflict', label='Conflicting experience — verify')
    chosen = max(constraints, key=lambda row: (row['min'], float('inf') if row['max'] is None else row['max']))
    lo, hi = chosen['min'], chosen['max']
    number = lambda value: f'{value:.6f}'.rstrip('0').rstrip('.') or '0'
    label = 'Fresher' if chosen['kind'] == 'junior' else number(lo) + '+' if hi is None else number(lo) if lo == hi else number(lo) + '–' + number(hi)
    return dict(result, min=lo, max=hi, label=label, status='stated')


def experience_within_policy(minimum, maximum):
    """A valid stated minimum up to three years qualifies, irrespective of ceiling."""
    return (minimum is not None and 0 <= minimum <= RULES['max_minimum_experience_years']
            and (maximum is None or maximum >= minimum))
