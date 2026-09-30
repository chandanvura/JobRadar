"""Read public health using the same transport as deployment verification."""

import json
import shutil
import subprocess  # nosec B404 -- fixed public URL and arguments, no shell or credentials

HEALTH_URL = "https://jobradar.chandanvura.workers.dev/api/health"


def read_health():
    executable = shutil.which("curl")
    if not executable:
        raise RuntimeError("curl is required for the production health check")
    # Fixed public HTTPS URL; no shell, credentials, or caller-supplied arguments.
    try:
        result = subprocess.run(  # nosec B603
            [executable, "--silent", "--show-error", "--max-time", "15",
             "--write-out", "\n%{http_code}", HEALTH_URL],
            capture_output=True, text=True, timeout=20, check=True,
        )
    except (subprocess.SubprocessError, OSError):
        raise RuntimeError("Production health transport unavailable") from None
    body, status = result.stdout.rsplit("\n", 1)
    if status.strip() not in {"200", "503"}:
        raise RuntimeError(f"Production health failed (HTTP {status.strip()})")
    payload = json.loads(body)
    if not isinstance(payload, dict) or not isinstance(payload.get("ok"), bool):
        raise ValueError("Invalid production health response")
    return payload
