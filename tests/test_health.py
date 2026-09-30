import json
import subprocess

import pytest

from scraper import health, watchdog


def response(monkeypatch, payload, status):
    monkeypatch.setattr(health.shutil, "which", lambda name: "/usr/bin/curl")
    def run(command, **kwargs):
        assert command[-1] == health.HEALTH_URL
        assert kwargs["timeout"] == 20
        assert not kwargs.get("shell")
        return subprocess.CompletedProcess(command, 0, json.dumps(payload) + "\n" + status)
    monkeypatch.setattr(health.subprocess, "run", run)


@pytest.mark.parametrize("payload,status", [({"ok": True}, "200"), ({"ok": False, "quota_exhausted": True}, "503")])
def test_public_health_accepts_live_and_degraded_json(monkeypatch, payload, status):
    response(monkeypatch, payload, status)
    assert watchdog.request_json(health.HEALTH_URL) == payload


@pytest.mark.parametrize("payload,status,exception", [({"ok": False}, "403", RuntimeError), ([], "200", ValueError), ({}, "503", ValueError)])
def test_public_health_rejects_unexpected_status_and_shape(monkeypatch, payload, status, exception):
    response(monkeypatch, payload, status)
    with pytest.raises(exception):
        health.read_health()


def test_public_health_requires_available_transport(monkeypatch):
    monkeypatch.setattr(health.shutil, "which", lambda name: None)
    with pytest.raises(RuntimeError, match="curl"):
        health.read_health()


def test_watchdog_main_never_dispatches_on_quota(monkeypatch, capsys):
    response(monkeypatch, {"ok": False, "quota_exhausted": True, "retry_at": "2026-10-01T00:00:00Z"}, "503")
    monkeypatch.setenv("GITHUB_TOKEN", "local-test-only")
    monkeypatch.setenv("GITHUB_REPOSITORY", "owner/repo")
    original = watchdog.request_json
    def fetch(url, token=None, data=None):
        if url == health.HEALTH_URL:
            return original(url)
        assert data is None, "Quota outage must not dispatch a workflow"
        return {"workflow_runs": []}
    monkeypatch.setattr(watchdog, "request_json", fetch)
    watchdog.main()
    assert "no recovery dispatch" in capsys.readouterr().out
