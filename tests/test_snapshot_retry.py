import asyncio
import pytest
from scraper import main
from scraper.models import Company
from scraper.snapshot import SnapshotChanged


@pytest.mark.parametrize('failures,expected', [(1, 2), (2, 2)])
def test_changed_snapshot_restarts_from_scratch_at_most_once(monkeypatch, failures, expected):
    calls = []
    class Source:
        async def fetch_jobs(self, company):
            calls.append(company.name)
            if len(calls) <= failures:
                raise SnapshotChanged('total changed')
            return [], 0
    async def sleep(seconds): pass
    monkeypatch.setitem(main.ADAPTERS, 'fixture', Source())
    monkeypatch.setattr(main.asyncio, 'sleep', sleep)
    company = Company('Example', 'https://example.test', 'fixture', 'example')
    if failures == 2:
        with pytest.raises(SnapshotChanged):
            asyncio.run(main.fetch_company_jobs(company))
    else:
        assert asyncio.run(main.fetch_company_jobs(company)) == ([], 0)
    assert len(calls) == expected


def test_invalid_feed_is_not_treated_as_changing_snapshot(monkeypatch):
    calls = []
    class Source:
        async def fetch_jobs(self, company):
            calls.append(company.name)
            raise ValueError('duplicate IDs or missing required fields')
    monkeypatch.setitem(main.ADAPTERS, 'fixture', Source())
    with pytest.raises(ValueError):
        asyncio.run(main.fetch_company_jobs(Company('Example', 'https://example.test', 'fixture', 'example')))
    assert len(calls) == 1
