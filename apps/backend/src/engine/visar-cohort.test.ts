import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { loadAgents } from './loader';
import { familyOf, loadRoster, planRuns, rosterProblems } from './roster';
import { silentDaysFor } from './policy';
import { assess, VERDICT } from '@trader/shared';
import type { LeaderboardRow } from '@trader/shared/types';

test('twenty unified Visar Night runs pair US500 and US100 symmetrically with clean family grouping', async () => {
  const { agents, errors } = await loadAgents();
  expect(errors).toEqual([]);
  const roster = loadRoster();
  expect(rosterProblems(roster, agents)).toEqual([]);

  const plans = planRuns(agents, roster).runs.filter(p => p.agent.slug === 'visar-night' || p.agent.slug === 'visar-night-control');
  expect(plans).toHaveLength(20);
  expect(plans.filter(p => p.epic === 'US500')).toHaveLength(10);
  expect(plans.filter(p => p.epic === 'US100')).toHaveLength(10);
  expect(plans.filter(p => p.agent.slug === 'visar-night-control')).toHaveLength(4);

  // No fragmented legacy slugs remain active.
  expect(agents.some(a => a.slug === 'visar-night-trading' || a.slug === 'night-risk-twin' || /^visar-night-v[234]-/.test(a.slug))).toBe(false);

  for (const p of plans) {
    expect(Number(p.agent.params.lossPct)).toBeGreaterThan(0);
    expect(Number(p.agent.params.lossPct)).toBeLessThanOrEqual(50);
    expect(roster.demoAdmissions?.[`${p.agent.id}:${p.epic}@${p.leverage}`]?.codeHash).toBe(p.agent.codeHash);
  }

  // Active Visar Night runs use New York clocks; archived lab copies preserve their historical Tirana clocks.
  const root = import.meta.dir + '/../../agents/';
  expect(readFileSync(root + 'visar-night/reference.ts', 'utf8')).toContain('timeZone: TZ.NEW_YORK');
  const lab = readFileSync(root + '_retired/visar-night-lab-20261109/reference.ts', 'utf8');
  expect(lab).toContain('timeZone: TZ.TIRANA');

  // Every night rule (active or archived) is judged in one family; controls stay separate.
  for (const p of plans) {
    expect(familyOf(roster, p.agent.slug).id).toBe(p.agent.slug === 'visar-night-control' ? 'visar-night-control' : 'visar-night');
  }
  for (const slug of ['visar-night', 'visar-night-trading', 'visar-night-v3-us100', 'visar-night-v4-us500']) {
    expect(familyOf(roster, slug)).toEqual({ id: 'visar-night', name: 'Visar Night' });
  }
});

test('sparse experiments have enough observation time while errors and ordinary silence still retire', () => {
  const now = Date.UTC(2027, 2, 1);
  const row = { agentId: 'visar-night-lab/clean-50x', slug: 'visar-night-lab', status: 'active', startedAt: now - 90 * 86400000, metrics: { trades: 0, tStat: 0 } } as LeaderboardRow;
  expect(silentDaysFor(row.agentId)).toBe(365);
  expect(assess(row, now).verdict).toBe(VERDICT.EARLY);
  expect(assess({ ...row, agentId: 'other' }, now).verdict).toBe(VERDICT.RETIRE);
  expect(assess({ ...row, status: 'error' }, now).verdict).toBe(VERDICT.RETIRE);
  expect(assess({ ...row, startedAt: now - 366 * 86400000 }, now).verdict).toBe(VERDICT.RETIRE);
  expect(silentDaysFor('visar-night-lab/body-20x')).toBe(180);
  expect(silentDaysFor('visar-night-v2-us100/largest-gap')).toBe(180);
  expect(silentDaysFor('visar-night-v2-us100/frequent-core')).toBe(60);
  expect(silentDaysFor('visar-night-v3-us500/strong-day')).toBe(180);
  expect(silentDaysFor('visar-night/midday-20')).toBe(60);
});
