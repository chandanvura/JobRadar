"""Paginate iCIMS employer iframes and read JSON-LD job details."""
import asyncio
import re
from urllib.parse import urljoin, urlparse

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
            for pr in range(40):
                url = f"https://{host}/jobs/search?in_iframe=1&pr={pr}"
                response = await request(x, 'GET', url)
                response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser')
                
                rows = soup.select('.iCIMS_JobsTable .row')
                if not rows:
                    break
                total_jobs += len(rows)
                
                for row in rows:
                    link = row.select_one('.title a, h3 a, a.iCIMS_Anchor')
                    if not link:
                        continue
                    job_url = urljoin(url, link.get('href'))
                    if 'in_iframe' not in job_url:
                        job_url += '&in_iframe=1' if '?' in job_url else '?in_iframe=1'
                    
                    # Read basic location from the row to filter early
                    location = row.select_one('.header:-soup-contains("Location") + span, .additionalFields')
                    location_str = location.get_text(' ', strip=True) if location else ''
                    title_str = link.get_text(' ', strip=True)
                    
                    if likely_target(title_str, location_str):
                        urls.append((title_str, job_url))
                
                if len(rows) < 50:
                    break
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
