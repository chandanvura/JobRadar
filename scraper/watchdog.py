"""Recover from skipped GitHub schedule events without dispatching duplicate scans."""

import datetime
import json
import os
import urllib.error
import urllib.request


HEALTH_URL="https://jobradar.chandanvura.workers.dev/api/health"
ACTIVE_STATUSES={"queued","in_progress","pending","requested","waiting"}


def request_json(url, token=None, data=None):
    headers={"Accept":"application/vnd.github+json"} if token else {}
    if token:
        headers.update({"Authorization":f"Bearer {token}","X-GitHub-Api-Version":"2022-11-28"})
    request=urllib.request.Request(url,data=json.dumps(data).encode() if data is not None else None,headers=headers)
    try:
        response=urllib.request.urlopen(request,timeout=20)
    except urllib.error.HTTPError as exc:
        if url==HEALTH_URL and exc.code==503:
            response=exc
        else:
            raise RuntimeError(f"Watchdog request failed (HTTP {exc.code})") from None
    with response:
        return json.load(response) if response.status!=204 else None


def minutes_since_scan(health, now=None):
    finished=(health.get("latest_run") or {}).get("finished_at")
    if not finished:
        return None
    try:
        value=datetime.datetime.fromisoformat(finished.replace("Z","+00:00"))
        current=now or datetime.datetime.now(datetime.timezone.utc)
        return (current-value).total_seconds()/60
    except (TypeError,ValueError):
        return None


def should_dispatch(health, runs, now=None):
    age=minutes_since_scan(health,now)
    active=any(run.get("status") in ACTIVE_STATUSES for run in runs)
    return (age is None or age>=75) and not active


def main():
    token=os.environ["GITHUB_TOKEN"]
    repository=os.environ["GITHUB_REPOSITORY"]
    api=f"https://api.github.com/repos/{repository}/actions/workflows/scrape.yml"
    health=request_json(HEALTH_URL)
    runs=request_json(api+"/runs?per_page=30",token).get("workflow_runs",[])
    age=minutes_since_scan(health)
    print(f"Latest scan age: {age:.1f} minutes" if age is not None else "No valid completed scan timestamp")
    if should_dispatch(health,runs):
        request_json(api+"/dispatches",token,{"ref":"main"})
        print("Dispatched one recovery scan")
    else:
        print("Scan is fresh or already queued/running")


if __name__=="__main__":
    main()
