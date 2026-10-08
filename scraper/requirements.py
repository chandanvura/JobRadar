"""Conservative candidate text boundaries, shared with browser requirement review."""
import html
import json
import re
from pathlib import Path

SECTIONS = json.loads((Path(__file__).parents[1] / 'config/requirement-sections.json').read_text())
HEADER = re.compile(r'\b(' + SECTIONS['headers'] + r')\s*:?', re.I)
COMPANY = re.compile(SECTIONS['company_clause'], re.I)


def candidate_clauses(description):
    # Older adapters collapse HTML into one line. Heading boundaries still work.
    text = html.unescape(re.sub(r'<[^>]+>', '\n', description or ''))[:20000]
    text = text.replace('’', "'").replace('‘', "'")
    text = HEADER.sub(lambda m: '\n§' + m.group(1).lower() + '\n', text)
    section = 'unspecified'
    result = []
    for part in re.split(r'[\n;•]|(?<=[.!?])\s+', text):
        clause = part.strip()
        if clause.startswith('§'):
            section = clause[1:]
            continue
        if not clause or re.search(SECTIONS['boilerplate'], section, re.I) or COMPANY.search(clause):
            continue
        result.append((clause, section))
    return result


def candidate_text(description, include_preferred=True):
    return '\n'.join(clause for clause, section in candidate_clauses(description)
                     if include_preferred or (not re.search(SECTIONS['preferred'], section, re.I)
                     and not re.search(r'\b(?:preferred|nice to have|good to have|a plus|desirable|bonus|optional)\b', clause, re.I)))
