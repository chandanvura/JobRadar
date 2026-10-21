import pytest

from scraper.telegram_setup import private_start_chats, telegram_call


def test_setup_only_messages_private_chats_that_started_the_bot():
    updates={"result":[
        {"message":{"text":"/start","chat":{"type":"private","id":123}}},
        {"message":{"text":"/start jobradar","chat":{"type":"private","id":123}}},
        {"message":{"text":"hello","chat":{"type":"private","id":456}}},
        {"message":{"text":"/start","chat":{"type":"group","id":789}}},
        {"message":{"text":"/start","chat":{"type":"private","id":999}}},
    ]}
    assert private_start_chats(updates,bot_id=999)=={"123"}


def test_telegram_setup_rejects_non_telegram_urls():
    with pytest.raises(RuntimeError,match="not allowed"):
        telegram_call("file:///tmp","getMe")


@pytest.mark.parametrize('fault', ['network', 'invalid_json', 'invalid_success'])
def test_setup_faults_do_not_expose_token_urls(monkeypatch, fault):
    import io
    import urllib.error
    from contextlib import nullcontext
    from scraper import telegram_setup
    base = 'https://api.telegram.org/botfixture-token-never-real'
    def request(*args, **kwargs):
        if fault == 'network':
            raise urllib.error.URLError('request failed: ' + base)
        return nullcontext(io.BytesIO(b'private malformed response' if fault == 'invalid_json' else b'[]'))
    monkeypatch.setattr(telegram_setup.urllib.request, 'urlopen', request)
    with pytest.raises(RuntimeError) as error:
        telegram_call(base, 'getMe')
    assert 'fixture-token-never-real' not in str(error.value)
    assert 'private malformed response' not in str(error.value)
    assert error.value.__suppress_context__
