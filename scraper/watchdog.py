"""Recover from skipped GitHub schedule events without dispatching duplicate scans."""

import datetime
import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlparse


from scraper.health import HEALTH_URL, read_health
ACTIVE_STATUSES={"queued","in_progress","pending","requested","waiting"}


def request_json(url, token=None, data=None):
    parsed=urlparse(url)
    if parsed.scheme!="https" or parsed.hostname not in {"api.github.com","jobradar.chandanvura.workers.dev"}:
        raise RuntimeError("Watchdog URL is not allowed")
    if url==HEALTH_URL and token is None and data is None:
        return read_health()
    headers={"Accept":"application/vnd.github+json"} if token else {}
    if token:
        headers.update({"Authorization":f"Bearer {token}","X-GitHub-Api-Version":"2022-11-28"})
    request=urllib.request.Request(url,data=json.dumps(data).encode() if data is not None else None,headers=headers)
    try:
        # Only the two exact HTTPS hosts allowlisted above can reach this call.
        response=urllib.request.urlopen(request,timeout=20)  # nosec B310
    except urllib.error.HTTPError as exc:
        if url==HEALTH_URL and exc.code==503:
            response=exc
        else:
            raise RuntimeError(f"Watchdog request failed (HTTP {exc.code})") from None
    with response:
        return json.load(response) if response.status!=204 else None


def minutes_since_scan(health, now=None):
    run=health.get("latest_run") or {}
    finished=run.get("started_at") or run.get("finished_at")
    if not finished:
        return None
    try:
        value=datetime.datetime.fromisoformat(finished.replace("Z","+00:00"))
        current=now or datetime.datetime.now(datetime.timezone.utc)
        return (current-value).total_seconds()/60
    except (TypeError,ValueError):
        return None


def should_dispatch(health, runs, now=None):
    if health.get("quota_exhausted"):
        return False
    age=minutes_since_scan(health,now)
    active=any(run.get("status") in ACTIVE_STATUSES for run in runs)
    return (age is None or age>=150) and not active


def last_successful_finalization(runs, repository, token, fetch=request_json):
    """Use completed finalizers, not gate-only workflow successes, as evidence."""
    for run in runs:
        if run.get("conclusion")!="success":
            continue
        jobs=fetch(f"https://api.github.com/repos/{repository}/actions/runs/{run['id']}/jobs?per_page=30",token)
        for job in jobs.get("jobs",[]):
            if job.get("name")=="finalize" and job.get("conclusion")=="success":
                return {"latest_run":{"finished_at":job.get("completed_at")}}
    return {"latest_run":None}


def obsolete_scan_ids(health, runs, event, now=None):
    """Only a scheduler-fix push may retire old code blocking a queued replacement."""
    age=minutes_since_scan(health,now)
    if event!="push" or health.get("quota_exhausted") or age is None or age<150:
        return []
    queued={run.get("head_sha") for run in runs
            if run.get("status") in {"queued","pending","waiting"} and run.get("head_sha")}
    if not queued:
        return []
    current=now or datetime.datetime.now(datetime.timezone.utc)
    obsolete=[]
    for run in runs:
        if run.get("status")!="in_progress" or not run.get("head_sha") or run["head_sha"] in queued:
            continue
        try:
            started=datetime.datetime.fromisoformat(run["created_at"].replace("Z","+00:00"))
        except (KeyError,TypeError,ValueError):
            continue
        if (current-started).total_seconds()>=600:
            obsolete.append(run["id"])
    return obsolete


def main():
    token=os.environ["GITHUB_TOKEN"]
    repository=os.environ["GITHUB_REPOSITORY"]
    api=f"https://api.github.com/repos/{repository}/actions/workflows/scrape.yml"
    runs=request_json(api+"/runs?per_page=30",token).get("workflow_runs",[])
    if any(run.get("status") in ACTIVE_STATUSES for run in runs):
        if os.environ.get("GITHUB_EVENT_NAME")=="push":
            # The replacement is already queued under the same concurrency group.
            # Routine hourly recovery never cancels an active scan.
            try:
                health=request_json(HEALTH_URL)
                for run_id in obsolete_scan_ids(health,runs,"push"):
                    request_json(f"https://api.github.com/repos/{repository}/actions/runs/{run_id}/cancel",token,{})
                    print(f"Cancelled obsolete scan {run_id}; newer queued revision can proceed")
            except (RuntimeError,urllib.error.URLError,TimeoutError,ValueError) as exc:
                print(f"Could not retire obsolete scan ({type(exc).__name__}); queued replacement remains")
        print("Scan already queued/running")
        return
    try:
        health=request_json(HEALTH_URL)
    except (RuntimeError,urllib.error.URLError,TimeoutError,ValueError) as exc:
        print(f"Production health unavailable ({type(exc).__name__}); checking completed GitHub finalizers")
        health=last_successful_finalization(runs,repository,token)
    if health.get("quota_exhausted"):
        print("D1 daily quota exhausted; no recovery dispatch before",health.get("retry_at","next UTC reset"))
        return
    age=minutes_since_scan(health)
    print(f"Latest scan age: {age:.1f} minutes" if age is not None else "No valid completed scan timestamp")
    if should_dispatch(health,runs):
        request_json(api+"/dispatches",token,{"ref":"main"})
        print("Dispatched one recovery scan")
    else:
        print("Scan is fresh or already queued/running")


if __name__=="__main__":
    main()
