"""Save real coverage counts and selected-source statuses without mutation."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from scripts.ats_detective import ORIGIN, counts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    request = Request(ORIGIN + '/api/dashboard', headers={'User-Agent': 'JobRadar/1.2 (coverage verification)'})
    with urlopen(request, timeout=30) as response:  # nosec B310
        catalog = json.load(response)
    report = dict(checked_at=datetime.now(timezone.utc).isoformat(), counts=counts(catalog),
                  companies=catalog['companies'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2))
    print(json.dumps(dict(checked_at=report['checked_at'], counts=report['counts'])))


if __name__ == '__main__':
    main()
