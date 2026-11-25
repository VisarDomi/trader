/**
 * Portfolios judged as one record (EVIDENCE.md "The arena portfolio").
 *
 * A portfolio is a rule fixed in advance in agents/roster.json: every running strategy record whose same-code
 * backtest has a Sharpe ratio at or above the rule's threshold, held at equal risk. The Sharpe ratio is that of the
 * returns themselves, before T-bills, like the backtest gate's and like the daily clock that judges the portfolio. Members are picked from
 * backtests alone, never from forward results, when the portfolio starts and again in each new UTC month. Each
 * pick is stored, so a later backtest or retirement cannot rewrite which records the portfolio held on a past day.
 *
 * It is one claim, declared before the days that judge it, so it is confirmed at the always-valid bar for one
 * record on its own (counted over the portfolios declared) instead of the bar for every record tried. Its breadth
 * is what makes it answer sooner than any member: a group's Sharpe ratio grows with the independent bets in it.
 */
import type { PortfolioMember, PortfolioView } from '@trader/shared/types';
import type { ArenaDB } from './db.ts';
import { RUN_KIND } from './db.ts';
import { RUN_STATUS } from '../engine/run.ts';
import { DAY_MS } from '../engine/clock.ts';
import { CONTROL_SLUGS, LIFECYCLE } from '../engine/policy.ts';
import type { PortfolioRule } from '../engine/roster.ts';
import { isShadow } from './pipeline.ts';
import { agreementZ, eValue, judgedT, statsOf, tAt, type DailyStats, type Judging } from './judging.ts';

export interface PortfolioPick { at: number; members: { id: string; scale: number }[] }
/** `since`: when the rule's first pick was made; its record is the weekdays closed after it. */
export interface PortfolioState { since: number; picks: PortfolioPick[] }
export interface PortfolioSeries { closes: number[]; returns: number[]; stats: DailyStats }
type Weighed = { closes: ArrayLike<number>; returns: ArrayLike<number>; scale: number };

const WEEKDAYS_PER_YEAR = 252;
const settingKey = (id: string) => `portfolio.${id}`;
const month = (t: number) => new Date(t).toISOString().slice(0, 7);

/**
 * Each weekday's return of capital split between the members in proportion to `scale`, over the members that have
 * that day, for the closes in (after, through].
 */
export function weigh(members: readonly Weighed[], after = -Infinity, through = Infinity): { closes: number[]; returns: number[] } {
  const days = new Map<number, { sum: number; weight: number }>();
  for (const m of members) {
    for (let i = 0; i < m.closes.length; i++) {
      const close = m.closes[i]!;
      if (close <= after || close > through) continue;
      const day = days.get(close);
      if (day) { day.sum += m.returns[i]! * m.scale; day.weight += m.scale; } else days.set(close, { sum: m.returns[i]! * m.scale, weight: m.scale });
    }
  }
  const closes = [...days.keys()].sort((a, b) => a - b);
  return { closes, returns: closes.map(c => days.get(c)!.sum / days.get(c)!.weight) };
}

/**
 * Calendar days from the first pick until a record that holds a Sharpe ratio of `sharpe` a year is expected at
 * the e-value `bar`, never before the day floor. Null without an edge or beyond fifty years.
 */
export function daysToBar(sharpe: number | null, bar: number): number | null {
  if (sharpe === null || !(sharpe > 0)) return null;
  const expected = (n: number) => eValue(sharpe * Math.sqrt(n / WEEKDAYS_PER_YEAR), n);
  let low = 2, high = WEEKDAYS_PER_YEAR * 50;
  if (expected(high) < bar) return null;
  while (high - low > 1) { const mid = (low + high) >> 1; if (expected(mid) >= bar) high = mid; else low = mid; }
  return Math.max(LIFECYCLE.MIN_DAYS, Math.ceil((high * 7) / 5));
}

export class Portfolios {
  /** The latest pick's backtests at its weights: kept while the pick and its members' backtests stand. */
  private pasts = new Map<string, { key: string; stats: DailyStats | null }>();
  constructor(private readonly db: ArenaDB, private readonly judging: Judging, private readonly rules: () => Record<string, PortfolioRule>) {}

  state(id: string): PortfolioState | null {
    return this.db.getSetting<PortfolioState | null>(settingKey(id), null);
  }

