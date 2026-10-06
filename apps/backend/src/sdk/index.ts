/**
 * Agent SDK — the only module an agent file needs to import.
 *
 *   import { defineAgent } from '../src/sdk';
 *
 * See agents/GUIDE.md.
 */
import { INSTRUMENTS } from '../engine/instruments.ts';
import type { AgentDefinition } from './types.ts';
import { TIMEFRAMES } from './types.ts';

export * from './types.ts';
export { localTime, TZ, type LocalTime } from './time.ts';

export const AGENT_MARKER = Symbol.for('trader.agent');

export type DefinedAgent<P extends Record<string, unknown> = Record<string, unknown>, S = Record<string, unknown>> =
  AgentDefinition<P, S> & { [AGENT_MARKER]: true };

const MAX_FORECAST_HORIZON = 64;
const MIN_FORECAST_CONTEXT = 32;
const MAX_FORECAST_CONTEXT = 2048;
const VARIANT_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Declare a trading agent. Export the result as the file's default export. */
export function defineAgent<P extends Record<string, unknown>, S = Record<string, unknown>>(
  definition: AgentDefinition<P, S>,
): DefinedAgent<P, S> {
  const problems: string[] = [];
  if (!definition.name?.trim()) problems.push('name is required');
  if (!definition.description?.trim()) problems.push('description is required');
  if (!Array.isArray(definition.instruments) || definition.instruments.length === 0) {
    problems.push('instruments must list at least one epic');
  } else {
    for (const epic of definition.instruments) {
      if (!INSTRUMENTS[epic]) problems.push(`unknown instrument "${epic}" (known: ${Object.keys(INSTRUMENTS).join(', ')})`);
    }
  }
  if (!TIMEFRAMES.includes(definition.timeframe)) problems.push(`timeframe must be one of ${TIMEFRAMES.join(', ')}`);
  for (const tf of definition.extraTimeframes ?? []) {
    if (!TIMEFRAMES.includes(tf)) problems.push(`extraTimeframes: unknown timeframe "${tf}"`);
  }
  if (typeof definition.onBar !== 'function') problems.push('onBar(ctx) is required');
  if (definition.params === null || typeof definition.params !== 'object') problems.push('params must be an object (use {} for none)');
  for (const name of Object.keys(definition.variants ?? {})) {
    if (!VARIANT_NAME.test(name)) problems.push(`variant name "${name}" must be lowercase letters, digits and dashes`);
  }
  if (definition.forecast) {
    const { horizon, context = 512 } = definition.forecast;
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > MAX_FORECAST_HORIZON) {
      problems.push(`forecast.horizon must be an integer 1..${MAX_FORECAST_HORIZON}`);
    }
    if (!Number.isInteger(context) || context < MIN_FORECAST_CONTEXT || context > MAX_FORECAST_CONTEXT) {
      problems.push(`forecast.context must be an integer ${MIN_FORECAST_CONTEXT}..${MAX_FORECAST_CONTEXT}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`Invalid agent "${definition.name ?? '?'}":\n  - ${problems.join('\n  - ')}`);
  }
  return Object.assign(definition, { [AGENT_MARKER]: true as const });
}

export function isDefinedAgent(value: unknown): value is DefinedAgent {
  return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[AGENT_MARKER] === true;
}
