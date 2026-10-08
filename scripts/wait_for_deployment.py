"""Sequence focused ingestion after a Worker deployment from the same revision."""
import json
import os
import re
import subprocess
import time
from urllib.request import Request, urlopen


def worker_changed(paths):
    return any(path.startswith('web/') or path == '.github/workflows/deploy-cloudflare.yml' for path in paths)


def deployment_runs(repository, revision):
    if not re.fullmatch(r'[\w.-]+/[\w.-]+', repository) or not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise ValueError('Invalid GitHub deployment revision')
    url = f'https://api.github.com/repos/{repository}/actions/workflows/deploy-cloudflare.yml/runs?head_sha={revision}&per_page=10'
    request = Request(url, headers={'Accept': 'application/vnd.github+json',
                                   'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'],
                                   'User-Agent': 'JobRadar deployment sequencing'})
    # Fixed HTTPS GitHub API origin; credentials never go to employer sites.
    with urlopen(request, timeout=20) as response:  # nosec B310
        return json.load(response)['workflow_runs']


def wait_for_deployment(repository, revision, fetch=deployment_runs, timeout=1200,
                        clock=time.monotonic, sleep=time.sleep):
    start = clock()
    while clock() - start < timeout:
        matches = [run for run in fetch(repository, revision) if run.get('head_sha') == revision]
        if matches:
            latest = max(matches, key=lambda run: run['id'])
            if latest.get('status') == 'completed':
                if latest.get('conclusion') != 'success':
                    raise RuntimeError(f"Worker deployment {latest['id']} did not succeed; defer ingestion")
                print(f"Worker deployment {latest['id']} succeeded before focused ingestion")
                return
        sleep(15)
    raise RuntimeError('Timed out waiting for this revision to deploy; defer ingestion')


def main():
    result = subprocess.run(['git', 'diff', '--name-only', 'HEAD^', 'HEAD'],
                            check=True, capture_output=True, text=True)
    if not worker_changed(result.stdout.splitlines()):
        print('This revision has no Worker changes; focused ingestion can proceed')
        return
    wait_for_deployment(os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA'])


if __name__ == '__main__':
    main()
