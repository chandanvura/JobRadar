"""Compare company candidates with the registry. Matches are not verification."""
import argparse
import csv
import re
from pathlib import Path
try:
    from scripts.recruiter_company_candidates import company_key
except ModuleNotFoundError:
    from recruiter_company_candidates import company_key

# Restrict suggested aliases to title, legal-form and location noise.
# Do not absorb meaningful brand words such as Microsystems or GlobalSoft.
MODIFIERS = set('''india pvt private ltd limited services service consulting technology technologies
bangalore bengaluru hyderabad global it sourcing r d research development centre center
analyst advisory technical specialist acquisition architect associate consultant executive
lead senior sr manager director head human resources hr recruiter recruitment recruitement
ta talent engineer software delivery project operations officer partner team quality security
chain consulting leader of and at l acquisition recruiting support'''.split())
INVALID_IDENTIFIERS = {'data', 'inc', 'designs', 'health', 'fintech', 'cybersecurity', 'solutions',
                       'talent acquisition', 'talent collaboration', 'it consulting staffing',
                       'it recruitment services', 'it services consulting', 'tech hiring bangalore',
                       'your teaching partner', 'works group', 'learning centres', 'offshore services',
                       'datacenters', 'n a bengaluru india', 'education technology private li',
                       'unique occupational'}


def registry_match(name, registry):
    key = company_key(name)
    exact = [row for row in registry if company_key(row['company_name']) == key]
    if len(exact) == 1:
        return exact[0], 'EXACT'
    matches = []
    for row in registry:
        brand = company_key(row['company_name'])
        remaining, count = re.subn(r'(?<!\w)' + re.escape(brand) + r'(?!\w)', ' ', key)
        if count and set(remaining.split()) <= MODIFIERS:
            matches.append(row)
    return (matches[0], 'ALIAS_CANDIDATE') if len(matches) == 1 else (None, 'NONE')


def compare(candidates, registry):
    output = []
    for row in candidates:
        match, kind = registry_match(row['company_name'], registry)
        invalid = row['company_key'] in INVALID_IDENTIFIERS
        output.append({**row, 'registry_match_kind': kind,
                       'registry_company': match['company_name'] if match else '',
                       'registry_career_url': match['careers_url'] if match else '',
                       'registry_ats_provider': match['ats_provider'] if match else '',
                       'verification_status': 'REJECTED' if invalid else 'UNVERIFIED',
                       'verification_reason': 'Incomplete company identifier; retain original rows' if invalid else 'Official-source verification required',
                       'recruiter_identity_status': 'UNVERIFIED', 'automatic_alert_eligible': 'false'})
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate_csv'); parser.add_argument('registry_csv'); parser.add_argument('output_csv')
    args = parser.parse_args()
    with open(args.candidate_csv, newline='', encoding='utf-8-sig') as source:
        candidates = list(csv.DictReader(source))
    with open(args.registry_csv, newline='', encoding='utf-8-sig') as source:
        registry = list(csv.DictReader(source))
    rows = compare(candidates, registry)
    target = Path(args.output_csv)
    if target.resolve() in {Path(args.candidate_csv).resolve(), Path(args.registry_csv).resolve()}:
        raise ValueError('Do not overwrite source data')
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('w', newline='', encoding='utf-8') as dest:
        writer = csv.DictWriter(dest, fieldnames=list(rows[0]) if rows else [])
        writer.writeheader(); writer.writerows(rows)
    print(f'Reviewed {len(rows)} company groups; no source was activated')
