# On-demand job search export

This optional read-only scanner reuses JobRadar's official employer adapters. It writes local JSON and CSV files and does not update the production database or send alerts.

```bash
python -m venv .venv
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m job_search.run --limit-sources 5
python -m job_search.run
```

Copy `job_search/profile.example.json` to `job_search/profile.json` and edit the ignored local copy for your search. You can also set `JOBRADAR_PROFILE` to a private JSON path. The configuration controls target locations, remote India, role groups, maximum required experience, desired skills and 24-hour/3-day/7-day freshness buckets. Unknown employer dates remain marked **Date unverified**. Skills improve ranking; a description with no matching keyword is still shown. Output is `job-search-results/jobs.json` and `jobs.csv`; set `--output` to change the directory. Individual blocked or broken sites appear in `source_errors` while other sources continue.

## LinkedIn and other user exports

The scanner accepts your own CSV with headers `job_url,title,company,location,description,posted_at,posted_label,application_url`. Only set `posted_at` when you have a verified ISO timestamp; leave it blank otherwise. Example:

```csv
job_url,title,company,location,description,posted_at,posted_label,application_url
https://example.com/job/123,Junior DevOps Engineer,Example,Bengaluru,AWS and Docker,,Today,https://example.com/apply/123
```

```bash
python -m job_search.run --import-csv my-jobs.csv
```

This does not automate a LinkedIn sign-in or bypass CAPTCHAs. Authentication, absent public feeds and changing site markup prevent guaranteed coverage for every source. Use official interfaces or permitted user exports for those sites. Do not commit personal exports or result files.
