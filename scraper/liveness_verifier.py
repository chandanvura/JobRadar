"""Proactively verify whether job application URLs are still active and accepting applications."""

import asyncio
import logging
from typing import Dict, List, Optional, Tuple
import httpx

logger = logging.getLogger("jobradar.verifier")

# Signatures indicating an expired or inactive job across ATS platforms
CLOSED_PATTERNS = [
    "job is no longer available",
    "this job has expired",
    "no longer accepting applications",
    "posting has been closed",
    "position has been filled",
    "requisition is closed",
    "this position is no longer open",
    "the role you are looking for is no longer available",
    "page not found",
    "404 not found",
    "jobDoesNotExist",
]


class LivenessResult:
    def __init__(self, job_id: str, url: str, is_active: bool, status_code: int, reason: str = ""):
        self.job_id = job_id
        self.url = url
        self.is_active = is_active
        self.status_code = status_code
        self.reason = reason

    def to_dict(self) -> Dict:
        return {
            "job_id": self.job_id,
            "url": self.url,
            "is_active": self.is_active,
            "status_code": self.status_code,
            "reason": self.reason,
        }


def is_content_closed(text: str) -> bool:
    """Check if the response body contains explicit job closed indicators."""
    lower_text = text.lower()
    for pattern in CLOSED_PATTERNS:
        if pattern in lower_text:
            return True
    return False


async def verify_single_url(
    client: httpx.AsyncClient,
    job_id: str,
    url: str,
    ats_provider: str = "",
    timeout_seconds: float = 8.0,
) -> LivenessResult:
    """
    Check if a job posting URL is active.
    First attempts a lightweight HEAD request. If ambiguous (or 405/403), follows with a shallow GET.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    try:
        # Try HEAD first to minimize bandwidth
        resp = await client.head(url, headers=headers, follow_redirects=True, timeout=timeout_seconds)

        # 404 or 410 permanently gone
        if resp.status_code in (404, 410):
            return LivenessResult(job_id, url, False, resp.status_code, "HTTP 404/410 Not Found")

        # Some ATS portals return 405 Method Not Allowed or 200 on soft 404 redirects
        if resp.status_code in (200, 301, 302, 405):
            # Check redirect target: if redirected back to careers home or generic search page, it's closed
            final_url = str(resp.url).rstrip("/")
            original_url = url.rstrip("/")
            if final_url != original_url:
                if any(x in final_url for x in ["/jobs", "/careers", "/search"]) and not any(
                    x in final_url for x in ["/job/", "/o/", "/requisition/"]
                ):
                    return LivenessResult(job_id, url, False, resp.status_code, "Redirected to careers home")

            # For 200 responses, read small snippet of body to detect soft 404 / closed notices
            get_resp = await client.get(url, headers=headers, follow_redirects=True, timeout=timeout_seconds)
            if get_resp.status_code in (404, 410):
                return LivenessResult(job_id, url, False, get_resp.status_code, "GET returned 404")

            # Check text indicators
            text_preview = get_resp.text[:15000]
            if is_content_closed(text_preview):
                return LivenessResult(job_id, url, False, get_resp.status_code, "Closed keyword detected in body")

            return LivenessResult(job_id, url, True, get_resp.status_code, "Active")

        return LivenessResult(job_id, url, True, resp.status_code, "HTTP Status Acceptable")

    except httpx.TimeoutException:
        # Avoid false positive expirations on transient network timeouts
        return LivenessResult(job_id, url, True, 408, "Check timed out; treated as temporarily active")
    except Exception as e:
        logger.warning(f"Error verifying {url}: {e}")
        return LivenessResult(job_id, url, True, 500, f"Error: {e}")


async def verify_batch_liveness(
    jobs: List[Dict],
    max_concurrency: int = 10,
    timeout_seconds: float = 8.0,
) -> List[LivenessResult]:
    """Verify a batch of jobs with controlled concurrency."""
    semaphore = asyncio.Semaphore(max_concurrency)

    async with httpx.AsyncClient(verify=True) as client:
        async def _bounded_check(j: Dict):
            async with semaphore:
                job_id = j.get("id", "")
                url = j.get("application_url") or j.get("career_page_url") or ""
                provider = j.get("ats_provider", "")
                if not url:
                    return LivenessResult(job_id, "", False, 400, "Missing URL")
                return await verify_single_url(client, job_id, url, provider, timeout_seconds)

        tasks = [_bounded_check(j) for j in jobs]
        return await asyncio.gather(*tasks)
