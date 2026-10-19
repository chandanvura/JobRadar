"""Posting proof policy: employer dates only, never discovery timestamps."""
import math
import re
from datetime import datetime, timezone, timedelta

INDIA_TZ = timezone(timedelta(hours=5, minutes=30))

def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
    except (AttributeError, TypeError, ValueError):
        return None

def posting_current(job, now=None):
    now = now or datetime.now(timezone.utc)
    posted = timestamp(job.posted_at)
    observed = timestamp(job.last_seen_at)
    if job.posted_at and (posted is None or posted > now):
        return False
    if job.reported_age_hours is not None:
        reported = job.reported_age_hours
        return isinstance(reported, (int, float)) and math.isfinite(reported) and reported >= 0 and observed is not None and observed <= now and reported + (now-observed).total_seconds()/3600 <= 24
    if posted:
        if job.posted_precision == 'day':
            return posted.astimezone(INDIA_TZ).date() == now.astimezone(INDIA_TZ).date()
        return (now-posted).total_seconds()/3600 <= 24
    return job.posted_precision == 'day' and bool(re.fullmatch(r'(?:posted\s+)?today', (job.posted_label or '').strip(), re.I)) and observed is not None and observed <= now and observed.astimezone(INDIA_TZ).date() == now.astimezone(INDIA_TZ).date()
