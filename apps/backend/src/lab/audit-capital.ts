/** Demo contract probe. Read-only by default; --orders tests minimum-size orders on Arena 01 only. */
import { CapitalClient, credentialsFromEnv, CapitalApiError } from '../capital/client.ts';
import { ALL_EPICS } from '../engine/instruments.ts';

const client = new CapitalClient(credentialsFromEnv());
const report: Record<string, unknown> = {
  at: new Date().toISOString(),
  source: 'https://open-api.capital.com/',
  markets: {},
  probes: [],
};
const markets = report.markets as Record<string, any>;
const probes = report.probes as any[];
const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const start = performance.now();
  try {
    const result = await fn();
    probes.push({
      label,
      ms: Math.round(performance.now() - start),
      outcome: 'ok',
    });
    return result;
  } catch (e) {
    probes.push({
      label,
      ms: Math.round(performance.now() - start),
      outcome: e instanceof CapitalApiError ? e.message : String(e),
    });
    throw e;
  }
};
await client.login();
const { accounts } = await client.get<{
  accounts: { accountId: string; accountName: string }[];
}>('/api/v1/accounts');
const target = accounts.find(a => a.accountName === 'Arena 01');
if (!target) throw new Error('Arena 01 is required; never use another account');
await client.selectAccount(target.accountId);
for (const epic of ALL_EPICS) {
  const m = await timed(`market ${epic}`, () => client.get<any>(`/api/v1/markets/${epic}`));
  markets[epic] = {
    instrument: m.instrument,
    dealingRules: m.dealingRules,
    snapshot: m.snapshot,
  };
}
if (process.argv.includes('--orders')) {
  const preferences = await client.get<{ hedgingMode: boolean }>('/api/v1/accounts/preferences');
  if (!preferences.hedgingMode) throw new Error('Probe needs existing hedging mode; will not change account settings');
  const epic = 'EURUSD';
  const size = markets[epic].dealingRules.minDealSize.value;
  const placed = new Set<string>();
  const before = await client.get<any>('/api/v1/positions');
  const known = new Set(before.positions.map((p: any) => p.position.dealId));
  try {
    for (const direction of ['BUY', 'SELL']) {
      const ref = await timed(`open ${direction}`, () => client.post<any>('/api/v1/positions', { epic, direction, size }));
      const conf = await timed(`confirm ${direction}`, () => client.get<any>(`/api/v1/confirms/${ref.dealReference}`));
      const positions = (await client.get<any>('/api/v1/positions')).positions;
      const confirmedIds = new Set([conf.dealId, ...(conf.affectedDeals ?? []).map((d: any) => d.dealId)]);
      const p = positions.find(
        (p: any) =>
          confirmedIds.has(p.position.dealId) &&
          !known.has(p.position.dealId) &&
          p.market.epic === epic &&
          p.position.direction === direction &&
          p.position.size === size,
      );
      if (!p) throw new Error('Probe position not found; inspect Arena 01 positions');
      placed.add(p.position.dealId);
      probes.push({
        label: `position ${direction}`,
        position: {
          size: p.position.size,
          level: p.position.level,
          leverage: p.position.leverage,
          margin: p.position.margin,
          upl: p.position.upl,
        },
        confirmation: {
          dealStatus: conf.dealStatus,
          level: conf.level,
          epic: conf.epic,
          direction: conf.direction,
        },
      });
      if (direction === 'BUY') {
        const stopLevel = Number((p.market.bid * 0.99).toFixed(5));
        const profitLevel = Number((p.market.offer * 1.01).toFixed(5));
        for (const [label, update] of [
          ['set protections', { stopLevel, profitLevel }],
          ['remove protections with null', { stopLevel: null, profitLevel: null }],
          ['remove protections with zero', { stopLevel: 0, profitLevel: 0 }],
          ['native trailing', { trailingStop: true, stopDistance: 0.001 }],
        ] as const) {
          try {
            await timed(label, () => client.put(`/api/v1/positions/${p.position.dealId}`, update));
            const actual = await client.get<any>(`/api/v1/positions/${p.position.dealId}`);
            probes.push({
              label: `${label} observed`,
              stopLevel: actual.position?.stopLevel ?? null,
              profitLevel: actual.position?.profitLevel ?? null,
              trailingStop: actual.position?.trailingStop ?? null,
            });
          } catch {
            /* Unsupported updates are useful contract observations. */
          }
        }
      }
      const close = await timed(`close ${direction}`, () => client.delete<any>(`/api/v1/positions/${p.position.dealId}`));
      const c = await timed(`confirm close ${direction}`, () => client.get<any>(`/api/v1/confirms/${close.dealReference}`));
      probes.push({
        label: `pnl ${direction}`,
        profit: c.profit,
        level: c.level,
      });
      const stillOpen = (await client.get<any>('/api/v1/positions')).positions.some((x: any) => x.position.dealId === p.position.dealId);
      if (stillOpen) throw new Error('Probe close not settled');
      placed.delete(p.position.dealId);
    }
    for (const [label, body] of [
      ['below minimum', { epic, direction: 'BUY', size: size / 2 }],
      ['invalid size increment', { epic, direction: 'BUY', size: size * 1.5 }],
      [
        'invalid stop',
        {
          epic,
          direction: 'BUY',
          size,
          stopLevel: markets[epic].snapshot.offer * 2,
        },
      ],
    ] as const) {
      try {
        const ref = await timed(label, () => client.post<any>('/api/v1/positions', body));
        const c = await client.get<any>(`/api/v1/confirms/${ref.dealReference}`);
        if (c.dealStatus === 'ACCEPTED') {
          for (const d of c.affectedDeals ?? []) if (!known.has(d.dealId)) placed.add(d.dealId);
          throw new Error(`${label} unexpectedly accepted; closing confirmed probe IDs`);
        }
      } catch {
        /* rejection is the expected observation */
      }
    }
  } finally {
    // Only IDs created by this probe; no pre-existing arena or user positions.
    const positions = (await client.get<any>('/api/v1/positions')).positions;
    for (const p of positions) {
      if (!known.has(p.position.dealId) && p.market.epic === epic && placed.has(p.position.dealId)) {
        await client.delete(`/api/v1/positions/${p.position.dealId}`);
      }
    }
  }
}
await Bun.write('data/capital-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ at: report.at, markets: ALL_EPICS.length, probes }, null, 2));