  /** Running strategy records the rule would hold now: backtest Sharpe at or above its threshold, each at 1 / its backtest's volatility. */
  eligible(rule: PortfolioRule, now: number): PortfolioPick['members'] {
    const slugs = new Map(this.db.agents().map(a => [a.id, a.slug]));
    const members: PortfolioPick['members'] = [];
    for (const run of this.db.listRuns(RUN_KIND.DEMO, false)) {
      if (run.status !== RUN_STATUS.RUNNING || isShadow(run.id) || CONTROL_SLUGS.has(slugs.get(run.agent_id) ?? run.agent_id)) continue;
      const backtest = this.judging.backtestFor(run, now);
      if (backtest && backtest.daily.sd > 0 && backtest.rawSharpe >= rule.minBacktestSharpe) members.push({ id: run.id, scale: 1 / backtest.daily.sd });
    }
    return members.sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  /** Picks members for a portfolio that has no pick, and again in each new UTC month. An empty pick is tried again next time. */
  repick(now: number): void {
    for (const [id, rule] of Object.entries(this.rules())) {
      const state = this.state(id) ?? { since: now, picks: [] }, last = state.picks.at(-1);
      if (last && month(last.at) === month(now)) continue;
      const members = this.eligible(rule, now);
      if (!members.length) continue;
      if (!state.picks.length) state.since = now;
      state.picks.push({ at: now, members });
      this.db.setSetting(settingKey(id), state);
      this.db.event('info', 'portfolio', `${rule.name}: picked ${members.length} records with a backtest Sharpe before T-bills of ${rule.minBacktestSharpe} or more`);
    }
  }

  /** The portfolio's weekday returns since its first pick: each pick holds from the first close after it to the next pick. */
  series(id: string, now: number): PortfolioSeries {
    const picks = this.state(id)?.picks ?? [], closes: number[] = [], returns: number[] = [];
    for (const [i, pick] of picks.entries()) {
      const held = weigh(pick.members.flatMap(m => this.forward(m, now)), pick.at, picks[i + 1]?.at ?? Infinity);
      closes.push(...held.closes); returns.push(...held.returns);
    }
    return { closes, returns, stats: statsOf(returns) };
  }

  private forward(m: { id: string; scale: number }, now: number): Weighed[] {
    const run = this.db.run(m.id);
    if (!run) return [];
    const s = this.judging.forwardSeries(run, run.started_at, run.retired ? run.ended_at ?? run.updated_at : now);
    return [{ closes: s.closes, returns: s.returns, scale: m.scale }];
  }

  /**
   * The latest pick's weights over its members' backtests: the floor under the portfolio's volatility and the
   * return the pick was chosen for.
   */
  backtest(id: string, now: number): DailyStats | null {
    const pick = this.state(id)?.picks.at(-1);
    if (!pick) return null;
    const histories = pick.members.map(m => { const run = this.db.run(m.id); return run ? this.judging.backtestFor(run, now) : null; });
    const key = `${pick.at}|${histories.reduce((n, h) => n + (h?.at ?? 0), 0)}`, kept = this.pasts.get(id);
    if (kept?.key === key) return kept.stats;
    const held = weigh(pick.members.flatMap((m, i) => (histories[i] ? [{ closes: histories[i]!.closes, returns: histories[i]!.returns, scale: m.scale }] : [])));
    const stats = held.returns.length ? statsOf(held.returns) : null;
    this.pasts.set(id, { key, stats });
    return stats;
  }

  /** Every declared portfolio on the daily clock. `monkey`: the random monkeys judged as one family. */
  views(now: number, monkey: number | null): PortfolioView[] {
    const rules = Object.entries(this.rules()), bar = rules.length / LIFECYCLE.ALONE_ALPHA;
    const agents = new Map(this.db.agents().map(a => [a.id, a]));
    return rules.map(([id, rule]) => {
      const state = this.state(id), picks = state?.picks ?? [], pick = picks.at(-1);
      const series = this.series(id, now), own = series.stats, past = this.backtest(id, now);
      const t = judgedT(own, past), e = eValue(t, own.n), days = state && pick ? Math.max(0, now - state.since) / DAY_MS : 0;
      let worth = 1;
      const curve = series.closes.map((c, i) => ({ t: c, value: (worth *= 1 + series.returns[i]!) - 1 }));
      const weight = pick?.members.reduce((n, m) => n + m.scale, 0) ?? 0;
      const members: PortfolioMember[] = (pick?.members ?? []).flatMap(m => {
        const run = this.db.run(m.id);
        if (!run) return [];
        const since = this.forward(m, now)[0], backtest = this.judging.backtestFor(run, now);
        let grown = 1, seen = 0;
        for (let i = 0; since && i < since.closes.length; i++) if (since.closes[i]! > pick!.at) { grown *= 1 + since.returns[i]!; seen++; }
        return [{ runId: run.id, agentId: run.agent_id, name: agents.get(run.agent_id)?.name ?? run.agent_id, epic: run.epic, leverage: run.leverage,
          share: weight > 0 ? m.scale / weight : 0, backtestSharpe: backtest?.rawSharpe ?? null, ret: seen ? grown - 1 : null }];
      }).sort((a, b) => b.share - a.share);
      const trades = picks.reduce((n, p, i) => n + p.members.reduce((k, m) => k + this.db.tradesEntered(m.id, p.at, picks[i + 1]?.at ?? Number.MAX_SAFE_INTEGER), 0), 0);
      const yearly = (s: DailyStats | null, floor = 0) => (s && s.n >= 2 && Math.max(s.sd, floor) > 0 ? (s.mean / Math.max(s.sd, floor)) * Math.sqrt(WEEKDAYS_PER_YEAR) : null);
      return {
        id, name: rule.name, minBacktestSharpe: rule.minBacktestSharpe, declared: rule.declared,
        since: pick ? state!.since : null, pickedAt: pick?.at ?? null,
        records: members.length, agents: new Set(members.map(m => m.agentId.split('/')[0])).size, markets: new Set(members.map(m => m.epic)).size, picks: picks.length,
        days, trades, observations: own.n, ret: worth - 1, t, e,
        sharpe: yearly(own, past?.sd ?? 0), backtestSharpe: yearly(past),
        monkey, backtestZ: agreementZ(own, past), trials: rules.length,
        confirmAt: own.n >= 2 ? tAt(bar, own.n) : null, confirmed: days >= LIFECYCLE.MIN_DAYS && e >= bar,
        confirmDays: { backtest: daysToBar(yearly(past), bar), half: daysToBar((yearly(past) ?? 0) / 2, bar) },
        curve, members,
      };
    });
  }
}
