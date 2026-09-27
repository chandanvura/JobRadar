"""Send one daily JobRadar scan summary to the configured private chat."""

import asyncio
import os

import httpx

from .main import TelegramDeliveryError, ensure_telegram_ready, telegram_raise_for_status


HEALTH_URL = "https://jobradar.chandanvura.workers.dev/api/health"
SITE_URL = "https://jobradar.chandanvura.workers.dev/"


def format_digest(health):
    run = health.get("latest_run") or {}
    if health.get("ok"):
        state = "Healthy"
    else:
        state = "Needs attention"
    checked = int(run.get("companies_checked") or 0)
    successful = int(run.get("companies_successful") or 0)
    candidates = int(run.get("candidate_jobs") or 0)
    return (
        f"JobRadar daily update: {state}\n\n"
        f"Sources checked: {successful}/{checked}\n"
        f"Current candidate jobs: {candidates}\n"
        f"Latest scan: {run.get('finished_at') or 'Unavailable'}\n\n"
        f"Browse jobs: {SITE_URL}\n"
        "New matching jobs are sent separately when found."
    )


async def send_digest():
    chat = await ensure_telegram_ready()
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(HEALTH_URL)
        if response.status_code not in (200, 503):
            raise TelegramDeliveryError(f"JobRadar health returned HTTP {response.status_code}")
        health = response.json()
        result = await client.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat, "text": format_digest(health), "disable_web_page_preview": True},
        )
        telegram_raise_for_status(result, "daily update")
    print("Daily JobRadar update delivered to the configured private chat.")


if __name__ == "__main__":
    asyncio.run(send_digest())
