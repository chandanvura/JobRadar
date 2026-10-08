import pytest
from scripts.wait_for_deployment import worker_changed, wait_for_deployment


REVISION='a'*40


def test_only_worker_revisions_require_deployment():
    assert worker_changed(['web/worker/index.ts'])
    assert worker_changed(['.github/workflows/deploy-cloudflare.yml'])
    assert not worker_changed(['scraper/jibe.py','companies/ats-detective-repairs-01.json'])


def test_ingestion_waits_for_matching_deployment_and_ignores_older_revision():
    ticks=[0];calls=[]
    def fetch(repo,sha):
        calls.append((repo,sha))
        return [{'id':1,'head_sha':'b'*40,'status':'completed','conclusion':'success'},
                {'id':2,'head_sha':sha,'status':'in_progress' if len(calls)==1 else 'completed','conclusion':'success'}]
    def sleep(seconds):ticks[0]+=seconds
    wait_for_deployment('owner/repo',REVISION,fetch=fetch,clock=lambda:ticks[0],sleep=sleep)
    assert len(calls)==2 and ticks[0]==15


@pytest.mark.parametrize('conclusion',['failure','cancelled','timed_out','skipped'])
def test_unsuccessful_deployment_never_allows_ingestion(conclusion):
    with pytest.raises(RuntimeError,match='did not succeed'):
        wait_for_deployment('owner/repo',REVISION,fetch=lambda *_:[{'id':1,'head_sha':REVISION,'status':'completed','conclusion':conclusion}])


def test_missing_deployment_is_bounded_and_cannot_use_previous_success():
    ticks=[0]
    def sleep(seconds):ticks[0]+=seconds
    with pytest.raises(RuntimeError,match='Timed out'):
        wait_for_deployment('owner/repo',REVISION,fetch=lambda *_:[{'id':1,'head_sha':'b'*40,'status':'completed','conclusion':'success'}],
                            timeout=30,clock=lambda:ticks[0],sleep=sleep)
    assert ticks[0]==30
