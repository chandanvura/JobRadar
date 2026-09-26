from scraper.telegram_setup import private_start_chats


def test_setup_only_messages_private_chats_that_started_the_bot():
    updates={"result":[
        {"message":{"text":"/start","chat":{"type":"private","id":123}}},
        {"message":{"text":"/start jobradar","chat":{"type":"private","id":123}}},
        {"message":{"text":"hello","chat":{"type":"private","id":456}}},
        {"message":{"text":"/start","chat":{"type":"group","id":789}}},
        {"message":{"text":"/start","chat":{"type":"private","id":999}}},
    ]}
    assert private_start_chats(updates,bot_id=999)=={"123"}
