import { defineAgent, localTime, TZ } from '../src/sdk';

/**
 * The Monday Asia open in crypto: Bitcoin has tended to rise from Sunday
 * evening, New York time, as Asian markets open for the week, through Monday
 * (Concretum, "Seasonality in Bitcoin intraday trend", 2018-2025). On our 2024-26
 * candles the Sunday 19:00 to Monday 19:00 New York window averaged +54 bp on
 * BTC (t 2.2) and +56 bp on ETH (t 1.6), the best of the seven weekday windows;
 * picked from seven, so it is a test, not a finding. One trade a week, held for
 * 24 hours, on the 1:1 account (no overnight fee).
 */
export default defineAgent({
  name: 'Crypto Sunday Asia',
  description: 'Long BTC and ETH from Sunday 19:00 to Monday 19:00 New York, as Asia opens the week; 1:1, fee-free.',
  author: 'claude',
  instruments: ['BTCUSD', 'ETHUSD'],
  timeframe: '1h',
  leverage: [1],
  params: { hour: 19, exposure: 0.9 },
  warmup: 2,
  onBar(ctx) {
    const { hour, exposure } = ctx.params;
    const ny = localTime(ctx.time, TZ.NEW_YORK); // the bar's close
    if (ny.hour !== hour || ny.minute !== 0) return;
    if (ny.weekday === 0 && !ctx.position) ctx.buy({ exposure, reason: 'Sunday evening: Asia opens the week' });
    else if (ny.weekday === 1 && ctx.position) ctx.close('Monday 19:00');
  },
});
