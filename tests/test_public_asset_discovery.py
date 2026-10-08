import pytest
from bs4 import BeautifulSoup

from scripts.ats_deep import public_references


def test_literal_portal_fetch_does_not_follow_post_or_external_requests():
    soup = BeautifulSoup('''<script>
      fetch('/ats/documents/tenant/careerportal/published.html');
      fetch('/write', {method: 'POST'});
      fetch('https://external.example.com/collect');
      fetch(dynamicPath);
    </script>''', 'html.parser')
    links, _ = public_references(soup, 'https://employer.keka.com/careers')
    assert links == ['https://employer.keka.com/ats/documents/tenant/careerportal/published.html']


def test_module_preloads_are_evidence_even_without_script_tags():
    soup = BeautifulSoup('''<link rel="modulepreload" href="/core/jobs-123.js">
        <link rel="preload" as="script" href="/core/search-456.js">
        <link rel="preload" as="font" href="/font.woff2">
        <script src="/core/jobs-123.js"></script>''', 'html.parser')
    links, assets = public_references(soup, 'https://example.com/careers/jobs')
    assert links == []
    assert assets == ['https://example.com/core/jobs-123.js',
                      'https://example.com/core/search-456.js']


def test_html_base_controls_relative_assets_and_iframe_links():
    soup = BeautifulSoup('''<base href="https://example.com/careers/">
        <script src="search.js"></script><iframe src="jobs/intro"></iframe>
        <a href="../careers">Careers</a>''', 'html.parser')
    links, assets = public_references(soup, 'https://portal.example.com/wrapped/page')
    assert links == ['https://example.com/careers/jobs/intro',
                     'https://example.com/careers']
    assert assets == ['https://example.com/careers/search.js']


@pytest.mark.parametrize('base', ['', '<base href="../assets/">'])
def test_only_actual_references_are_returned(base):
    soup = BeautifulSoup(base + '<a href="jobs">Jobs</a>', 'html.parser')
    links, assets = public_references(soup, 'https://example.com/careers/index')
    assert assets == []
    assert links == [('https://example.com/assets/jobs' if base else
                      'https://example.com/careers/jobs')]
