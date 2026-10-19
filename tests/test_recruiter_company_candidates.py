import csv
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
    assert rows[1]["official_career_url"] == ""


def test_invalid_urls_rejected():
    assert not valid_https("javascript:alert(1)")
    assert not valid_https("http://example.com")
    assert not valid_https("https://user:password@example.com")
    assert valid_https("https://example.com/careers")
