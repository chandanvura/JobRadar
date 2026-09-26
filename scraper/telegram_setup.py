"""Send a private setup message without revealing chat IDs in public logs."""

import json
import os
import urllib.error
import urllib.parse
import urllib.request


def telegram_call(base, method, fields=None):
    data=urllib.parse.urlencode(fields).encode() if fields is not None else None
    request=urllib.request.Request(f"{base}/{method}",data=data)
    try:
        with urllib.request.urlopen(request,timeout=20) as response:
            result=json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Telegram {method} failed (HTTP {exc.code})") from None
    if not result.get("ok"):
        raise RuntimeError(f"Telegram {method} failed")
    return result


def private_start_chats(updates, bot_id):
    chats=set()
    for update in updates.get("result",[]):
        message=update.get("message") or {}
        chat=message.get("chat") or {}
        if (chat.get("type")=="private" and chat.get("id") is not None
                and str(chat["id"])!=str(bot_id)
                and str(message.get("text","")).strip().split()[0:1]==["/start"]):
            chats.add(str(chat["id"]))
    return chats


def main():
    token=os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")
    base=f"https://api.telegram.org/bot{token}"
    bot_id=telegram_call(base,"getMe")["result"]["id"]
    chats=private_start_chats(telegram_call(base,"getUpdates",{"limit":100,"timeout":0}),bot_id)
    if not chats:
        raise RuntimeError("No recent private /start found. Send /start to your JobRadar bot, then rerun this workflow.")
    for chat in chats:
        telegram_call(base,"sendMessage",{"chat_id":chat,"text":(
            f"Your JobRadar Telegram chat ID is: {chat}\n\n"
            "Set this exact number as the GitHub Actions repository secret TELEGRAM_CHAT_ID. "
            "This is your private chat ID, not the bot ID. After saving, run the JobRadar hourly scan once."
        )})
    print(f"Sent private setup instructions to {len(chats)} chat(s). No chat IDs were logged.")


if __name__=="__main__":
    main()
