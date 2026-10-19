# Recruiter evidence and release decisions

This document uses short, direct instructions aligned with the intent of ASD-STE100 (Simplified Technical English). It is not a certified ASD-STE100 compliance review.

## JEV decision record

**JEV** is a project-local decision rule: **Justification, Evidence, Verification**. This definition is specific to this project. Do not present it as an external standard.

For each proposed action, record:
- **Justification:** State the problem, expected benefit, and cost.
- **Evidence:** Record the official employer or ATS URL, observed facts, date checked, and uncertainty.
- **Verification:** State tests, acceptance criteria, rollback action, and observed result.

Do not approve an action if one field is missing.

## Company source review

1. Keep the original recruiter CSV in private storage.
2. Run the candidate extractor on the private CSV.
3. Treat all extracted rows as UNVERIFIED.
4. Open the employer's official website.
5. Find its careers link. Follow the link to the ATS.
6. Record the official domain and source evidence.
7. Compare the company against `companies/companies.csv`.
8. Add a source only after a human or independently auditable official-source review.
9. Do not use recruiter contact data to send messages without a separate approval.

## Job eligibility

1. Read the complete job description.
2. Check the official job URL and employer posting date.
3. Require an allowed location and role.
4. Require explicit experience evidence that fits the 0–3 YOE policy.
5. If the experience is unknown, do not alert.
6. Do not use recruiter directory confidence as proof of job eligibility.

## Release gate

- Run `python -m pytest -q tests/test_recruiter_company_candidates.py`.
- Run `python -m pytest -q`.
- Run `cd web && npm test`.
- Review the generated candidate CSV for contact leaks.
- Check that no code writes to D1 or sends Telegram alerts during candidate extraction.
- Review the diff. Keep the change in a draft PR until tests pass.
- Deploy only after the official source review and tests pass.

## Decision record for this change

- **Justification:** Prepare 1,200 recruiter records for company coverage review without exposing personal contacts.
- **Evidence:** Existing audited CSV and the JobRadar company registry. Recruiter identity and live hiring are not independently verified.
- **Verification:** Unit tests added. Test execution and live-source checks remain unconfirmed. No production merge is authorized.
