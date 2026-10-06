"""Bounded collection of public SAP Recruiting Marketing HTML search results."""
import asyncio
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup


def public_posting(value):
    """Convert an explicitly UTC employer timestamp; never infer a timezone."""
    if value and re.fullmatch(r'\w{3} \w{3} \d{2} \d{2}:\d{2}:\d{2} UTC \d{4}', value):
        return datetime.strptime(value, '%a %b %d %H:%M:%S UTC %Y').replace(tzinfo=timezone.utc).isoformat()
    return value


class SuccessFactorsCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import cached_get, clean, client, jsonld_objects, likely_role, likely_target, location_text, make_job, request
        from .models import JobBatch
        origin = urlparse(company.careers_url)
        prefix = company.ats_identifier
        if origin.scheme != 'https' or not re.fullmatch(r'[\w-]+', prefix) or not origin.path.startswith('/' + prefix + '/'):
            raise ValueError('Invalid SuccessFactors registered employer source')

        def official(base, value):
            url = urljoin(base, value)
            parsed = urlparse(url)
            if parsed.scheme != 'https' or parsed.hostname != origin.hostname or not parsed.path.startswith('/' + prefix + '/'):
                raise ValueError('SuccessFactors job or pagination links to another employer')
            return url

        async with client(timeout=40) as x:
            url = company.careers_url; found = {}; pages = set(); expected = None; first_ids = None
            for _ in range(100):
                if url in pages:
                    raise ValueError('SuccessFactors pagination repeated a page')
                pages.add(url)
                response = await request(x, 'GET', url)
                response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser')
                label = soup.select_one('.paginationLabel')
                match = re.search(r'Results\s+([\d,]+)\s*[–-]\s*([\d,]+)\s+of\s+([\d,]+)', label.get_text(' ', strip=True) if label else '')
                if not match:
                    raise ValueError('SuccessFactors search omitted its explicit results count')
                start, end, total = (int(v.replace(',', '')) for v in match.groups())
                if total > 2000 or (expected is not None and total != expected):
                    raise ValueError('SuccessFactors count changed or exceeded the bounded scan')
                expected = total
                rows = soup.select('tr.data-row')
                if total == 0:
                    if rows or start != 0 or end != 0:
                        raise ValueError('SuccessFactors empty search has inconsistent counts')
                    break
                if start != len(found) + 1 or end > total or len(rows) != end - start + 1:
                    raise ValueError('SuccessFactors pagination omitted or repeated result rows')
                page_ids = []
                for row in rows:
                    link = row.select_one('a.jobTitle-link[href]')
                    if not link:
                        raise ValueError('SuccessFactors listing omitted its public detail link')
                    job_url = official(str(response.url), link['href'])
                    identifier = re.search(r'/job/[^/]+/(\d+)/?$', urlparse(job_url).path)
                    if not identifier or identifier[1] in found:
                        raise ValueError('SuccessFactors listing omitted or repeated its job identifier')
                    location = row.select_one('.colLocation .jobLocation, .jobLocation')
                    page_ids.append(identifier[1])
                    found[identifier[1]] = (job_url, link.get_text(' ', strip=True), location.get_text(' ', strip=True) if location else '')
                if first_ids is None: first_ids = page_ids
                if end == total: break
                next_link = next((a for a in soup.select('.pagination a[href]')
                                  if urlparse(urljoin(url, a['href'])).path.rstrip('/').endswith('/' + str(end))), None)
                if not next_link:
                    raise ValueError('SuccessFactors search omitted its next page')
                url = official(url, next_link['href'])
            else:
                raise ValueError('SuccessFactors search exceeded the bounded page count')
            if len(found) != expected:
                raise ValueError('SuccessFactors listing did not match its complete count')
            if found:
                check = await request(x, 'GET', company.careers_url)
                check.raise_for_status()
                soup = BeautifulSoup(check.text, 'html.parser')
                label = soup.select_one('.paginationLabel')
                count = re.search(r'of\s+([\d,]+)', label.get_text(' ', strip=True) if label else '')
                ids = [re.search(r'/(\d+)/?$', urlparse(a['href']).path)[1]
                       for row in soup.select('tr.data-row')
                       for a in row.select('a.jobTitle-link[href]')[:1]
                       if re.search(r'/(\d+)/?$', urlparse(a['href']).path)]
                if not count or int(count[1].replace(',', '')) != expected or ids != first_ids:
                    raise ValueError('SuccessFactors first page changed during collection')
            semaphore = asyncio.Semaphore(6); missing = []

            async def convert(identifier, row):
                job_url, title, row_location = row
                # Multi-location summaries need their details even when the first
                # visible location is outside the target cities.
                if not likely_target(title, row_location) and not (re.search(r'\+\d+\s+more', row_location) and likely_role(title)):
                    return None
                async with semaphore: response = await cached_get(x, job_url)
                if response.status_code in (404, 410):
                    missing.append(identifier); return None
                response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser')
                job = next(jsonld_objects(soup), {})
                def micro(prop):
                    node = soup.select_one(f'[itemprop="{prop}"]')
                    return node.get('content') or node.get_text(' ', strip=True) if node else None
                detail_title = job.get('title') or micro('title')
                description = clean(job.get('description') or micro('description') or '')
                if not detail_title or not description:
                    missing.append(identifier); return None
                locations = job.get('jobLocation') or []
                if not isinstance(locations, list): locations = [locations]
                addresses = [entry.get('address', {}) for entry in locations if isinstance(entry, dict)]
                location = location_text([[a.get(k) for k in ('addressLocality', 'addressRegion', 'addressCountry', 'streetAddress')]
                                          for a in addresses if isinstance(a, dict)])
                if not location:
                    location = location_text([node.get('content') or node.get_text(' ', strip=True)
                                              for node in soup.select('[itemprop="jobLocation"] [itemprop="streetAddress"], [itemprop="jobLocation"] [itemprop="addressLocality"], [itemprop="jobLocation"] [itemprop="addressRegion"], [itemprop="jobLocation"] [itemprop="addressCountry"]')])
                if not location:
                    if re.search(r'\+\d+\s+more', row_location): missing.append(identifier); return None
                    location = row_location
                if not likely_target(detail_title, location): return None
                return make_job(identifier, detail_title, company.name, location, description,
                                'successfactors', 'company_career', job_url, job_url, company.careers_url,
                                posting=public_posting(job.get('datePosted') or micro('datePosted')))

            jobs = await asyncio.gather(*(convert(k, v) for k, v in found.items()))
        warning = f'Limited coverage: {len(missing)} relevant SuccessFactors details are missing or incomplete' if missing else None
        return JobBatch([job for job in jobs if job], warning), len(found)
