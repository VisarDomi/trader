import { afterEach, expect, test } from 'bun:test';
import { LiveForecastProvider } from './forecast-client.ts';
import { BarSeries } from '../engine/series.ts';

let server: ReturnType<typeof Bun.serve> | null = null;
afterEach(() => server?.stop(true));

function series() {
  const s = new BarSeries('US100', '1d');
  for (let i = 0; i < 40; i++) s.push({ time: i * 86_400_000, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, spread: 0.1, volume: 1 });
  return s;
}

test('a forecast request dropped by the connection is retried once', async () => {
  let calls = 0;
  server = Bun.serve({
    port: 0,
    fetch(req) {
      calls++;
      if (calls === 1) return new Promise<Response>(() => req.signal.addEventListener('abort', () => {}));
      const horizon = 64;
      return Response.json({ model: 'm', mean: [Array(horizon).fill(1)], quantiles: [Array(9).fill(Array(horizon).fill(1))] });
    },
  });
  const provider = new LiveForecastProvider(`http://127.0.0.1:${server.port}`, 200);
  const s = series();
  const bar = s.last!;
  await provider.prepare([{ series: s, spec: { horizon: 8 }, bar }]);
  expect(calls).toBe(2);
  expect(provider.failures).toBe(0);
  expect(provider.get(s, { horizon: 8 }, bar)?.horizon).toBe(8);
});

test('a forecaster error answer is not retried', async () => {
  let calls = 0;
  server = Bun.serve({ port: 0, fetch: () => (calls++, new Response('bad', { status: 400 })) });
  const provider = new LiveForecastProvider(`http://127.0.0.1:${server.port}`, 200);
  const s = series();
  await provider.prepare([{ series: s, spec: { horizon: 8 }, bar: s.last! }]);
  expect(calls).toBe(1);
  expect(provider.failures).toBe(1);
});
