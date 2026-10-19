"""Privacy-safe, read-only recruiter company candidate extraction.

Never exports names, emails, phones, or automatically modifies the company registry.
Usage: python scripts/recruiter_company_candidates.py input.csv output.csv
"""
import argparse
import csv
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

COLUMNS = ("company_key", "company_name", "source_rows", "source_count",
           "candidate_career_url", "evidence_url", "review_status")
OUTPUT_COLUMNS = list(COLUMNS)
PUBLIC_HOSTS = {"scribd.com", "slideshare.net", "docs.google.com", "linkedin.com",
                "facebook.com", "indeed.com", "naukri.com", "glassdoor.com"}


def company_key(name):
    return re.sub(r"[^a-z0-9]+", " ", (name or "").casefold()).strip()


def valid_https(url):
    try:
        p = urlparse((url or "").strip())
        return p.scheme == "https" and bool(p.hostname) and not p.username and not p.password
    except ValueError:
        return False


def extract(input_path, output_path):
    grouped = defaultdict(list)
    with open(input_path, newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        if not reader.fieldnames or "Company Name" not in reader.fieldnames:
            raise ValueError("Missing required Company Name column")
        for index, record in enumerate(reader, 1):
            name = (record.get("Company Name") or "").strip()
            key = company_key(name)
            if not key:
                continue
            grouped[key].append((name, record.get("Audit Row ID") or str(index),
                                 (record.get("Official Career URL") or "").strip(),
                                 (record.get("Evidence URL") or "").strip()))
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as dest:
        writer = csv.DictWriter(dest, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        for key, rows in sorted(grouped.items()):
            # Evidence URLs are only retained when HTTPS; never infer verification.
            candidate = next((r[2] for r in rows if valid_https(r[2]) and
                             urlparse(r[2]).hostname.lower().removeprefix("www.") not in PUBLIC_HOSTS), "")
            evidence = next((r[3] for r in rows if valid_https(r[3])), "")
            writer.writerow(dict(company_key=key, company_name=rows[0][0],
                                 source_rows=";".join(r[1] for r in rows),
                                 source_count=len(rows), candidate_career_url=candidate,
                                 evidence_url=evidence, review_status="UNVERIFIED"))
    return len(grouped)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input_csv")
    parser.add_argument("output_csv")
    args = parser.parse_args()
    print(f"Exported {extract(args.input_csv, args.output_csv)} unverified company candidates")
