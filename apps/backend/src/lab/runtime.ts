/** Trader's PC runtime; its ACTIVE marker keeps the tools off the stale Hetzner copy of the arena. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resourceHold } from '../engine/resource-hold.ts';

export const PC_SERVER_HOME = join(process.env.HOME ?? '/home/visar', '.local/share/hetzner-pc');
export const PC_SERVER_ACTIVE = existsSync(join(PC_SERVER_HOME, 'ACTIVE'));
/** The shared server's SSH target and its user's home stay out of git: apps/backend/.env (see .env.template). */
export const SERVER_SSH = process.env.TRADER_SERVER_SSH ?? '';
const SERVER_HOME = process.env.TRADER_SERVER_HOME ?? '';
/** The arena/UI runtime root: the PC mirror of the server user's home while ACTIVE, else that home. */
export const SERVER_RUNTIME_ROOT = PC_SERVER_ACTIVE ? join(PC_SERVER_HOME, 'mirror', SERVER_HOME) : SERVER_HOME;
/** Fails fast where a tool needs the runtime root and the .env lacks it. */
export function serverRuntimeRoot(): string {
  if (!SERVER_HOME) throw new Error('TRADER_SERVER_HOME is not set (apps/backend/.env, see .env.template)');
  return SERVER_RUNTIME_ROOT;
}
export const ARENA_UNIT = PC_SERVER_ACTIVE ? 'pc-server-trader-arena.service' : 'trader-arena.service';
export const UI_UNIT = 'pc-server-trader-ui.service';
export const FORECASTER_UNIT = 'trader-forecaster.service';
export const HEAVY_RESOURCE_PAUSE_FILE = join(process.env.HOME ?? '/home/visar', '.local/share/heavy-resources/user-pause.json');
export const resourcePaused=(unit:string)=>resourceHold(unit,HEAVY_RESOURCE_PAUSE_FILE)!==null;
export const LAB_HEALTH_UNITS = PC_SERVER_ACTIVE
  ? [ARENA_UNIT, UI_UNIT, FORECASTER_UNIT]
  : ['trader-tunnel.service', FORECASTER_UNIT];
