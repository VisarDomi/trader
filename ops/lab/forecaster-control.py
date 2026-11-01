#!/usr/bin/env python3
"""Resume only TimesFM; the existing global stop still holds it across reboots."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import tempfile

UNIT = 'trader-forecaster.service'
HOLD = Path.home() / '.local/share/heavy-resources/user-pause.json'
ALL_SERVICES = ['video-pipeline.service', 'trader-lab.timer', 'trader-lab.service', UNIT]


def allowed(path=HOLD):
    if not path.exists():
        return True
    try:
        services = json.loads(path.read_text()).get('services')
        return isinstance(services, list) and all(isinstance(unit, str) for unit in services) and UNIT not in services
    except (OSError, ValueError, AttributeError):
        return False


def resume_hold(path=HOLD):
    if not path.exists():
        return
    hold = json.loads(path.read_text())
    services = hold.get('services', ALL_SERVICES)
    if not isinstance(services, list) or not all(isinstance(unit, str) for unit in services):
        raise ValueError('Invalid heavy-resource hold; refusing to replace it')
    hold['services'] = [unit for unit in services if unit != UNIT]
    hold.setdefault('resumed_services', {})[UNIT] = datetime.now(timezone.utc).isoformat()
    fd, temporary = tempfile.mkstemp(prefix='.timesfm-resume-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(hold, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        Path(temporary).unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['resume', 'check'])
    args = parser.parse_args()
    if args.action == 'check':
        raise SystemExit(0 if allowed() else 1)
    resume_hold()
    subprocess.run(['systemctl', '--user', 'enable', '--now', UNIT], check=True)
    print('TimesFM enabled. Other workload holds are unchanged.')
