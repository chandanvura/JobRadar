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
    # Match the legacy adapter's strict prerequisites without ingesting records.
    # Reading bounded HTML/XML samples avoids a 100-page live production scan.
    from bs4 import BeautifulSoup
    with httpx.Client(timeout=httpx.Timeout(12,connect=6),follow_redirects=False) as client:
        url="https://careers.adidas-group.com/"
        try:
            with client.stream("GET",url) as response:
                page=b""
                for chunk in response.iter_bytes():
                    page+=chunk[:100_000-len(page)]
                    if len(page)>=100_000:break
                soup=BeautifulSoup(page,"html.parser")
                hrefs={str(item.get("href","")) for item in soup.select("[href]")}
                print("Legacy adapter XML link published in sampled homepage:",
                      any("/jobs/feed.xml" in href for href in hrefs))
        except httpx.RequestError as exc:
            print("Homepage link check error:",type(exc).__name__)
        try:
            params=dict(brand="",team="",type="",keywords="",location="[]",sort="title",locale="en",offset=0)
            ajax=client.get("https://careers.adidas-group.com/jobs",params=params,
                            headers={"Accept":"application/json","X-Requested-With":"XMLHttpRequest"})
            payload=ajax.json() if "json" in ajax.headers.get("content-type","").lower() else None
            print("Legacy listing AJAX",
                  json.dumps({"status":ajax.status_code,"content_type":ajax.headers.get("content-type",""),
                              "keys":list(payload)[:12] if isinstance(payload,dict) else [],
                              "count_type":type(payload.get("count")).__name__ if isinstance(payload,dict) else None,
                              "jobs_type":type(payload.get("jobs")).__name__ if isinstance(payload,dict) else None}))
        except (httpx.RequestError,ValueError) as exc:
            print("Legacy AJAX check error:",type(exc).__name__)
    print("No source was activated. No D1 operations or production ingestion.")

if __name__=="__main__":
    main()
