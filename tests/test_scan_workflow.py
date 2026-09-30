"""Execute the actual scan registry gate to catch workflow-only regressions."""
import subprocess
import sys
from pathlib import Path


def test_scan_workflow_registry_gate_runs_against_real_csv():
    root = Path(__file__).resolve().parents[1]
    workflow = (root / ".github/workflows/scrape.yml").read_text()
    section = workflow.split("- name: Verify source revision", 1)[1]
    script = section.split("python - <<'PY'\n", 1)[1].split("\n          PY", 1)[0]
    script = "\n".join(line[10:] for line in script.splitlines())
    result = subprocess.run(
        [sys.executable, "-c", script], cwd=root,
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "670 enabled" in result.stdout
