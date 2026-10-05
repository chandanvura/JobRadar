"""Collect the published jobs and posting-date interface used by MyNextHire career pages."""
import base64
import json
import re
from urllib.parse import urlparse


class MyNextHireCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import clean, client, epoch_ms, location_text, make_job, request
        host=company.ats_identifier+'.mynexthire.com'
        if not re.fullmatch(r'[a-z0-9-]+',company.ats_identifier) or urlparse(company.careers_url).hostname!=host:
            raise ValueError('MyNextHire employer host does not match its registered source')
        base='https://'+host
        async with client(timeout=40) as x:
            response=await request(x,'POST',base+'/employer/careers/reqlist/get',json={'source':'careers','code':'','filterByBuId':-1})
            response.raise_for_status(); records=response.json().get('reqDetailsBOList')
            if not isinstance(records,list) or len(records)>2000:
                raise ValueError('MyNextHire returned an unexpected or unbounded public listing')
            identifiers=[r.get('reqId') for r in records]
            if any(not isinstance(i,int) or i<=0 for i in identifiers) or len(set(identifiers))!=len(identifiers):
                raise ValueError('MyNextHire returned missing or repeated requisition identifiers')
            response=await request(x,'POST',base+'/ats/public-apis/v1/careers/job-posting-dates/list',json={'srcShortName':'careers','requisitionIdList':identifiers})
            response.raise_for_status(); dates=response.json().get('data',{}).get('careersJobPostingDatesList')
            if not isinstance(dates,list): raise ValueError('MyNextHire public posting-date response is malformed')
            original={}
            for date in dates:
                identifier=date.get('requisitionId'); timestamp=date.get('publishedOn')
                if identifier in identifiers and isinstance(timestamp,(int,float)) and timestamp>0:
                    # Public history can include republications; use the earliest publication.
                    original[identifier]=min(original.get(identifier,timestamp),timestamp)
            jobs=[]
            for item in records:
                title=item.get('designation') or item.get('reqTitle'); description=clean(item.get('jdDisplay'))
                if not title or not description: raise ValueError('MyNextHire public job lacks a title or full description')
                context={'pageType':'jd','cvSource':'careers','reqId':item['reqId'],'requester':{'id':'','code':'','name':''},'page':'careers','bufilter':-1,'customFields':{}}
                encoded=base64.b64encode(json.dumps(context,separators=(',',':')).encode()).decode()
                # Match the career UI encoder; the fragment is public navigation, not authentication.
                url=base+'/employer/jobs/careers#?src%3Dcareers%26p%3D'+encoded
                jobs.append(make_job(str(item['reqId']),title,company.name,location_text(item.get('location'),item.get('locationAddress')),description,'mynexthire','company_career',url,url,company.careers_url,posting=epoch_ms(original.get(item['reqId']))))
        return jobs,len(records)
