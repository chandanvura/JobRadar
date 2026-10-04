"""Deterministic fault-injection harness; never contacts production."""
import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import httpx
import pytest

from scraper import distributed, main, scan_gate


@pytest.mark.parametrize('status,body,calls,error', [
    (503, {'quota_exhausted': True}, 1, main.QuotaDeferred),
    (503, {'error': 'temporary'}, 3, httpx.HTTPStatusError),
    (401, {}, 1, httpx.HTTPStatusError),
    (400, {}, 1, httpx.HTTPStatusError),
    (429, {}, 3, httpx.HTTPStatusError),
])
def test_retry_classification(monkeypatch, status, body, calls, error):
    seen = []
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            seen.append(url)
            return httpx.Response(status, json=body, request=httpx.Request('POST', url))
    async def sleep(seconds): pass
    monkeypatch.setattr(main.httpx, 'AsyncClient', Client)
    monkeypatch.setattr(main.asyncio, 'sleep', sleep)
    with pytest.raises(error):
        asyncio.run(main.post_with_retry('https://example.test/api/ingest', {}, {}))
    assert len(seen) == calls


@pytest.mark.parametrize('event', ['schedule', 'workflow_dispatch'])
@pytest.mark.parametrize('health', [{'ok': False}, {'ok': False, 'quota_exhausted': True}, {'ok': True, 'quota_exhausted': True}])
def test_unhealthy_gate_never_starts_expensive_scan(event, health):
    assert not scan_gate.should_scan(health, event)


def test_freshness_boundary_and_manual_refresh():
    now = datetime(2026, 10, 4, 4, tzinfo=timezone.utc)
    for stamp, expected in [('2026-10-04T00:30:00Z', True), ('2026-10-04T00:30:01Z', False)]:
        health = {'ok': True, 'latest_run': {'finished_at': stamp}}
        assert scan_gate.should_scan(health, 'schedule', now) is expected
        assert scan_gate.should_scan(health, 'workflow_dispatch', now)


def test_unreadable_health_gate_is_successful_deferral(monkeypatch, tmp_path, capsys):
    output = tmp_path / 'outputs'
    monkeypatch.setenv('GITHUB_OUTPUT', str(output))
    def fail(): raise ValueError('invalid JSON')
    monkeypatch.setattr(scan_gate, 'read_health', fail)
    scan_gate.main()
    assert output.read_text() == 'should_run=false\n'
    assert 'defer scan' in capsys.readouterr().out


def test_mid_scan_quota_never_notifies_or_claims_completed_scan(monkeypatch, tmp_path, capsys):
    stamp = datetime.now(timezone.utc).isoformat()
    summary = tmp_path / 'summary'
    monkeypatch.setenv('GITHUB_STEP_SUMMARY', str(summary))
    monkeypatch.setenv('JOBRADAR_API_URL', 'https://example.test')
    monkeypatch.setenv('JOBRADAR_INGEST_SECRET', 'test-only')
    monkeypatch.setattr(distributed, 'load_companies', lambda: [SimpleNamespace(enabled=True, ats_provider='greenhouse')])
    monkeypatch.setattr(distributed, 'load_artifacts', lambda paths: [])
    monkeypatch.setattr(distributed, 'merge_artifacts', lambda *args: {
        'companies': [], 'jobs': [], 'failures': 0,
        'started_at': stamp, 'finished_at': stamp, 'jobs_scanned': 0, 'raw_jobs': 0})
    async def ingest(*args): raise main.QuotaDeferred('quota')
    async def notify(*args): raise AssertionError('must not notify')
    monkeypatch.setattr(distributed, 'ingest_scan', ingest)
    monkeypatch.setattr(distributed, 'ensure_telegram_ready', notify)
    asyncio.run(distributed.finalize(['unused']))
    assert 'DEFERRED:' in summary.read_text()
    assert 'Distributed scan:' not in capsys.readouterr().out
