"""Read Infosys Limited's public, unauthenticated India search feed."""
from urllib.parse import urlencode, urlparse


class InfosysCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import clean, client, likely_target, make_job, request
        from .models import JobBatch
        if urlparse(company.careers_url).hostname != 'career.infosys.com' or company.ats_identifier != 'infosys-india':
            raise ValueError('Invalid Infosys employer source')
        async with client(timeout=60) as x:
            response = await request(x, 'GET', 'https://career.infosys.com/assets/environments/environment.json')
            response.raise_for_status()
            base = response.json()['JobsUnAuthUrl']
            parsed = urlparse(base)
            if parsed.scheme != 'https' or parsed.hostname != 'intapgateway.infosysapps.com' or not parsed.path.endswith('/search/intapjbsrch/'):
                raise ValueError('Unexpected Infosys public search endpoint')
            response = await request(x, 'GET', base + 'getCareerSearchJobs',
                                     params={'sourceId': '1,21', 'searchText': 'ALL'})
            response.raise_for_status()
            rows = response.json()
        if not isinstance(rows, list):
            raise ValueError('Infosys search did not return its complete job array')
        jobs = []; seen = set(); missing = 0
        for row in rows:
            identifier = str(row.get('postingId') or '')
            if not identifier or identifier in seen:
                raise ValueError('Infosys feed repeated or omitted posting identifiers')
            seen.add(identifier)
            if row.get('company') != 'Infosys Limited' or row.get('country') != 'India' or row.get('sourceId') not in (1, 21):
                raise ValueError('Infosys search returned a different employer or country')
            title = clean(row.get('postingTitle', ''))
            location = clean(row.get('location', '')) + ', ' + row['country']
            if not likely_target(title, location):
                continue
            description = '\n'.join(clean(row.get(key, '')) for key in (
                'postingDescription', 'rolesResponsibilities', 'technicalRequirement',
                'additionalResponsibility', 'preferredSkills', 'educationalRequirement') if row.get(key))
            if not description or not row.get('referenceCode'):
                missing += 1
                continue
            minimum, maximum = row.get('minExperienceLevel'), row.get('maxExperienceLevel')
            if isinstance(minimum, (int, float)) and isinstance(maximum, (int, float)):
                description += f'\nRequired experience: {minimum:g}-{maximum:g} years.'
            url = 'https://career.infosys.com/jobdesc?' + urlencode({
                'jobReferenceCode': row['referenceCode'], 'sourceId': row['sourceId']})
            # createdOn is not a verified publication timestamp.
            jobs.append(make_job(identifier, title, company.name, location, description,
                                 'infosys', 'company_career', url, url, company.careers_url))
        warning = f'Limited coverage: {missing} relevant Infosys listings lack descriptions or detail references' if missing else None
        return JobBatch(jobs, warning), len(rows)
