#!/usr/bin/env bash
# Install / refresh the lab PC user services (forecaster, tunnel, nightly job, watchdog).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/../server/runtime.sh"
dest="$HOME/.config/systemd/user"
mkdir -p "$dest"
for f in trader.slice trader-forecaster.service trader-tunnel.service trader-lab.service trader-lab.timer trader-watchdog.service trader-watchdog.timer trader-tick-archive.service trader-tick-archive.timer; do
  install -m 0644 "$here/$f" "$dest/$f"
done
services=(trader-forecaster.service)
if "$TRADER_PC_ACTIVE"; then
  systemctl --user disable --now trader-tunnel.service
  mkdir -p "$dest/trader-tick-archive.service.d"
  install -m 0644 "$here/pc-server-tick-archive.conf" "$dest/trader-tick-archive.service.d/pc-server.conf"
  for unit in pc-server-trader-arena pc-server-trader-ui; do
    mkdir -p "$dest/$unit.service.d"
    install -m 0644 "$here/pc-server-trader.conf" "$dest/$unit.service.d/trader-slice.conf"
  done
  install -m 0644 "$here/trader-arena-performance.conf" "$dest/pc-server-trader-arena.service.d/performance.conf"
else
  services+=(trader-tunnel.service)
fi
systemctl --user daemon-reload
systemctl --user enable --now "${services[@]}" trader-lab.timer trader-watchdog.timer trader-tick-archive.timer
systemctl --user --no-pager status "${services[@]}" trader-lab.timer trader-watchdog.timer trader-tick-archive.timer | rg '●|Active:'
