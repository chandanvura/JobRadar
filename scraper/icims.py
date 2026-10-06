"""Paginate iCIMS employer iframes and read JSON-LD job details."""
import asyncio
import re
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup
class ICIMSCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import cached_get, clean, client, jsonld_objects, likely_target, location_text, make_job, request
        if urlparse(company.careers_url).scheme != 'https':
            raise ValueError('Invalid iCIMS employer source')
        host = urlparse(company.careers_url).hostname
        
        async with client(timeout=40) as x:
            urls = []
            total_jobs = 0
            seen_ids = set()
            for pr in range(40):
                url = f"https://{host}/jobs/search?in_iframe=1&pr={pr}"
                response = await request(x, 'GET', url)
                response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser')
                
                rows = soup.select('.iCIMS_JobsTable .row')
                if not rows:
                    raise ValueError('iCIMS search is missing its public listing rows')
                total_jobs += len(rows)
                
                for row in rows:
                    link = row.select_one('.title a, h3 a, a.iCIMS_Anchor')
                    if not link:
                        raise ValueError('iCIMS public listing omitted a job link')
                    job_url = urljoin(url, link.get('href'))
                    parsed = urlparse(job_url)
                    match = re.match(r'/jobs/(\d+)/', parsed.path)
                    if parsed.scheme != 'https' or parsed.hostname != host or not match:
                        raise ValueError('iCIMS listing links to an unexpected employer source')
                    if match[1] in seen_ids:
                        raise ValueError('iCIMS pagination repeated a job identifier')
                    seen_ids.add(match[1])
                    if 'in_iframe' not in job_url:
                        job_url += '&in_iframe=1' if '?' in job_url else '?in_iframe=1'
                    
                    # Read basic location from the row to filter early
                    location = row.select_one('.header:-soup-contains("Location") + span, .additionalFields')
                    location_str = location.get_text(' ', strip=True) if location else ''
                    title_str = link.get_text(' ', strip=True)
                    
                    if likely_target(title_str, location_str):
                        urls.append((title_str, job_url))
                
                # iCIMS page sizes vary. Only an explicit next-page control
                # establishes whether another page exists.
                next_link = next((a for a in soup.select('a[href]')
                                  if 'invisible' not in a.get('class', []) and
                                  (a.get('rel') == ['next'] or
                                   re.search(r'\bnext\b', a.get('title', '') + ' ' +
                                             a.get('aria-label', '') + ' ' + a.get_text(' ', strip=True), re.I))), None)
                if not next_link:
                    break
                next_url = urlparse(urljoin(url, next_link['href']))
                if next_url.hostname != host or parse_qs(next_url.query).get('pr') != [str(pr + 1)]:
                    raise ValueError('iCIMS next-page control has an unexpected offset or employer')
            else:
                raise ValueError('iCIMS search exceeded the bounded scan')
            
            # Remove duplicates just in case
            unique_urls = {u: t for t, u in urls}
            
            semaphore = asyncio.Semaphore(6)
            async def convert(job_url):
                async with semaphore: 
                    response = await cached_get(x, job_url)
                if response.status_code in (404, 410): return None
                response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser')
                
                details = list(jsonld_objects(soup))
                job = details[0] if details else {}
                
                description = clean(job.get('description', ''))
                if not description:
                    full = soup.select_one('.iCIMS_JobContent')
                    description = clean(full.get_text(' ', strip=True) if full else '')
                if not description: 
                    raise ValueError('iCIMS job detail is missing the full description')
                
                locations = job.get('jobLocation') or []
                if not isinstance(locations, list): locations = [locations]
                addresses = [entry.get('address', {}) for entry in locations if isinstance(entry, dict)]
                location = location_text([[address.get(key) for key in ('addressLocality', 'addressRegion', 'addressCountry')]
                                          for address in addresses if isinstance(address, dict)])
                
                posting = job.get('datePosted')
                identifier = job.get('identifier')
                external_id = str((identifier.get('value') if isinstance(identifier, dict) else identifier) or job_url)
                
                return make_job(external_id, job.get('title') or unique_urls[job_url], company.name,
                                location, description, 'icims', 'company_career',
                                job_url, job_url, company.careers_url, posting=posting)
                                
            jobs = await asyncio.gather(*(convert(u) for u in unique_urls.keys()))
            
        return [job for job in jobs if job], total_jobs
