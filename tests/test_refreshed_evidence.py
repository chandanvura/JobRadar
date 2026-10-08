from bs4 import BeautifulSoup
from scripts.refreshed_candidates import published_career_links


def test_official_links_include_embedded_navigation_and_exclude_unrelated_urls():
    html='<a href="/careers">Careers</a><script type="application/json">{"fields":{"name":"Careers","href":"https://careers.employer.test"},"unrelated":{"href":"https://employer.test.unrelated.test/jobs"},"plain_text":"https://guessed.employer.test/jobs"}</script>'
    result=published_career_links(BeautifulSoup(html,'html.parser'),'https://www.employer.test/','employer.test')
    assert result=={'https://www.employer.test/careers','https://careers.employer.test'}
def test_official_chain_prioritizes_exact_published_board_over_login_links(monkeypatch, tmp_path):
    import asyncio
    import httpx
    from scripts import refreshed_candidates
    root = 'https://employer.test/'
    board = 'https://jobs.employer.test/careers/SearchJobs'
    pages = {root: '<a href="https://jobs.employer.test/careers">Careers</a>',
             'https://jobs.employer.test/careers': '<a href="/Login">Careers login</a><a href="/AgentRegister">Careers registration</a><a href="/careers/SearchJobs">Find jobs</a>',
             board: '<title>Employer jobs</title>'}
    calls = []
    async def request(client, method, url):
        calls.append(url)
        assert url in pages, 'Unrelated account navigation must not outrank the published board'
        return httpx.Response(200, text=pages[url], request=httpx.Request(method, url))
    monkeypatch.setattr(refreshed_candidates, 'request', request)
    monkeypatch.setattr(refreshed_candidates, 'OUT', tmp_path)
    result = asyncio.run(refreshed_candidates.official_chain(None, 'Employer', root, board))
    assert result['verified'] and result['chain'] == calls
    assert calls == [root, 'https://jobs.employer.test/careers', board]
