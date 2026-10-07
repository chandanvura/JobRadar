from bs4 import BeautifulSoup
from scripts.refreshed_candidates import published_career_links


def test_official_links_include_embedded_navigation_and_exclude_unrelated_urls():
    html='<a href="/careers">Careers</a><script type="application/json">{"fields":{"name":"Careers","href":"https://careers.employer.test"},"unrelated":{"href":"https://employer.test.unrelated.test/jobs"},"plain_text":"https://guessed.employer.test/jobs"}</script>'
    result=published_career_links(BeautifulSoup(html,'html.parser'),'https://www.employer.test/','employer.test')
    assert result=={'https://www.employer.test/careers','https://careers.employer.test'}
