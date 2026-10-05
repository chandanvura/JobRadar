from datetime import datetime, timezone
from scripts.cleanup_actions import cleanup, stale_cache

NOW = datetime(2026, 10, 5, tzinfo=timezone.utc).timestamp()


def test_cache_age_uses_creation_for_details_and_access_for_dependencies():
    cache = {"key": "jobradar-details-linux-old", "created_at": "2026-10-01T00:00:00Z",
             "last_accessed_at": "2026-10-04T00:00:00Z"}
    assert stale_cache(cache, NOW)
    cache["key"] = "setup-python-pip"
    assert not stale_cache(cache, NOW)
    assert stale_cache(cache, NOW, clear_all=True)


def test_cleanup_preserves_backups_recent_shards_and_active_scan_inputs():
    class API:
        deleted = []

        def list_items(self, path, key):
            if key == "actions_caches":
                return [{"id": 1, "key": "pip", "created_at": "2026-09-01T00:00:00Z",
                         "last_accessed_at": "2026-09-01T00:00:00Z", "size_in_bytes": 100}]
            return [{"id": i, "name": name, "created_at": date,
                     "workflow_run": {"id": i}, "size_in_bytes": 20}
                    for i, name, date in [(2, "jobradar-d1-123", "2026-09-01T00:00:00Z"),
                                          (3, "jobradar-shard-0", "2026-10-04T00:00:00Z"),
                                          (4, "jobradar-shard-1", "2026-10-01T00:00:00Z"),
                                          (5, "jobradar-shard-2", "2026-10-01T00:00:00Z")]]

        def request(self, path):
            return {"status": "in_progress" if path.endswith("/4") else "completed"}

        def delete(self, path):
            self.deleted.append(path)
            return True

    api = API()
    assert cleanup(api, NOW) == {"caches": 1, "artifacts": 1, "bytes": 120}
    assert api.deleted == ["actions/caches/1", "actions/artifacts/5"]
