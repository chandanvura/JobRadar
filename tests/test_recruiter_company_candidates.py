import csv
import json
import pytest
from scripts.recruiter_company_candidates import extract, valid_https


def test_export_is_private_and_review_gated(tmp_path):
    source = tmp_path / "source.csv"
    source.write_text(
        "Company Name,Audit Row ID,Recruiter / HR Name,Parsed Direct Email,Parsed Direct Phone,Official Career URL\n"
        "Acme Inc,R0001,Alice,alice@example.com,9876543210,https://acme.example/careers\n"
        "ACME INC,R0002,Bob,bob@example.com,9876543211,\n"
        "Beta,R0003,Carol,carol@example.com,9876543212,https://scribd.com/fake\n",
        encoding="utf-8",
    )
    dest = tmp_path / "candidates.csv"
    assert extract(source, dest) == 2
    output = dest.read_text(encoding="utf-8")
    assert "alice@" not in output and "9876543210" not in output and "Alice" not in output
    with dest.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert rows[0]["review_status"] == "UNVERIFIED"
    assert rows[0]["source_count"] == "2"
    assert rows[1]["candidate_career_url"] == ""


def test_invalid_urls_rejected():
    assert not valid_https("javascript:alert(1)")
    assert not valid_https("http://example.com")
    assert not valid_https("https://user:password@example.com")
    assert valid_https("https://example.com/careers")


@pytest.mark.parametrize('url', [
    'https://127.0.0.1/careers', 'https://[::1]/careers', 'https://169.254.169.254/',
    'https://localhost/careers', 'https://example.internal/careers',
    'https://example.com:8443/jobs', 'https://example.com:99999/',
    'https://example.com\\@evil.test/jobs', 'https://example.com/with space',
    'https://user@example.com/jobs', 'file:///tmp/private',
])
def test_non_public_or_unsafe_source_urls_are_excluded(url):
    assert not valid_https(url)


def write_source(path, rows):
    with path.open('w', newline='', encoding='utf-8') as stream:
        writer=csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)


def test_contact_fields_and_url_parameters_cannot_leak_to_candidate_queue(tmp_path):
    source=tmp_path/'input.csv'; target=tmp_path/'queue.csv'
    write_source(source,[{'Company Name':'Acme','Audit Row ID':'secret.person@example.test',
                         'Official Career URL':'https://acme.example/careers?email=secret.person@example.test#9876543210',
                         'Evidence URL':'https://www.scribd.com/document/12345?token=private-token',
                         'Parsed Direct Email':'secret.person@example.test','Parsed Direct Phone':'9876543210'}])
    extract(source,target)
    output=target.read_text()
    for private in ['secret.person','9876543210','private-token']:
        assert private not in output
    row=next(csv.DictReader(target.open()))
    assert row['source_rows']=='ROW000001'
    assert row['candidate_career_url']=='https://acme.example/careers'
    assert row['review_status']=='UNVERIFIED'


def test_shared_contacts_do_not_merge_people_and_all_source_rows_survive(tmp_path):
    source=tmp_path/'input.csv'; target=tmp_path/'queue.csv'
    write_source(source,[{'Company Name':company,'Audit Row ID':f'R000{i}',
                         'Parsed Direct Email':'shared@example.test','Parsed Direct Phone':'9876543210'}
                        for i,company in enumerate(['Acme','ACME','Beta',''],1)])
    original=source.read_bytes(); assert extract(source,target)==3
    rows=list(csv.DictReader(target.open()))
    assert sum(int(row['source_count']) for row in rows)==4
    assert {ident for row in rows for ident in row['source_rows'].split(';')}=={'R0001','R0002','R0003','R0004'}
    assert all(row['review_status']=='UNVERIFIED' for row in rows)
    assert source.read_bytes()==original


def test_import_is_idempotent_and_validation_failure_preserves_previous_queue(tmp_path):
    source=tmp_path/'input.csv'; target=tmp_path/'queue.csv'
    write_source(source,[{'Company Name':'Acme','Audit Row ID':'R0001'}])
    extract(source,target); stamp=target.stat().st_mtime_ns; previous=target.read_bytes()
    extract(source,target); assert target.stat().st_mtime_ns==stamp
    write_source(source,[{'Company Name':'Acme','Audit Row ID':'R0001'},
                         {'Company Name':'Beta','Audit Row ID':'R0001'}])
    with pytest.raises(ValueError,match='Duplicate source row'):extract(source,target)
    assert target.read_bytes()==previous
    with pytest.raises(ValueError,match='overwrite'):extract(source,source)


def test_company_output_retains_all_sanitized_evidence_and_drops_subdomain_aggregators(tmp_path):
    source=tmp_path/'input.csv'; target=tmp_path/'queue.csv'
    write_source(source,[{'Company Name':'Acme','Audit Row ID':f'R000{i}',
                         'Official Career URL':url,'Verified Source URL':f'https://www.scribd.com/document/{i}'}
                        for i,url in enumerate(['https://acme.example/careers','https://acme.example/jobs',
                                               'https://www.scribd.com/fake','https://foo.linkedin.com/jobs'],1)])
    assert extract(source,target)==1
    row=next(csv.DictReader(target.open()))
    assert json.loads(row['candidate_career_urls'])==['https://acme.example/careers','https://acme.example/jobs']
    assert len(json.loads(row['evidence_urls']))==4
    assert len(row['source_dataset_sha256'])==64
