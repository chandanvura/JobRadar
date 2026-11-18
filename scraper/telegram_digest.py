"""Send one daily JobRadar scan summary with freshest active jobs to the configured private chat."""

import asyncio
import os
from typing import Dict, List, Optional

from .main import TelegramDeliveryError, ensure_telegram_ready, telegram_raise_for_status, telegram_client


HEALTH_URL = "https://jobradar.chandanvura.workers.dev/api/health"
JOBS_URL = "https://jobradar.chandanvura.workers.dev/api/jobs?limit=5"
SITE_URL = "https://jobradar.chandanvura.workers.dev/"


def format_digest(health: Dict, top_jobs: Optional[List[Dict]] = None) -> str:
    run = health.get("latest_run") or {}
    if health.get("ok"):
        state = "Healthy"
    else:
        state = "Needs attention"
    checked = int(run.get("companies_checked") or 0)
    successful = int(run.get("companies_successful") or 0)
    candidates = int(run.get("candidate_jobs") or 0)

    lines = [
        f"🎯 JobRadar Daily Update: {state}",
        "",
        f"📊 Sources Checked: {successful}/{checked}",
        f"💼 Current 0-2 YOE Roles: {candidates}",
        f"🕒 Latest Scan: {run.get('finished_at') or 'Unavailable'}",
    ]

    if top_jobs and len(top_jobs) > 0:
        lines.append("")
        lines.append("⚡ Freshest Direct-Apply Roles:")
        for idx, j in enumerate(top_jobs[:5], 1):
            title = j.get("title", "Software Engineer")
            company = j.get("company", "Company")
            city = j.get("city") or j.get("location") or "Bengaluru/Hyderabad"
            url = j.get("application_url") or j.get("career_page_url") or SITE_URL
            lines.append(f"{idx}. {company} - {title} ({city})\n   👉 {url}")

    lines.append("")
    lines.append(f"🌐 Browse all verified jobs: {SITE_URL}")
    return "\n".join(lines)


async def send_digest():
    chat = await ensure_telegram_ready()
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    async with telegram_client() as client:
        # 1. Fetch health
        response = await client.get(HEALTH_URL)
        if response.status_code not in (200, 503):
            raise TelegramDeliveryError(f"JobRadar health returned HTTP {response.status_code}")
        health = response.json()

        # 2. Fetch top freshest jobs
        top_jobs = []
        try:
            jobs_resp = await client.get(JOBS_URL)
            if jobs_resp.status_code == 200:
                jobs_data = jobs_resp.json()
                if isinstance(jobs_data, dict) and "jobs" in jobs_data:
                    top_jobs = jobs_data["jobs"]
                elif isinstance(jobs_data, list):
                    top_jobs = jobs_data
        except Exception:
            # Fall back to health-only digest if jobs endpoint is slow
            pass

        # 3. Deliver digest
        text = format_digest(health, top_jobs)
        result = await client.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat, "text": text, "disable_web_page_preview": True},
        )
        telegram_raise_for_status(result, "daily update")
    print("Daily JobRadar update delivered to the configured private chat.")


if __name__ == "__main__":
    asyncio.run(send_digest())
