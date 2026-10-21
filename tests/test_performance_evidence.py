"""Performance evidence must preserve success/failure behavior and avoid URLs."""
import asyncio
import json

import pytest
from scraper import main, distributed
from scraper.models import Company


@pytest.mark.parametrize('provider,failed,outcome',[('greenhouse',False,'success'),('greenhouse',True,'failed'),('custom',True,'limited')])
def test_source_phases_are_recorded_without_changing_failure_classification(monkeypatch,capsys,provider,failed,outcome):
    company=Company('Fixture','https://example.test/careers',provider,'fixture',3,True)
    ticks=iter([1,4] if failed else [1,4,6,7])
    monkeypatch.setattr(main,'perf_counter',lambda:next(ticks))
    async def fetch(_):
        if failed:raise ValueError('fixture failure')
        return [],0
    monkeypatch.setattr(main,'fetch_company_jobs',fetch)
    async def run():return await main.scrape(company,asyncio.Semaphore(1),asyncio.Semaphore(1))
    jobs,status,error,count=asyncio.run(run())
    assert jobs==[] and count==0
    assert bool(error)==(failed and provider!='custom')
    assert status['error_count']==int(failed and provider!='custom')
    report=json.loads(capsys.readouterr().out.splitlines()[-1])
    assert report=={'event':'source_timing','company':'Fixture','provider':provider,'outcome':outcome,
                    'fetch_wall_seconds':3,'enrich_wall_seconds':0 if failed else 2,'total_wall_seconds':3 if failed else 6}
    assert 'https://' not in json.dumps(report)


def test_worker_cpu_and_wall_evidence_survives_artifact_loading(monkeypatch,tmp_path):
    monkeypatch.setattr(distributed,'load_companies',lambda:[])
    wall=iter([10,30]);cpu=iter([5,8])
    monkeypatch.setattr(distributed,'perf_counter',lambda:next(wall))
    monkeypatch.setattr(distributed,'process_time',lambda:next(cpu))
    path=tmp_path/'shard.json'
    asyncio.run(distributed.run_worker(0,1,path))
    artifact=distributed.load_artifacts([path])[0]
    assert artifact['timing']=={'event':'worker_timing','shard_index':0,'discovery_wall_seconds':20,'process_cpu_seconds':3}
    assert distributed.merge_artifacts([artifact],expected_sources=0)['jobs']==[]
