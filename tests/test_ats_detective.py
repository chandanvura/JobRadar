import pytest
from scripts.ats_detective import counts, public_links, validate_names


@pytest.mark.parametrize('names', [[], ['A'] * 51, ['A', 'A'], ['Unknown'], 'A'])
def test_batches_reject_unbounded_duplicate_or_unknown_sources(names):
    with pytest.raises(ValueError):
        validate_names(names, {'A': object()})


def test_live_counts_separate_partial_sources_and_errors():
    assert counts({'companies': [{'warning': 'Limited coverage: details missing'},
                                 {'warning': '404', 'error_count': 1},
                                 {'warning': 'No current openings returned'}]}) == dict(
        companies=3, limited=1, errors=1, server_time=None)
    with pytest.raises(ValueError):
        counts({'data_mode': 'backup', 'companies': []})


def test_discovery_preserves_link_evidence_without_exposing_inline_configuration():
    _, links, scripts = public_links('''<a href="/careers">Careers</a>
    <a href="https://user:password@example.test/jobs">Invalid</a>
    <script>window.config={secret:"never publish inline scripts"}</script>
    <script src="/careers.js"></script>''', 'https://example.test/')
    assert links == ['https://example.test/careers']
    assert scripts == ['https://example.test/careers.js']
