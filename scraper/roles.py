"""Shared technical-role vocabulary with conservative description disambiguation."""
import json
import re
import unicodedata
from pathlib import Path

TAXONOMY = json.loads((Path(__file__).resolve().parents[1] / 'config/roles.json').read_text())
ROLE_PATTERNS = {role['family']: '|'.join(role['patterns']) for role in TAXONOMY['roles']}
COMPILED_ROLES = [(family, re.compile(pattern, re.I)) for family, pattern in ROLE_PATTERNS.items()]
NON_TECHNICAL = re.compile(r'\b(?:non technical|nontechnical|human resources|talent acquisition|marketing|tax|civil|mechanical|chemical|electrical maintenance|sales associate|financial advisor)\b', re.I)
AMBIGUOUS_TITLE = re.compile(r'\b(?:developer|programmer|engineer|analyst|consultant|associate|graduate|trainee|intern|apprentice)\b', re.I)
TECHNICAL_EVIDENCE = re.compile(r'\b(?:software development|software engineering|programming|coding|computer science|rest api|kubernetes|linux|sql|python|java|javascript|typescript|aws|azure|terraform|firmware|embedded software)\b', re.I)


def normalize_title(title):
    text = unicodedata.normalize('NFKC', title).casefold().replace('&', ' and ')
    return re.sub(r'[^a-z0-9+#.]+', ' ', text).strip()


def classify_role(title, description=''):
    clean = normalize_title(title)
    if NON_TECHNICAL.search(clean):
        return clean, 'Other'
    for family, pattern in COMPILED_ROLES:
        if pattern.search(clean):
            return clean, family
    # Ambiguous employer labels are not enough on their own. Require multiple
    # distinct technical signals from the actual requirements, not a company bio.
    if AMBIGUOUS_TITLE.search(clean):
        evidence = {match.group(0).casefold() for match in TECHNICAL_EVIDENCE.finditer(description)}
        if len(evidence) >= 2:
            return clean, 'Software Engineering'
    return clean, 'Other'


def likely_technical_title(title):
    clean = normalize_title(str(title))
    return not NON_TECHNICAL.search(clean) and bool(
        AMBIGUOUS_TITLE.search(clean) or any(pattern.search(clean) for _, pattern in COMPILED_ROLES)
        or re.search(r'\b(?:devops|devsecops|sre|sde|swe|sdet|qa|cloudops|get)\b', clean)
    )
