"""Create an unverified company review queue. Never import people or send alerts."""
import argparse
import csv
import hashlib
import io
import ipaddress
import json
import re
import tempfile
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit

OUTPUT_COLUMNS = ['company_key', 'company_name', 'company_aliases', 'source_rows',
                  'source_count', 'source_dataset_sha256', 'candidate_career_url',
                  'candidate_career_urls', 'evidence_url', 'evidence_urls', 'review_status']
PUBLIC_HOSTS = {'scribd.com', 'slideshare.net', 'docs.google.com', 'linkedin.com',
                'facebook.com', 'indeed.com', 'naukri.com', 'glassdoor.com'}


def company_key(name):
    return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFKC', name or '').casefold()).strip()


def valid_https(url):
    """Check public URL syntax. This does not establish employer ownership."""
    try:
        if not isinstance(url, str) or re.search(r'[\x00-\x20\\]', url):
            return False
        p = urlsplit(url)
        host = (p.hostname or '').lower()
        if p.scheme != 'https' or not host or p.username or p.password or p.port not in (None, 443):
            return False
        if '.' not in host or host.endswith(('.local', '.internal', '.localhost', '.')) or '%' in host:
            return False
        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:
            pass
        return bool(re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', host))
    except ValueError:
        return False


def review_url(value):
    if not valid_https(value):
        return ''
    p = urlsplit(value)
    # Queries and fragments can contain contact details or private access tokens.
    if '@' in unquote(p.path) or re.search(r'(?i)(?:mailto:|tel:)', unquote(p.path)):
        return ''
    return urlunsplit(('https', p.netloc.lower(), p.path, '', ''))


def third_party(url):
    host = (urlsplit(url).hostname or '').lower()
    return any(host == domain or host.endswith('.' + domain) for domain in PUBLIC_HOSTS)


def public_company(value):
    name = ' '.join((value or '').split())
    if (not name or name[0] in '=+-@' or '@' in name
            or re.search(r'\d[\d +().-]{6,}\d', name) or len(name) > 200):
        return ''
    return name


def extract(input_path, output_path):
    source_path, target = Path(input_path), Path(output_path)
    if source_path.resolve() == target.resolve():
        raise ValueError('The review queue must not overwrite the original input')
    raw = source_path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    grouped, seen_ids = defaultdict(list), set()
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig'), newline=''))
    if not reader.fieldnames or 'Company Name' not in reader.fieldnames:
        raise ValueError('Missing required Company Name column')
    for index, record in enumerate(reader, 1):
        if None in record:
            raise ValueError(f'Malformed CSV record at row {index}')
        name = public_company(record.get('Company Name'))
        key = company_key(name) or f'unresolved row {index:06d}'
        source_id = (record.get('Audit Row ID') or '').strip()
        if not re.fullmatch(r'(?:R\d{4,12}|\d{1,12})', source_id):
            source_id = f'ROW{index:06d}'
        if source_id in seen_ids:
            raise ValueError(f'Duplicate source row identifier at row {index}')
        seen_ids.add(source_id)
        candidate = review_url((record.get('Official Career URL') or '').strip())
        if candidate and third_party(candidate):
            candidate = ''
        evidence = [review_url((record.get(field) or '').strip())
                    for field in ('Evidence URL', 'Verified Source URL')]
        grouped[key].append((name or 'Company requires private review', source_id, candidate, evidence))
    buffer = io.StringIO(newline='')
    writer = csv.DictWriter(buffer, fieldnames=OUTPUT_COLUMNS)
    writer.writeheader()
    for key, rows in sorted(grouped.items()):
        aliases = sorted({r[0] for r in rows})
        candidates = sorted({r[2] for r in rows if r[2]})
        evidence = sorted({url for row in rows for url in row[3] if url})
        writer.writerow(dict(company_key=key, company_name=rows[0][0], company_aliases=json.dumps(aliases),
                             source_rows=';'.join(r[1] for r in rows), source_count=len(rows),
                             source_dataset_sha256=digest, candidate_career_url=next(iter(candidates), ''),
                             candidate_career_urls=json.dumps(candidates), evidence_url=next(iter(evidence), ''),
                             evidence_urls=json.dumps(evidence), review_status='UNVERIFIED'))
    content = buffer.getvalue()
    if target.exists() and target.read_bytes() == content.encode('utf-8'):
        return len(grouped)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='', dir=target.parent, delete=False) as out:
        temporary = Path(out.name)
        out.write(content)
    try:
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return len(grouped)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input_csv')
    parser.add_argument('output_csv')
    args = parser.parse_args()
    print(f'Exported {extract(args.input_csv, args.output_csv)} unverified company candidates')
