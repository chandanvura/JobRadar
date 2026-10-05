"""Paginate employer-hosted TalentBrew HTML and read public JobPosting details."""
import asyncio
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup


class TalentBrewCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import cached_get, clean, client, jsonld_objects, likely_target, location_text, make_job, request
        host = urlparse(company.careers_url).hostname
        if urlparse(company.careers_url).scheme != 'https' or not company.ats_identifier.isdigit():
            raise ValueError('Invalid TalentBrew employer source')
        def official_url(base, value):
            url = urljoin(base, value); parsed = urlparse(url)
            if parsed.scheme != 'https' or parsed.hostname != host:
                raise ValueError('TalentBrew pagination and details must remain on the official career host')
            return url
        async with client(timeout=40) as x:
            url = company.careers_url; pages = set(); found = {}
            for _ in range(100):
                if url in pages: raise ValueError('TalentBrew pagination repeated a page')
                pages.add(url)
                response = await request(x, 'GET', url); response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser'); search = soup.select_one('#search-results')
                if not search or search.get('data-organization-ids') != company.ats_identifier:
                    raise ValueError('TalentBrew search does not match its registered employer')
                listing = soup.select_one('#search-results-list')
                if not listing: raise ValueError('TalentBrew search is missing its job listing')
                batch = listing.select('a[data-job-id][href]')
                if not batch and int(search.get('data-total-results', 0)):
                    raise ValueError('TalentBrew search omitted its reported job records')
                page_records = {}
                for link in batch:
                    identifier = link['data-job-id']
                    if identifier in found: raise ValueError('TalentBrew pagination repeated a job')
                    job_url = official_url(str(response.url), link['href'])
                    if identifier in page_records:
                        if page_records[identifier]['url'] != job_url:
                            raise ValueError('TalentBrew page repeats a job with conflicting URLs')
                        continue  # Title and "View role" links can share the same record.
                    row = link.find_parent('li') or link.find_parent(class_=re.compile('list-item|job-card')) or link.parent
                    title = link.select_one('h2,h3')
                    location = next((el for el in row.select('[class*="location"]') if el.get_text(' ', strip=True)), None)
                    page_records[identifier] = {'url': job_url,
                                         'title': title.get_text(' ', strip=True) if title else link.get_text(' ', strip=True),
                                         'location': location.get_text(' ', strip=True) if location else ''}
                found.update(page_records)
                if len(found) > 2000: raise ValueError('TalentBrew search exceeded the bounded scan')
                next_page = soup.select_one('.pagination a.next:not(.disabled)[href]')
                if not next_page:
                    if int(search.get('data-current-page', 1)) < int(search.get('data-total-pages', 1)):
                        raise ValueError('TalentBrew search omitted its next page')
                    break
                url = official_url(str(response.url), next_page['href'])
            else:
                raise ValueError('TalentBrew pagination exceeded the bounded scan')
            semaphore = asyncio.Semaphore(6)
            async def convert(identifier, item):
                if not likely_target(item['title'], item['location']): return None
                async with semaphore: response = await cached_get(x, item['url'])
                if response.status_code in (404, 410): return None
                response.raise_for_status(); soup = BeautifulSoup(response.text, 'html.parser')
                details = list(jsonld_objects(soup))
                job = details[0] if details else {}
                description = clean(job.get('description', ''))
                if not description:
                    full = soup.select_one('.ats-description,#job-description,[itemprop="description"]')
                    description = full.get_text(' ', strip=True) if full else ''
                if not description: raise ValueError('TalentBrew job detail is missing the full description')
                locations = job.get('jobLocation') or []
                if not isinstance(locations, list): locations = [locations]
                addresses = [entry.get('address', {}) for entry in locations if isinstance(entry, dict)]
                location = location_text([[address.get(key) for key in ('addressLocality', 'addressRegion', 'addressCountry')]
                                          for address in addresses if isinstance(address, dict)])
                posting = job.get('datePosted')
                # Some employers publish valid calendar dates without zero padding.
                if isinstance(posting, str) and re.fullmatch(r'\d{4}-\d{1,2}-\d{1,2}', posting):
                    y, m, d = map(int, posting.split('-')); posting = f'{y:04d}-{m:02d}-{d:02d}'
                return make_job(identifier, job.get('title') or item['title'], company.name,
                                location or item['location'], description, 'talentbrew', 'company_career',
                                item['url'], item['url'], company.careers_url, posting=posting)
            jobs = await asyncio.gather(*(convert(identifier, item) for identifier, item in found.items()))
        return [job for job in jobs if job], len(found)
