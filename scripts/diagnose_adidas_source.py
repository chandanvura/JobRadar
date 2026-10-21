"""Read-only, bounded diagnosis of official adidas careers endpoints.

Never treats an unreachable, partial or non-JSON response as an empty employer feed.
"""
from datetime import datetime, timezone
from urllib.parse import urlparse
import json
import httpx

ENDPOINTS = (
    "https://careers.adidas-group.com/",
    "https://careers.adidas-group.com/jobs/feed.xml",
    "https://careers.adidas-group.com/jobs?offset=0&locale=en&sort=title&location=%5B%5D",
    "https://jobs.adidas-group.com/search/",
)
ALLOWED_HOSTS = {"careers.adidas-group.com", "jobs.adidas-group.com"}

def main():
    print("UTC",datetime.now(timezone.utc).isoformat())
    with httpx.Client(timeout=httpx.Timeout(12,connect=6),follow_redirects=False) as client:
        for url in ENDPOINTS:
            if urlparse(url).hostname not in ALLOWED_HOSTS:
                raise ValueError('Only verified employer hosts may be probed')
            info={"url":url}
            try:
                with client.stream("GET",url,headers={"User-Agent":"JobRadar/1.2 (+source diagnostics)","Accept":"application/json,text/html,application/xml"}) as response:
                    info.update(status=response.status_code,content_type=response.headers.get("content-type",""),location=response.headers.get("location","")[:200])
                    # Intentionally sample at most 4 KiB and never ingest jobs.
                    buf=b""
                    for chunk in response.iter_bytes():
                        buf+=chunk[:4096-len(buf)]
                        if len(buf)>=4096:break
                    info["bytes_sampled"]=len(buf)
                    if "json" in info["content_type"].lower():
                        try:
                            payload=json.loads(buf)
                            info["json_keys"]=list(payload.keys())[:15] if isinstance(payload,dict) else []
                        except (ValueError,UnicodeDecodeError):
                            info["json_sample_incomplete"]=True
            except httpx.RequestError as exc:
                info["error_type"]=type(exc).__name__
            print(json.dumps(info,sort_keys=True))
    print("No source was activated. No D1 operations or production ingestion.")

if __name__=="__main__":
    main()
