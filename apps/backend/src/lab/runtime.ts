/** Trader's relocated PC runtime; the migration marker prevents reviving the retired server writer. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const PC_SERVER_HOME = join(process.env.HOME ?? '/home/visar', '.local/share/hetzner-pc');
export const PC_SERVER_ACTIVE = existsSync(join(PC_SERVER_HOME, 'ACTIVE'));
export const SERVER_RUNTIME_ROOT = PC_SERVER_ACTIVE ? join(PC_SERVER_HOME, 'mirror/home/erdal') : '/home/erdal';
export const SERVER_SSH = 'erdal@157.90.28.14';
export const ARENA_UNIT = PC_SERVER_ACTIVE ? 'pc-server-trader-arena.service' : 'trader-arena.service';
export const UI_UNIT = 'pc-server-trader-ui.service';
export const FORECASTER_UNIT = 'trader-forecaster.service';
export const LAB_HEALTH_UNITS = PC_SERVER_ACTIVE
  ? [ARENA_UNIT, UI_UNIT, FORECASTER_UNIT]
  : ['trader-tunnel.service', FORECASTER_UNIT];
