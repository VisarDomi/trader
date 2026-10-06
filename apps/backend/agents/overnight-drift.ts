import { defineAgent, localTime, TZ } from '../src/sdk';

/**
 * The overnight anomaly: historically most of the US equity premium arrives
 * between the close and the next open. Buy the index CFD at the 16:00 New York
 * close, sell at the 09:30 open. Pays one night of funding per trade, which
 * this test includes.
 */
export default defineAgent({
  name: 'Overnight Drift',
  description: 'Holds US indices from the cash close to the next cash open to capture the overnight premium.',
  author: 'claude',
  instruments: ['US100', 'US500', 'US30'],
  timeframe: '30m',
  params: { exposure: 1, crashStopPct: 3 },
  warmup: 2,
  onBar(ctx) {
    const { exposure, crashStopPct } = ctx.params;
    // ctx.time is the bar close: 16:00 means the 15:30-16:00 bar just closed.
    const ny = localTime(ctx.time, TZ.NEW_YORK);
    if (ny.weekday === 0 || ny.weekday === 6) return;
    const price = ctx.bar.close;

    if (ctx.position && ny.hour === 9 && ny.minute === 30) ctx.close('cash open');
    if (!ctx.position && ny.hour === 16 && ny.minute === 0 && ny.weekday !== 5) {
      ctx.buy({ exposure, stopLoss: price * (1 - crashStopPct / 100), reason: 'cash close' });
    }
  },
});
