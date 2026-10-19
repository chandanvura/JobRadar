import asyncio
from datetime import datetime, timezone, timedelta
from email.utils import format_datetime
import httpx
import pytest
from scraper import main
from scraper.models import Company


def response(raw=None):return httpx.Response(429,headers={} if raw is None else {'Retry-After':raw},request=httpx.Request('GET','https://example.test'))

@pytest.mark.parametrize('raw,expected',[('30',30),('0',0),('120',None),('nan',None),('inf',None),('-1',0),(None,5)])
def test_rate_limit_budget(raw,expected):assert main.source_retry_delay(response(raw),0)==expected

def test_http_date_cooldown_is_honored():
    delay=main.source_retry_delay(response(format_datetime(datetime.now(timezone.utc)+timedelta(seconds=30))),0)
    assert 28<=delay<=30


def test_whole_source_retry_waits_for_server_and_stops_on_long_cooldown(monkeypatch):
    calls=[];delays=[]
    class Source:
        async def fetch_jobs(self,company):
            calls.append(company.name)
            if len(calls)==1:response('17').raise_for_status()
            return [],0
    async def sleep(delay):delays.append(delay)
    monkeypatch.setitem(main.ADAPTERS,'fixture',Source());monkeypatch.setattr(main.asyncio,'sleep',sleep)
    assert asyncio.run(main.fetch_company_jobs(Company('Example','https://example.test','fixture','example')))==([],0)
    assert delays==[17]
    class Unavailable:
        async def fetch_jobs(self,company):calls.append(company.name);response('120').raise_for_status()
    calls.clear();delays.clear();monkeypatch.setitem(main.ADAPTERS,'fixture',Unavailable())
    with pytest.raises(httpx.HTTPStatusError):asyncio.run(main.fetch_company_jobs(Company('Example','https://example.test','fixture','example')))
    assert len(calls)==1 and delays==[]
