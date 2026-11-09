#!/usr/bin/env node
// The publisher invokes npm directly. Keep manual and automatic lab builds
// inside the same aggregate budget as trading, including reboot catch-up.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

let bounded = false;
if (process.platform === 'linux') {
  try { bounded = readFileSync('/proc/self/cgroup', 'utf8').includes('/trader.slice/'); } catch {}
}
const manager = !bounded && process.platform === 'linux'
  ? spawnSync('systemctl', ['--user', 'show', 'trader.slice', '--property=LoadState', '--value'], { encoding: 'utf8', timeout: 5000 })
  : null;
const joinBudget = manager?.status === 0 && manager.stdout.trim() === 'loaded';
const labConfigured = process.platform === 'linux' && existsSync(join(homedir(), '.config/systemd/user/trader.slice'));
if (labConfigured && !bounded && !joinBudget) {
  console.error('Trader build requires the configured trader.slice user manager.');
  process.exit(1);
}
const result = spawnSync(joinBudget ? 'systemd-run' : 'vite', joinBudget
  ? ['--user', '--scope', '--quiet', '--slice=trader.slice', '--property=CPUQuota=200%', '--property=MemoryMax=2G', '--', 'vite', 'build']
  : ['build'], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
