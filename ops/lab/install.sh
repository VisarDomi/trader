#!/usr/bin/env bash
# Install / refresh the lab PC user services (forecaster, tunnel, nightly job).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dest="$HOME/.config/systemd/user"
mkdir -p "$dest"
for f in trader.slice trader-forecaster.service trader-tunnel.service trader-lab.service trader-lab.timer; do
  install -m 0644 "$here/$f" "$dest/$f"
done
systemctl --user daemon-reload
systemctl --user enable --now trader-forecaster.service trader-tunnel.service trader-lab.timer
systemctl --user --no-pager status trader-forecaster.service trader-tunnel.service trader-lab.timer | grep -E "●|Active:"
