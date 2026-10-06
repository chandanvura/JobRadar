import asyncio
import httpx
import pytest
from scraper import adapters


@pytest.mark.parametrize('method,url',[
    ('GET','https://employer.example/jobs'),
    ('POST','https://ag.wd3.myworkdayjobs.com/wday/cxs/ag/Airbus/jobs'),
])
def test_transient_read_failures_retry_with_backoff_outside_limiter(monkeypatch,method,url):
    calls=[];delays=[]
    class Client:
        async def request(self,method,url,**kwargs):
            calls.append(kwargs)
            status=520 if len(calls)==1 else 200
            return httpx.Response(status,request=httpx.Request(method,url))
    async def sleep(delay):
        assert not adapters.domain_limiter(url).locked()
        delays.append(delay)
    monkeypatch.setattr(adapters.asyncio,'sleep',sleep)
    response=asyncio.run(adapters.request(Client(),method,url,json={'offset':20}))
    assert response.status_code==200 and calls==[{'json':{'offset':20}}]*2 and delays==[0.5]


@pytest.mark.parametrize('status',[403,429,404])
def test_access_and_rate_limit_responses_are_not_retried(status):
    calls=[]
    class Client:
        async def request(self,method,url,**kwargs):
            calls.append(url)
            return httpx.Response(status,request=httpx.Request(method,url))
    result=asyncio.run(adapters.request(Client(),'GET','https://employer.example/jobs'))
    assert result.status_code==status and len(calls)==1


def test_mutating_posts_are_never_replayed():
    calls=[]
    class Client:
        async def request(self,method,url,**kwargs):
            calls.append(url)
            raise httpx.ReadTimeout('timeout')
    with pytest.raises(httpx.ReadTimeout):
        asyncio.run(adapters.request(Client(),'POST','https://employer.example/apply'))
    assert len(calls)==1


def test_retry_exhaustion_returns_failure_and_is_bounded(monkeypatch):
    calls=[];delays=[]
    class Client:
        async def request(self,method,url,**kwargs):
            calls.append(url)
            return httpx.Response(503,request=httpx.Request(method,url))
    async def sleep(delay):delays.append(delay)
    monkeypatch.setattr(adapters.asyncio,'sleep',sleep)
    result=asyncio.run(adapters.request(Client(),'GET','https://employer.example/jobs'))
    assert result.status_code==503 and len(calls)==3 and delays==[0.5,1.0]


def test_read_transport_failure_recovers(monkeypatch):
    calls=[]
    class Client:
        async def request(self,method,url,**kwargs):
            calls.append(url)
            if len(calls)<3:raise httpx.ConnectError('transient')
            return httpx.Response(200,request=httpx.Request(method,url))
    async def sleep(delay):pass
    monkeypatch.setattr(adapters.asyncio,'sleep',sleep)
    assert asyncio.run(adapters.request(Client(),'GET','https://employer.example/jobs')).status_code==200
    assert len(calls)==3
