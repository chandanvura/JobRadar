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
    from scraper.main import load_companies
    enabled = sum(company.enabled for company in load_companies())
    assert f"{enabled} enabled" in result.stdout


def test_backup_must_restore_before_upload_and_monitor_cannot_push_main():
    root = Path(__file__).resolve().parents[1]
    backup = (root / '.github/workflows/backup-d1.yml').read_text()
    assert backup.index('python ../scripts/verify_d1_backup.py') < backup.index('gzip -9') < backup.index('actions/upload-artifact')
    for name in ['operational-health.yml']:
        workflow = (root / '.github/workflows' / name).read_text()
        assert 'contents: read' in workflow
        assert 'actions: read' in workflow
        assert 'git push' not in workflow
        assert 'python -m scraper.ops_check' in workflow
        assert 'if: always()' in workflow


def test_test_running_workflow_jobs_install_pytest_from_their_manifests():
    """Catch runtime/dev dependency drift in every job that invokes pytest."""
    import re
    root = Path(__file__).resolve().parents[1]
    def dependencies(path):
        names = set()
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if line.startswith('-r '):
                names.update(dependencies(path.parent / line[3:]))
            elif line and not line.startswith('#'):
                names.add(re.split(r'[=<>!~\[; ]', line)[0].lower())
        return names
    checked = []
    for workflow in (root / '.github/workflows').glob('*.yml'):
        for job in re.split(r'(?m)^  [\w-]+:\s*$', workflow.read_text())[1:]:
            if 'python -m pytest' not in job:
                continue
            manifests = re.findall(r'pip install -r ([\w./-]+)', job)
            installed = set().union(*(dependencies(root / manifest) for manifest in manifests))
            assert 'pytest' in installed, f'{workflow.name}: test job does not install pytest'
            checked.append(workflow.name)
    assert 'scrape.yml' in checked and 'deploy-cloudflare.yml' in checked
