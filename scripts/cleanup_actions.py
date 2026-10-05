"""Remove disposable Actions storage in this repository; never delete backups."""
import json
import os
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def timestamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def stale_cache(cache, now, clear_all=False):
    if clear_all:
        return True
    if cache["key"].startswith("jobradar-details-"):
        return now - timestamp(cache["created_at"]) > 48 * 3600
    return now - timestamp(cache["last_accessed_at"]) > 7 * 86400


def disposable_artifact(artifact, now):
    return (
        artifact["name"].startswith("jobradar-shard-")
        and now - timestamp(artifact["created_at"]) > 48 * 3600
        and bool(artifact.get("workflow_run", {}).get("id"))
    )


def cleanup(api, now, clear_all=False):
    # Snapshot paginated lists before deleting so page offsets cannot skip entries.
    caches = api.list_items("actions/caches", "actions_caches")
    artifacts = api.list_items("actions/artifacts", "artifacts")
    totals = {"caches": 0, "artifacts": 0, "bytes": 0}
    for cache in caches:
        if stale_cache(cache, now, clear_all):
            if api.delete(f"actions/caches/{cache['id']}"):
                totals["caches"] += 1
                totals["bytes"] += cache.get("size_in_bytes", 0)
    runs = {}
    for artifact in artifacts:
        if not disposable_artifact(artifact, now):
            continue
        run_id = artifact["workflow_run"]["id"]
        if run_id not in runs:
            runs[run_id] = api.request(f"actions/runs/{run_id}")
        # Never remove input needed by an active or queued scan.
        if runs[run_id]["status"] != "completed":
            continue
        if api.delete(f"actions/artifacts/{artifact['id']}"):
            totals["artifacts"] += 1
            totals["bytes"] += artifact.get("size_in_bytes", 0)
    return totals


class GitHubAPI:
    def __init__(self, repository, token):
        self.base = f"https://api.github.com/repos/{repository}/"
        self.token = token

    def request(self, path, method="GET"):
        request = Request(self.base + path, method=method, headers={
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "JobRadar-storage-cleanup",
        })
        with urlopen(request, timeout=30) as response:  # nosec B310: fixed GitHub API origin
            body = response.read()
            return json.loads(body) if body else None

    def list_items(self, path, key):
        result = []
        page = 1
        while True:
            items = self.request(f"{path}?per_page=100&page={page}")[key]
            result.extend(items)
            if len(items) < 100:
                return result
            page += 1

    def delete(self, path):
        try:
            self.request(path, "DELETE")
            return True
        except HTTPError as error:
            if error.code == 404:  # concurrently expired or removed
                return False
            raise


if __name__ == "__main__":
    api = GitHubAPI(os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_TOKEN"])
    totals = cleanup(api, datetime.now(timezone.utc).timestamp(),
                     os.getenv("CLEAR_ALL_CACHES") == "true")
    message = (f"Removed {totals['caches']} caches and {totals['artifacts']} old scan artifacts; "
               f"freed {totals['bytes']:,} bytes. Database backups and workflow history preserved.")
    print(message)
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
            summary.write(message + "\n")
