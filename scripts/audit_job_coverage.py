"""Read-only role/experience coverage census on employer feeds; never ingests or notifies."""
import ast
import asyncio
from collections import Counter
import json
import os
from pathlib import Path
import re
from scraper.main import load_companies, fetch_company_jobs
from scraper.normalization import TARGET_CITIES, enrich


def baseline_classifier(path):
    assignments = {}
    for node in ast.parse(Path(path).read_text()).body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            if node.targets[0].id in {'ROLE_PATTERNS', 'INTERNSHIP_ROLE_PATTERNS'}:
                assignments[node.targets[0].id] = ast.literal_eval(node.value)
    if 'ROLE_PATTERNS' not in assignments:
        raise ValueError('Baseline must contain the previous role patterns')
    def classify(title):
        clean = re.sub(r'[^a-z0-9+]+', ' ', title.lower()).strip()
        if re.search(r'\b(?:intern|internship|co op|apprentice|apprenticeship)\b', clean):
            if re.search(r'\b(?:non technical|nontechnical|talent acquisition|human resources|tax|marketing)\b', clean):
                return 'Other'
            for family, pattern in assignments.get('INTERNSHIP_ROLE_PATTERNS', {}).items():
                if re.search(pattern, clean, re.I):
                    return family
        return next((family for family, pattern in assignments['ROLE_PATTERNS'].items() if re.search(pattern, clean, re.I)), 'Other')
    return classify


async def main():
    names = json.loads(os.getenv('JOBRADAR_AUDIT_COMPANIES', '["HPE","IBM","Microsoft","Cisco","Accenture","SAP"]'))
    registry = {company.name: company for company in load_companies() if company.enabled}
    if not isinstance(names, list) or not 1 <= len(names) <= 20 or len(set(names)) != len(names) or set(names) - registry.keys():
        raise ValueError('Select 1–20 distinct enabled employers')
    baseline = baseline_classifier(os.environ['JOBRADAR_BASELINE_FILE'])
    root = Path('artifacts/job-coverage'); root.mkdir(parents=True, exist_ok=True)
    reports = []
    for name in names:
        company = registry[name]
        try:
            jobs, total = await fetch_company_jobs(company)
            enriched = [enrich(job, company.priority) for job in jobs]
            target = [job for job in enriched if job.city in TARGET_CITIES]
            recovered = [job for job in target if baseline(job.title) == 'Other' and job.role_category != 'Other']
            details = [{'id': job.external_job_id, 'title': job.title, 'city': job.city, 'category': job.role_category,
                        'experience_min': job.experience_min, 'experience_max': job.experience_max,
                        'experience_label': job.experience_label, 'eligible': job.is_eligible,
                        'reason': job.eligibility_reason, 'url': job.application_url,
                        'requirements': job.description[:20000]} for job in recovered]
            report = {'company': name, 'provider': company.ats_provider, 'identifier': company.ats_identifier,
                      'advertised_total': total, 'details_collected': len(jobs), 'warning': getattr(jobs, 'coverage_warning', None),
                      'target_city_details': len(target), 'previous_candidates': sum(baseline(job.title) != 'Other' for job in target),
                      'new_candidates': sum(job.role_category != 'Other' for job in target),
                      'recovered_count': len(recovered), 'recovered_0_to_3_or_unknown': sum(job.experience_min is None or job.experience_min <= 3 for job in recovered),
                      'reasons': dict(Counter(job.eligibility_reason for job in target)), 'recovered': details,
                      'unclassified_titles': dict(Counter(job.title for job in target if job.role_category == 'Other'))}
        except Exception as error:
            report = {'company': name, 'error': f'{type(error).__name__}: {error}'}
        reports.append(report)
        (root / (re.sub(r'[^a-z0-9]+', '-', name.lower()) + '.json')).write_text(json.dumps(report, indent=2))
        print(json.dumps({key: value for key, value in report.items() if key not in {'recovered','unclassified_titles'}}), flush=True)
    (root / 'summary.json').write_text(json.dumps(reports, indent=2))
    hpe = next((report for report in reports if report['company'] == 'HPE'), None)
    if hpe and (hpe.get('error') or not any('cloud developer' in job['title'].lower() for job in hpe['recovered'])):
        raise RuntimeError('HPE Cloud Developer recovery requires live evidence')


if __name__ == '__main__':
    asyncio.run(main())
