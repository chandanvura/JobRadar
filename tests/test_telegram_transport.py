"""No real Telegram requests: injected failures must be safe and recoverable."""
import asyncio
from datetime import datetime, timezone

import httpx
import pytest

from scraper import distributed, main, telegram_digest
from scraper.models import Job


def job(identifier='1'):
    return Job(identifier, 'Software Engineer', 'Example', 'Bengaluru',
               'Java; 0 to 2 years experience', 'fixture', 'company_career',
               'https://employer.test/job', 'https://employer.test/job',
               'https://employer.test', is_eligible=True, relevance_score=80)


def fake_client(monkeypatch, operation, fault):
    monkeypatch.setenv('TELEGRAM_BOT_TOKEN', 'fixture-token-never-real')
    monkeypatch.setenv('TELEGRAM_CHAT_ID', 'fixture-chat')
    monkeypatch.setattr(main, '_TELEGRAM_CHAT_OVERRIDE', None)

    class Client:
        def __init__(self, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def get(self, url, **kwargs):
            if operation == 'ready':
                return self.fail(url, 'GET')
            data = {'ok': True, 'result': {'id': 'bot' if url.endswith('getMe') else 'fixture-chat'}}
            if url.endswith('/api/health'):
                data = {'ok': True, 'latest_run': {}}
            return httpx.Response(200, json=data, request=httpx.Request('GET', url))
        async def post(self, url, **kwargs):
            return self.fail(url, 'POST')
        def fail(self, url, method):
            if fault == 'timeout':
                raise httpx.ReadTimeout('private request ' + url, request=httpx.Request(method, url))
            if fault == 'rejected_success':
                return httpx.Response(200, json={'ok': False}, request=httpx.Request(method, url))
            return httpx.Response(200, text='malformed response', request=httpx.Request(method, url))
    monkeypatch.setattr(main.httpx, 'AsyncClient', Client)


@pytest.mark.parametrize('operation', ['ready', 'send', 'digest'])
@pytest.mark.parametrize('fault', ['timeout', 'invalid_json', 'rejected_success'])
def test_telegram_faults_use_sanitized_delivery_errors(monkeypatch, operation, fault):
    fake_client(monkeypatch, operation, fault)
    call = main.ensure_telegram_ready() if operation == 'ready' else (
        main.notify(job(), 'fixture-chat') if operation == 'send' else telegram_digest.send_digest())
    with pytest.raises(main.TelegramDeliveryError) as error:
        asyncio.run(call)
    message = str(error.value)
    assert 'fixture-token-never-real' not in message
    assert 'fixture-chat' not in message
    assert 'https://' not in message
    assert error.value.__suppress_context__


def test_timeout_does_not_skip_later_alerts_and_failure_is_audited(monkeypatch):
    fake_client(monkeypatch, 'send', 'timeout')
    items = [job('1'), job('2')]
    stamp = datetime.now(timezone.utc).isoformat()
    monkeypatch.setenv('JOBRADAR_API_URL', 'https://example.test')
    monkeypatch.setenv('JOBRADAR_INGEST_SECRET', 'fixture-ingest')
    monkeypatch.setattr(distributed, 'load_companies', lambda: [])
    monkeypatch.setattr(distributed, 'load_artifacts', lambda _: [])
    monkeypatch.setattr(distributed, 'merge_artifacts', lambda *args: {
        'companies': [], 'jobs': [j.as_dict() for j in items], 'failures': 0,
        'started_at': stamp, 'finished_at': stamp, 'jobs_scanned': 2, 'raw_jobs': 2})
    async def ingest(*args):
        return {'notification_keys': [main.source_job_key(j) for j in items]}
    async def ready():
        return 'fixture-chat'
    recorded = []
    async def record(endpoint, headers, item, status, error=None):
        recorded.append((item.external_job_id, status, error))
    monkeypatch.setattr(distributed, 'ingest_scan', ingest)
    monkeypatch.setattr(distributed, 'ensure_telegram_ready', ready)
    monkeypatch.setattr(distributed, 'record_notification', record)
    with pytest.raises(main.TelegramDeliveryError, match='2 operation'):
        asyncio.run(distributed.finalize(['fixture']))
    assert [item[:2] for item in recorded] == [('1', 'failed'), ('2', 'failed')]
    assert all('fixture-token-never-real' not in item[2] for item in recorded)


def test_valid_telegram_success_and_api_rejection_remain_distinct():
    good = httpx.Response(200, json={'ok': True, 'result': {'message_id': 1}})
    assert main.telegram_raise_for_status(good, 'message delivery') is None
    bad = httpx.Response(403, json={'ok': False, 'description': 'bot was blocked'})
    with pytest.raises(main.TelegramDeliveryError, match='HTTP 403.*bot was blocked'):
        main.telegram_raise_for_status(bad, 'message delivery')
